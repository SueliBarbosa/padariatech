import { initAuth, signInUser, signUpUser, signOutUser, getCurrentUser } from './auth.js';
import { listarProdutos, cadastrarProduto, atualizarProduto, excluirProduto, carregarDadosDeTeste } from './produtos.js';
import { finalizarVenda, listarVendas } from './vendas.js';
import { carregarMetricasDashboard } from './dashboard.js';

// Estado local da UI
let carrinho = [];
let produtoEmEdicao = null;
let produtosCache = [];

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();

  await initAuth((user) => {
    if (user) {
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('app-layout').style.display = 'flex';
      document.getElementById('user-email-display').textContent = user.email;
      navegarPara('dashboard');
    } else {
      document.getElementById('auth-section').style.display = 'flex';
      document.getElementById('app-layout').style.display = 'none';
    }
  });
});

// Configuração de eventos e listeners do DOM
function setupEventListeners() {
  // Alternar abas Login / Cadastro
  document.getElementById('tab-login-btn').addEventListener('click', () => alternarAbaAuth('login'));
  document.getElementById('tab-signup-btn').addEventListener('click', () => alternarAbaAuth('signup'));

  // Formulário de Login
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-submit-login');
    limparAlertas();

    try {
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      await signInUser(email, pass);
    } catch (err) {
      mostrarAlerta('auth-alert', err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  // Formulário de Cadastro
  document.getElementById('form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;
    const passConf = document.getElementById('signup-password-confirm').value;
    const btn = document.getElementById('btn-submit-signup');
    limparAlertas();

    if (pass !== passConf) {
      mostrarAlerta('auth-alert', 'As senhas não coincidem.', 'danger');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Cadastrando...';
      const data = await signUpUser(email, pass);
      if (data.user && !data.session) {
        mostrarAlerta('auth-alert', 'Cadastro realizado! Verifique sua caixa de e-mail para confirmar a conta.', 'warning');
      } else {
        mostrarAlerta('auth-alert', 'Cadastro realizado com sucesso!', 'success');
      }
    } catch (err) {
      mostrarAlerta('auth-alert', err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar Conta';
    }
  });

  // Botão de Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (err) {
      alert('Erro ao sair: ' + err.message);
    }
  });

  // Navegação da barra lateral
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      navegarPara(view);

      // Fecha sidebar no mobile ao clicar
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Menu móvel toggle
  document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Busca de produtos com debounce
  let debounceBusca = null;
  document.getElementById('busca-produto').addEventListener('input', (e) => {
    clearTimeout(debounceBusca);
    debounceBusca = setTimeout(() => {
      carregarTabelaProdutos(e.target.value);
    }, 300);
  });

  // Modal Novo / Editar Produto
  document.getElementById('btn-novo-produto').addEventListener('click', () => abrirModalProduto());
  document.getElementById('modal-close-produto').addEventListener('click', () => fecharModalProduto());
  document.getElementById('btn-cancelar-produto').addEventListener('click', () => fecharModalProduto());

  document.getElementById('form-produto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('prod-nome').value;
    const categoria = document.getElementById('prod-categoria').value;
    const preco = document.getElementById('prod-preco').value;
    const estoque = document.getElementById('prod-estoque').value;
    const btn = document.getElementById('btn-salvar-produto');

    try {
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      if (produtoEmEdicao) {
        await atualizarProduto(produtoEmEdicao.id, { nome, categoria, preco, estoque });
      } else {
        await cadastrarProduto({ nome, categoria, preco, estoque });
      }

      fecharModalProduto();
      await carregarTabelaProdutos();
    } catch (err) {
      mostrarAlerta('modal-prod-alert', err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  });

  // Botão Carga de Dados de Teste
  document.getElementById('btn-dados-teste').addEventListener('click', async () => {
    if (!confirm('Deseja carregar a lista de produtos de exemplo para sua padaria?')) return;
    try {
      const res = await carregarDadosDeTeste();
      alert(res.mensagem);
      await carregarTabelaProdutos();
    } catch (err) {
      alert(err.message);
    }
  });

  // PDV: Adicionar item ao carrinho
  document.getElementById('form-pdv-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const select = document.getElementById('pdv-select-produto');
    const prodId = parseInt(select.value, 10);
    const qtd = parseInt(document.getElementById('pdv-quantidade').value, 10);

    if (!prodId || isNaN(qtd) || qtd <= 0) return;

    const produto = produtosCache.find(p => p.id === prodId);
    if (!produto) return;

    if (qtd > produto.estoque) {
      alert(`Quantidade indisponível. Estoque atual: ${produto.estoque}`);
      return;
    }

    const itemExistente = carrinho.find(item => item.produto_id === prodId);
    if (itemExistente) {
      if (itemExistente.quantidade + qtd > produto.estoque) {
        alert(`Não é possível adicionar. O total no carrinho excederia o estoque de ${produto.estoque}.`);
        return;
      }
      itemExistente.quantidade += qtd;
    } else {
      carrinho.push({
        produto_id: produto.id,
        nome: produto.nome,
        preco: Number(produto.preco),
        quantidade: qtd
      });
    }

    document.getElementById('pdv-quantidade').value = 1;
    renderizarCarrinho();
  });

  // PDV: Limpar carrinho
  document.getElementById('btn-limpar-carrinho').addEventListener('click', () => {
    carrinho = [];
    renderizarCarrinho();
  });

  // PDV: Finalizar venda
  document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
    if (carrinho.length === 0) return;
    const btn = document.getElementById('btn-finalizar-venda');

    try {
      btn.disabled = true;
      btn.textContent = 'Processando venda...';

      const res = await finalizarVenda(carrinho);
      alert(`${res.mensagem}\nCódigo da Venda: #${res.venda_id}\nTotal: R$ ${Number(res.valor_total).toFixed(2)}`);

      carrinho = [];
      renderizarCarrinho();
      await atualizarDadosPDV();
    } catch (err) {
      alert('Erro ao finalizar venda: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar Venda';
    }
  });

  // Modal Detalhes da Venda no Histórico
  document.getElementById('modal-close-venda').addEventListener('click', () => {
    document.getElementById('modal-detalhes-venda').classList.remove('active');
  });
}

// Roteador simples da aplicação
export async function navegarPara(view) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
  if (activeLink) activeLink.classList.add('active');

  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(`section-${view}`);
  if (targetSection) targetSection.classList.add('active');

  if (view === 'dashboard') {
    await renderizarDashboard();
  } else if (view === 'produtos') {
    await carregarTabelaProdutos();
  } else if (view === 'vendas') {
    await atualizarDadosPDV();
  } else if (view === 'historico') {
    await carregarHistoricoVendas();
  }
}

// Funções de Renderização das Telas

async function renderizarDashboard() {
  try {
    const dados = await carregarMetricasDashboard();
    document.getElementById('dash-faturamento').textContent = `R$ ${dados.faturamentoTotal.toFixed(2)}`;
    document.getElementById('dash-vendas-qtd').textContent = dados.totalVendasQtd;
    document.getElementById('dash-produtos-qtd').textContent = dados.totalProdutos;
    document.getElementById('dash-estoque-baixo-qtd').textContent = dados.qtdEstoqueBaixo;

    const tbody = document.getElementById('dash-ultimas-vendas-corpo');
    if (dados.ultimasVendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">Nenhuma venda registrada ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = dados.ultimasVendas.map(v => `
      <tr>
        <td>#${v.id}</td>
        <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
        <td><strong>R$ ${Number(v.valor_total).toFixed(2)}</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao atualizar dashboard:', err);
  }
}

async function carregarTabelaProdutos(filtro = '') {
  const tbody = document.getElementById('tabela-produtos-corpo');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando produtos...</td></tr>';

  try {
    const produtos = await listarProdutos(filtro);
    produtosCache = produtos;

    if (produtos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Nenhum produto cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = produtos.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.nome)}</strong></td>
        <td><span class="badge" style="background:#EBDCCB; color:#4A2E18;">${escapeHtml(p.categoria)}</span></td>
        <td>R$ ${Number(p.preco).toFixed(2)}</td>
        <td>
          <span class="badge ${p.estoque <= 15 ? 'badge-danger' : 'badge-success'}">
            ${p.estoque} un
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.editarProduto(${p.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="window.removerProduto(${p.id}, '${escapeHtml(p.nome)}')">Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">${err.message}</td></tr>`;
  }
}

async function atualizarDadosPDV() {
  const select = document.getElementById('pdv-select-produto');
  select.innerHTML = '<option value="">Carregando produtos...</option>';

  try {
    produtosCache = await listarProdutos();
    const disponiveis = produtosCache.filter(p => p.estoque > 0);

    if (disponiveis.length === 0) {
      select.innerHTML = '<option value="">Nenhum produto disponível em estoque</option>';
      return;
    }

    select.innerHTML = '<option value="">Selecione um produto...</option>' + disponiveis.map(p => `
      <option value="${p.id}">${escapeHtml(p.nome)} - R$ ${Number(p.preco).toFixed(2)} (Estoque: ${p.estoque})</option>
    `).join('');
  } catch (err) {
    select.innerHTML = `<option value="">Erro ao carregar: ${err.message}</option>`;
  }
}

function renderizarCarrinho() {
  const container = document.getElementById('pdv-carrinho-itens');
  const totalDisplay = document.getElementById('pdv-total-carrinho');
  const btnFinalizar = document.getElementById('btn-finalizar-venda');

  if (carrinho.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">Carrinho vazio.</p>';
    totalDisplay.textContent = 'R$ 0,00';
    btnFinalizar.disabled = true;
    return;
  }

  let total = 0;
  container.innerHTML = carrinho.map((item, index) => {
    const subtotal = item.preco * item.quantidade;
    total += subtotal;
    return `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(item.nome)}</strong><br>
          <small>${item.quantidade}x R$ ${item.preco.toFixed(2)} = R$ ${subtotal.toFixed(2)}</small>
        </div>
        <button class="btn btn-danger btn-sm" style="padding: 2px 8px;" onclick="window.removerItemCarrinho(${index})">&times;</button>
      </div>
    `;
  }).join('');

  totalDisplay.textContent = `R$ ${total.toFixed(2)}`;
  btnFinalizar.disabled = false;
}

async function carregarHistoricoVendas() {
  const tbody = document.getElementById('tabela-historico-corpo');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando histórico...</td></tr>';

  try {
    const vendas = await listarVendas();
    if (vendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Nenhuma venda registrada.</td></tr>';
      return;
    }

    tbody.innerHTML = vendas.map(v => `
      <tr>
        <td>#${v.id}</td>
        <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
        <td><strong>R$ ${Number(v.valor_total).toFixed(2)}</strong></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick='window.verDetalhesVenda(${JSON.stringify(v)})'>Ver Itens</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger); text-align:center;">${err.message}</td></tr>`;
  }
}

// Funções globais de apoio expostas ao escopo window para eventos inline
window.editarProduto = (id) => {
  const p = produtosCache.find(item => item.id === id);
  if (!p) return;
  abrirModalProduto(p);
};

window.removerProduto = async (id, nome) => {
  if (!confirm(`Tem certeza que deseja excluir o produto "${nome}"?`)) return;
  try {
    await excluirProduto(id);
    await carregarTabelaProdutos();
  } catch (err) {
    alert(err.message);
  }
};

window.removerItemCarrinho = (index) => {
  carrinho.splice(index, 1);
  renderizarCarrinho();
};

window.verDetalhesVenda = (venda) => {
  document.getElementById('detalhe-venda-id').textContent = `#${venda.id}`;
  document.getElementById('detalhe-venda-data').textContent = new Date(venda.data_venda).toLocaleString('pt-BR');
  document.getElementById('detalhe-venda-total').textContent = `R$ ${Number(venda.valor_total).toFixed(2)}`;

  const itensTbody = document.getElementById('detalhe-venda-itens-corpo');
  const itens = venda.itens_venda || [];

  itensTbody.innerHTML = itens.map(item => `
    <tr>
      <td>${escapeHtml(item.produtos?.nome || 'Produto')}</td>
      <td>${item.quantidade}</td>
      <td>R$ ${Number(item.preco_unitario).toFixed(2)}</td>
      <td>R$ ${Number(item.subtotal).toFixed(2)}</td>
    </tr>
  `).join('');

  document.getElementById('modal-detalhes-venda').classList.add('active');
};

function abrirModalProduto(prod = null) {
  produtoEmEdicao = prod;
  limparAlertas();
  const form = document.getElementById('form-produto');
  form.reset();

  if (prod) {
    document.getElementById('modal-prod-titulo').textContent = 'Editar Produto';
    document.getElementById('prod-nome').value = prod.nome;
    document.getElementById('prod-categoria').value = prod.categoria;
    document.getElementById('prod-preco').value = prod.preco;
    document.getElementById('prod-estoque').value = prod.estoque;
  } else {
    document.getElementById('modal-prod-titulo').textContent = 'Novo Produto';
  }

  document.getElementById('modal-produto').classList.add('active');
}

function fecharModalProduto() {
  document.getElementById('modal-produto').classList.remove('active');
  produtoEmEdicao = null;
}

function alternarAbaAuth(aba) {
  limparAlertas();
  if (aba === 'login') {
    document.getElementById('tab-login-btn').classList.add('active');
    document.getElementById('tab-signup-btn').classList.remove('active');
    document.getElementById('form-login').style.display = 'block';
    document.getElementById('form-signup').style.display = 'none';
  } else {
    document.getElementById('tab-signup-btn').classList.add('active');
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-signup').style.display = 'block';
  }
}

function mostrarAlerta(id, mensagem, tipo = 'danger') {
  const el = document.getElementById(id);
  el.className = `alert alert-${tipo}`;
  el.textContent = mensagem;
  el.style.display = 'block';
}

function limparAlertas() {
  document.querySelectorAll('.alert').forEach(a => {
    a.style.display = 'none';
    a.textContent = '';
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
