import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

// Lista todos os produtos pertencentes ao usuário autenticado (protegido por RLS)
export async function listarProdutos(filtroNome = '') {
  let query = supabase
    .from('produtos')
    .select('*')
    .order('nome', { ascending: true });

  if (filtroNome && filtroNome.trim() !== '') {
    query = query.ilike('nome', `%${filtroNome.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('Erro ao listar produtos: ' + error.message);
  }
  return data || [];
}

// Cadastra um novo produto
export async function cadastrarProduto({ nome, categoria, preco, estoque }) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  // Validações de negócio no frontend
  if (!nome || nome.trim() === '') throw new Error('O nome do produto é obrigatório.');
  if (!categoria || categoria.trim() === '') throw new Error('A categoria é obrigatória.');
  
  const precoNum = Number(preco);
  const estoqueNum = parseInt(estoque, 10);

  if (isNaN(precoNum) || precoNum <= 0) throw new Error('O preço deve ser maior que zero.');
  if (isNaN(estoqueNum) || estoqueNum < 0) throw new Error('O estoque não pode ser negativo.');

  const { data, error } = await supabase
    .from('produtos')
    .insert([{
      nome: nome.trim(),
      categoria: categoria.trim(),
      preco: precoNum,
      estoque: estoqueNum,
      usuario_id: user.id
    }])
    .select()
    .single();

  if (error) {
    throw new Error('Erro ao salvar produto: ' + error.message);
  }
  return data;
}

// Atualiza um produto existente
export async function atualizarProduto(id, { nome, categoria, preco, estoque }) {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (!nome || nome.trim() === '') throw new Error('O nome do produto é obrigatório.');
  if (!categoria || categoria.trim() === '') throw new Error('A categoria é obrigatória.');
  
  const precoNum = Number(preco);
  const estoqueNum = parseInt(estoque, 10);

  if (isNaN(precoNum) || precoNum <= 0) throw new Error('O preço deve ser maior que zero.');
  if (isNaN(estoqueNum) || estoqueNum < 0) throw new Error('O estoque não pode ser negativo.');

  const { data, error } = await supabase
    .from('produtos')
    .update({
      nome: nome.trim(),
      categoria: categoria.trim(),
      preco: precoNum,
      estoque: estoqueNum
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error('Erro ao atualizar produto: ' + error.message);
  }
  return data;
}

// Exclui um produto (com restrição de integridade referencial caso já tenha vendas)
export async function excluirProduto(id) {
  const { error } = await supabase
    .from('produtos')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503' || error.message.includes('violates foreign key constraint')) {
      throw new Error('Este produto possui vendas registradas e não pode ser excluído por razões fiscais e contábeis.');
    }
    throw new Error('Erro ao excluir produto: ' + error.message);
  }
  return true;
}

// Carga de dados de teste (sem duplicar nomes existentes)
export async function carregarDadosDeTeste() {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const produtosExemplo = [
    { nome: 'Pão francês', categoria: 'Pães', preco: 1.00, estoque: 100 },
    { nome: 'Pão de queijo', categoria: 'Pães', preco: 4.50, estoque: 40 },
    { nome: 'Café expresso', categoria: 'Bebidas', preco: 5.00, estoque: 30 },
    { nome: 'Bolo de chocolate', categoria: 'Confeitaria', preco: 35.00, estoque: 8 },
    { nome: 'Croissant', categoria: 'Pães Especiais', preco: 8.50, estoque: 20 },
    { nome: 'Sonho', categoria: 'Confeitaria', preco: 6.00, estoque: 15 },
    { nome: 'Leite integral', categoria: 'Bebidas', preco: 6.50, estoque: 25 },
    { nome: 'Sanduíche natural', categoria: 'Lanches', preco: 12.00, estoque: 12 }
  ];

  // Busca produtos existentes para evitar duplicação por nome
  const existentes = await listarProdutos();
  const nomesExistentes = new Set(existentes.map(p => p.nome.toLowerCase().trim()));

  const novos = produtosExemplo
    .filter(p => !nomesExistentes.has(p.nome.toLowerCase().trim()))
    .map(p => ({ ...p, usuario_id: user.id }));

  if (novos.length === 0) {
    return { count: 0, mensagem: 'Todos os produtos de exemplo já estão cadastrados.' };
  }

  const { data, error } = await supabase
    .from('produtos')
    .insert(novos)
    .select();

  if (error) {
    throw new Error('Erro ao carregar exemplos: ' + error.message);
  }

  return { count: data.length, mensagem: `${data.length} produtos de exemplo adicionados com sucesso!` };
}
