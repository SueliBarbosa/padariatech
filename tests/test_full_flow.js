import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vxfcpkdcjhybbyljklhx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZmNwa2Rjamh5YmJ5bGprbGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4OTcwOTAsImV4cCI6MjEwOTQ3MzA5MH0.yTbGltFxihvWX8a1C59_2lWFY2JP7Tc4HIQyw41qYIs';

async function runTests() {
  console.log('================================================================');
  console.log('  BATERIA DE TESTES AUTOMATIZADOS PADARIATECH - SUPABASE POSTGRES');
  console.log('================================================================\n');
  let passed = 0;
  let failed = 0;

  function assert(cond, desc) {
    if (cond) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  const emailA = 'alunopadaria@teste.com';
  const emailB = 'concorrente@teste.com';
  const password = 'PadariaTech@2026';

  // 1. Teste de Login - Usuário A
  console.log('--- 1. AUTENTICAÇÃO COM SUPABASE AUTH ---');
  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: authA, error: errAuthA } = await clientA.auth.signInWithPassword({
    email: emailA,
    password: password
  });
  assert(!errAuthA && authA.user?.id, `Login do Usuário A realizado com sucesso (${authA.user?.email})`);

  // 2. Teste de Login - Usuário B
  const clientB = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: authB, error: errAuthB } = await clientB.auth.signInWithPassword({
    email: emailB,
    password: password
  });
  assert(!errAuthB && authB.user?.id, `Login do Usuário B realizado com sucesso (${authB.user?.email})`);

  // 3. Teste CRUD de Produtos (Usuário A)
  console.log('\n--- 2. CRUD DE PRODUTOS (USUÁRIO A) ---');
  const sufixo = Date.now().toString().slice(-4);
  const nomePao = `Pão Francês ${sufixo}`;
  const nomeBolo = `Bolo de Cenoura ${sufixo}`;

  const { data: prod1, error: errProd1 } = await clientA
    .from('produtos')
    .insert({
      nome: nomePao,
      categoria: 'Pães',
      preco: 1.50,
      estoque: 100,
      usuario_id: authA.user.id
    })
    .select()
    .single();

  assert(!errProd1 && prod1?.id, `Produto 1 cadastrado: "${prod1?.nome}" (Preço: R$ ${prod1?.preco}, Estoque: ${prod1?.estoque})`);

  const { data: prod2, error: errProd2 } = await clientA
    .from('produtos')
    .insert({
      nome: nomeBolo,
      categoria: 'Confeitaria',
      preco: 25.00,
      estoque: 10,
      usuario_id: authA.user.id
    })
    .select()
    .single();

  assert(!errProd2 && prod2?.id, `Produto 2 cadastrado: "${prod2?.nome}" (Preço: R$ ${prod2?.preco}, Estoque: ${prod2?.estoque})`);

  // Atualização de Produto
  const { data: prod1Up, error: errProd1Up } = await clientA
    .from('produtos')
    .update({ preco: 1.75 })
    .eq('id', prod1.id)
    .select()
    .single();

  assert(!errProd1Up && Number(prod1Up.preco) === 1.75, `Atualização de preço do Produto 1 para R$ ${prod1Up?.preco}`);

  // Consulta de Produtos
  const { data: listaA, error: errListaA } = await clientA
    .from('produtos')
    .select('*')
    .ilike('nome', `%${sufixo}%`);

  assert(!errListaA && listaA.length === 2, `Consulta de produtos filtrados retornou ${listaA?.length} itens pertencentes ao Usuário A`);

  // 4. Teste de Venda Transacional via RPC (registrar_venda)
  console.log('\n--- 3. TRANSAÇÃO DE VENDA VIA RPC (registrar_venda) ---');
  // Compra: 10 pães franceses (10 * 1.75 = 17.50) + 2 bolos (2 * 25.00 = 50.00) => Total = 67.50
  const itensVenda = [
    { produto_id: prod1.id, quantidade: 10 },
    { produto_id: prod2.id, quantidade: 2 }
  ];

  const { data: resVenda, error: errVenda } = await clientA.rpc('registrar_venda', {
    p_itens: itensVenda
  });

  assert(!errVenda && resVenda?.venda_id, `Venda #${resVenda?.venda_id} registrada com sucesso via Stored Procedure`);
  assert(Number(resVenda?.valor_total) === 67.50, `Valor total auditado pelo PostgreSQL: R$ ${Number(resVenda?.valor_total).toFixed(2)} (Esperado: R$ 67.50)`);

  // 5. Teste de Atualização Atômica de Estoque
  console.log('\n--- 4. ATUALIZAÇÃO ATÔMICA DE ESTOQUE ---');
  const { data: checkProd1 } = await clientA.from('produtos').select('estoque').eq('id', prod1.id).single();
  const { data: checkProd2 } = await clientA.from('produtos').select('estoque').eq('id', prod2.id).single();

  assert(checkProd1?.estoque === 90, `Estoque do Produto 1 atualizado corretamente: 100 - 10 = ${checkProd1?.estoque}`);
  assert(checkProd2?.estoque === 8, `Estoque do Produto 2 atualizado corretamente: 10 - 2 = ${checkProd2?.estoque}`);

  // 6. Teste de Bloqueio por Estoque Insuficiente (Rollback Transacional)
  console.log('\n--- 5. CONTROLE DE CONCORRÊNCIA E ROLLBACK TRANSACIONAL ---');
  const itensExcesso = [{ produto_id: prod2.id, quantidade: 50 }]; // Apenas 8 disponíveis
  const { data: resExcesso, error: errExcesso } = await clientA.rpc('registrar_venda', {
    p_itens: itensExcesso
  });

  assert(errExcesso !== null, `Venda acima do estoque bloqueada com erro esperado: "${errExcesso?.message}"`);

  // Verifica que o estoque não foi alterado após a tentativa inválida
  const { data: checkProd2PosRollback } = await clientA.from('produtos').select('estoque').eq('id', prod2.id).single();
  assert(checkProd2PosRollback?.estoque === 8, `Rollback garantido: estoque do produto permaneceu inalterado (${checkProd2PosRollback?.estoque})`);

  // 7. Teste de Integridade Referencial (ON DELETE RESTRICT)
  console.log('\n--- 6. INTEGRIDADE REFERENCIAL (ON DELETE RESTRICT) ---');
  const { error: errDelRestrict } = await clientA
    .from('produtos')
    .delete()
    .eq('id', prod1.id);

  assert(errDelRestrict !== null, 'Tentativa de exclusão de produto com histórico de vendas rejeitada pelo banco (ON DELETE RESTRICT OK)');

  // 8. Teste de Isolamento Multitenant via RLS
  console.log('\n--- 7. ISOLAMENTO MULTITENANT VIA ROW LEVEL SECURITY (RLS) ---');
  const { data: prodsB } = await clientB.from('produtos').select('*').eq('id', prod1.id);
  assert(prodsB.length === 0, `Usuário B NÃO consegue ler produtos do Usuário A (RLS OK - 0 linhas)`);

  const { data: vendasB } = await clientB.from('vendas').select('*').eq('id', resVenda.venda_id);
  assert(vendasB.length === 0, `Usuário B NÃO consegue ler vendas do Usuário A (RLS OK - 0 linhas)`);

  const { data: itensB } = await clientB.from('itens_venda').select('*').eq('venda_id', resVenda.venda_id);
  assert(itensB.length === 0, `Usuário B NÃO consegue ler itens de venda do Usuário A (RLS OK - 0 linhas)`);

  console.log('\n================================================================');
  console.log(`  RESULTADO FINAL: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log('================================================================\n');
}

runTests().catch(console.error);
