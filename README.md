# PadariaTech 🥖

Sistema Integrado de Gestão e Frente de Caixa (PDV) para Padarias, desenvolvido como atividade prática do curso Técnico em Desenvolvimento de Sistemas.

## 🎯 Objetivo Educacional

Demonstrar a construção de uma aplicação moderna, responsiva e segura sem a sobrecarga de frameworks complexos, explorando:
- Arquitetura SPA em JavaScript ES6+ modular com bundler **Vite**.
- Persistência e autenticação com **Supabase** e **PostgreSQL**.
- Segurança rigorosa com **Row Level Security (RLS)** multitenant por usuário.
- Controle de concorrência e integridade referencial com **Stored Procedures (RPC)** em PL/pgSQL com locks pessimistas (`SELECT ... FOR UPDATE`).
- Publicação contínua na **Vercel** e versionamento profissional no **GitHub**.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5 semântico, CSS3 moderno (Custom Properties, Flexbox, Grid), JavaScript (ES Modules).
- **Bundler:** Vite.
- **Banco de Dados & Auth:** Supabase (PostgreSQL 15+ com RLS e Functions PL/pgSQL).
- **Hospedagem:** Vercel.
- **Controle de Versão:** Git e GitHub.

---

## 📐 Arquitetura e Modelo de Dados

### Tabelas Principais
1. `produtos`: Cadastro do catálogo de produtos com preço, estoque e vínculo ao `usuario_id` (`auth.users`).
2. `vendas`: Registro do cabeçalho da venda (data, valor total calculado no banco e `usuario_id`).
3. `itens_venda`: Detalhamento dos itens vendidos preservando o preço histórico unitário no momento da compra e integridade referencial (`ON DELETE RESTRICT`).

### Segurança e RLS
- Todas as tabelas possuem `ENABLE ROW LEVEL SECURITY`.
- Políticas garantem que nenhum usuário acesse produtos, vendas ou métricas de outro usuário (`usuario_id = auth.uid()`).
- O registro de vendas é atômico e transacional via função PostgreSQL `registrar_venda(p_itens JSONB)`.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js (v18+) e npm.

### Passo a passo
1. Clone o repositório:
   ```bash
   git clone https://github.com/SueliBarbosa/padariatech.git
   cd padariatech
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente:
   - Duplique o arquivo `.env.example` e renomeie para `.env`.
   - Preencha com os dados do seu projeto Supabase:
     ```env
     VITE_SUPABASE_URL=https://seu-projeto.supabase.co
     VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-anon-publica
     ```
4. Aplique a migração no seu banco Supabase:
   - Execute o script contido em `supabase/migrations/20261105000000_padariatech_schema.sql` no **SQL Editor** do Supabase.
5. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
6. Para gerar o build de produção:
   ```bash
   npm run build
   ```

---

## 📦 Versão
- **v1.0.0** — Release inicial funcional com autenticação, catálogo, frente de caixa (PDV), dashboard e histórico.
