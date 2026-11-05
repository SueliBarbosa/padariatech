import { supabase } from './supabaseClient.js';

// Finaliza a venda chamando a RPC transacional segura no PostgreSQL
export async function finalizarVenda(itensCarrinho) {
  if (!itensCarrinho || itensCarrinho.length === 0) {
    throw new Error('O carrinho de compras está vazio.');
  }

  // Prepara o payload com produto_id e quantidade (o preço é auditado pelo banco)
  const payload = itensCarrinho.map(item => ({
    produto_id: item.produto_id,
    quantidade: parseInt(item.quantidade, 10)
  }));

  const { data, error } = await supabase.rpc('registrar_venda', {
    p_itens: payload
  });

  if (error) {
    throw new Error('Falha ao processar venda: ' + error.message);
  }

  return data;
}

// Lista o histórico de vendas do usuário autenticado (protegido por RLS)
export async function listarVendas() {
  const { data, error } = await supabase
    .from('vendas')
    .select(`
      id,
      data_venda,
      valor_total,
      itens_venda (
        id,
        quantidade,
        preco_unitario,
        subtotal,
        produtos (
          nome,
          categoria
        )
      )
    `)
    .order('data_venda', { ascending: false });

  if (error) {
    throw new Error('Erro ao buscar histórico de vendas: ' + error.message);
  }

  return data || [];
}
