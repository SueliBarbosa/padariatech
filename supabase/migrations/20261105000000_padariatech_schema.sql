-- ====================================================================
-- MIGRAÇÃO PADARIATECH: TABELAS, RLS E TRANSAÇÃO DE VENDAS
-- ====================================================================

-- 1. TABELA: produtos
CREATE TABLE IF NOT EXISTS public.produtos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    categoria VARCHAR(60) NOT NULL,
    preco NUMERIC(10,2) NOT NULL CHECK (preco > 0),
    estoque INTEGER NOT NULL CHECK (estoque >= 0),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices para produtos
CREATE INDEX IF NOT EXISTS idx_produtos_usuario ON public.produtos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON public.produtos(nome);

-- 2. TABELA: vendas
CREATE TABLE IF NOT EXISTS public.vendas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_venda TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    valor_total NUMERIC(10,2) NOT NULL CHECK (valor_total >= 0),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índices para vendas
CREATE INDEX IF NOT EXISTS idx_vendas_usuario ON public.vendas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON public.vendas(data_venda DESC);

-- 3. TABELA: itens_venda
CREATE TABLE IF NOT EXISTS public.itens_venda (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venda_id BIGINT NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
    produto_id BIGINT NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario > 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0)
);

-- Índices para itens_venda
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda ON public.itens_venda(venda_id);
CREATE INDEX IF NOT EXISTS idx_itens_venda_produto ON public.itens_venda(produto_id);

-- ====================================================================
-- SEGURANÇA: ROW LEVEL SECURITY (RLS)
-- ====================================================================

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;

-- Políticas para produtos (CRUD completo restrito ao dono)
DROP POLICY IF EXISTS "produtos_select_policy" ON public.produtos;
CREATE POLICY "produtos_select_policy" ON public.produtos
    FOR SELECT TO authenticated
    USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "produtos_insert_policy" ON public.produtos;
CREATE POLICY "produtos_insert_policy" ON public.produtos
    FOR INSERT TO authenticated
    WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "produtos_update_policy" ON public.produtos;
CREATE POLICY "produtos_update_policy" ON public.produtos
    FOR UPDATE TO authenticated
    USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "produtos_delete_policy" ON public.produtos;
CREATE POLICY "produtos_delete_policy" ON public.produtos
    FOR DELETE TO authenticated
    USING (usuario_id = auth.uid());

-- Políticas para vendas (Leitura restrita ao dono da venda)
DROP POLICY IF EXISTS "vendas_select_policy" ON public.vendas;
CREATE POLICY "vendas_select_policy" ON public.vendas
    FOR SELECT TO authenticated
    USING (usuario_id = auth.uid());

-- Políticas para itens_venda (Leitura baseada na posse da venda pai)
DROP POLICY IF EXISTS "itens_venda_select_policy" ON public.itens_venda;
CREATE POLICY "itens_venda_select_policy" ON public.itens_venda
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.vendas v
            WHERE v.id = itens_venda.venda_id
              AND v.usuario_id = auth.uid()
        )
    );

-- ====================================================================
-- FUNÇÃO RPC TRANSACIONAL: registrar_venda
-- ====================================================================
CREATE OR REPLACE FUNCTION public.registrar_venda(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_usuario_id UUID;
    v_item RECORD;
    v_produto RECORD;
    v_venda_id BIGINT;
    v_valor_total NUMERIC(10,2) := 0;
    v_subtotal NUMERIC(10,2);
BEGIN
    -- 1. Identificar usuário autenticado
    v_usuario_id := auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Acesso não autorizado: usuário não autenticado.';
    END IF;

    -- 2. Validar que o carrinho não está vazio
    IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'O carrinho de compras está vazio.';
    END IF;

    -- 3. Inserir registro inicial da venda com total zerado
    INSERT INTO public.vendas (valor_total, usuario_id)
    VALUES (0, v_usuario_id)
    RETURNING id INTO v_venda_id;

    -- 4. Iterar sobre cada item do carrinho com lock pessimista (FOR UPDATE)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_itens) AS x(produto_id BIGINT, quantidade INTEGER)
    LOOP
        IF v_item.quantidade IS NULL OR v_item.quantidade <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida para o produto id %.', v_item.produto_id;
        END IF;

        -- Bloqueia a linha do produto e valida a posse e estoque
        SELECT * INTO v_produto
        FROM public.produtos
        WHERE id = v_item.produto_id AND usuario_id = v_usuario_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado ou não pertence ao usuário (id: %).', v_item.produto_id;
        END IF;

        IF v_produto.estoque < v_item.quantidade THEN
            RAISE EXCEPTION 'Estoque insuficiente para o produto "%" (Disponível: %, Solicitado: %).',
                v_produto.nome, v_produto.estoque, v_item.quantidade;
        END IF;

        -- Calcula subtotal usando o preço do banco (preço histórico)
        v_subtotal := ROUND((v_produto.preco * v_item.quantidade)::NUMERIC, 2);
        v_valor_total := v_valor_total + v_subtotal;

        -- Insere o item da venda
        INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
        VALUES (v_venda_id, v_item.produto_id, v_item.quantidade, v_produto.preco, v_subtotal);

        -- Deduz o estoque
        UPDATE public.produtos
        SET estoque = estoque - v_item.quantidade
        WHERE id = v_item.produto_id;
    END LOOP;

    -- 5. Atualiza o total final da venda
    UPDATE public.vendas
    SET valor_total = v_valor_total
    WHERE id = v_venda_id;

    -- 6. Retorna o resultado para o frontend
    RETURN jsonb_build_object(
        'venda_id', v_venda_id,
        'valor_total', v_valor_total,
        'mensagem', 'Venda registrada com sucesso!'
    );
END;
$$;

-- Revoga execução pública e concede apenas a usuários autenticados
REVOKE EXECUTE ON FUNCTION public.registrar_venda(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venda(JSONB) TO authenticated;
