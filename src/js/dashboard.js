import { supabase } from './supabaseClient.js';

// Carrega os dados reais do Dashboard a partir do Supabase
export async function carregarMetricasDashboard() {
  // 1. Total de produtos e produtos com estoque baixo (ex: estoque <= 15)
  const { data: produtos, error: errProd } = await supabase
    .from('produtos')
    .select('id, nome, estoque');

  if (errProd) throw new Error('Erro ao obter produtos para o dashboard: ' + errProd.message);

  const totalProdutos = produtos?.length || 0;
  const produtosEstoqueBaixo = produtos?.filter(p => p.estoque <= 15) || [];

  // 2. Total de vendas e faturamento acumulado
  const { data: vendas, error: errVendas } = await supabase
    .from('vendas')
    .select('id, data_venda, valor_total')
    .order('data_venda', { ascending: false });

  if (errVendas) throw new Error('Erro ao obter vendas para o dashboard: ' + errVendas.message);

  const totalVendasQtd = vendas?.length || 0;
  const faturamentoTotal = (vendas || []).reduce((acc, v) => acc + Number(v.valor_total || 0), 0);

  // 3. Últimas 5 vendas
  const ultimasVendas = (vendas || []).slice(0, 5);

  return {
    totalProdutos,
    qtdEstoqueBaixo: produtosEstoqueBaixo.length,
    produtosEstoqueBaixo,
    totalVendasQtd,
    faturamentoTotal,
    ultimasVendas
  };
}
