# Guia de Setup — Friendly Miner Online (Supabase + Vercel + Extensão)

Este guia é o passo a passo dos ajustes **nas suas contas** (o código já está pronto).
Faça na ordem. Tempo estimado: ~30–40 min na primeira vez.

Você vai precisar de: conta Google, conta no [Supabase](https://supabase.com) (grátis) e
conta na [Vercel](https://vercel.com) (grátis).

---

## Parte 1 — Supabase (banco + login)

### 1.1 Criar o projeto
1. Entre em https://supabase.com → **New project**.
2. Dê um nome, escolha uma senha de banco (guarde) e a região **South America (São Paulo)**.
3. Espere ~2 min o projeto subir.

### 1.2 Criar as tabelas e funções
1. No menu lateral: **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste projeto, copie **tudo** e cole.
3. Clique em **Run**. Deve aparecer "Success". (Cria tabelas, RLS e as funções.)

### 1.3 Pegar as chaves
1. Menu: **Project Settings** (engrenagem) → **API**.
2. Anote dois valores:
   - **Project URL** → algo como `https://abcdxyz.supabase.co`
   - **anon public** (em "Project API keys") → uma chave longa `eyJ...`

### 1.4 Ligar o login com Google
O login Google precisa de credenciais no Google Cloud. É a parte mais chata, mas é uma vez só.

**a) Criar as credenciais no Google Cloud**
1. Abra https://console.cloud.google.com → crie/*selecione* um projeto.
2. Menu **APIs & Services** → **OAuth consent screen**:
   - Tipo: **External** → Create.
   - Preencha nome do app, e-mail de suporte e o seu e-mail. Salve (pode deixar em "Testing").
   - Em **Test users**, adicione os e-mails dos seus amigos (enquanto estiver em "Testing",
     só e-mails listados conseguem entrar). Para liberar geral, depois clique em **Publish app**.
3. Menu **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** → adicione exatamente:
     `https://SEU-PROJETO.supabase.co/auth/v1/callback`
     (troque pela sua Project URL da etapa 1.3).
   - Create. Copie o **Client ID** e o **Client secret**.

**b) Colar no Supabase**
1. No Supabase: **Authentication** → **Providers** → **Google**.
2. Ative, cole **Client ID** e **Client Secret**, e **Save**.

### 1.5 Configurar as URLs de redirecionamento
1. No Supabase: **Authentication** → **URL Configuration**.
2. Em **Site URL**, coloque (por enquanto) `http://localhost:3008`.
3. Em **Redirect URLs**, adicione (uma por linha):
   - `http://localhost:3008`
   - `https://SEU-APP.vercel.app` (você preenche depois de fazer o deploy — volte aqui)

---

## Parte 2 — Frontend na Vercel

### 2.1 Testar local (opcional, recomendado)
1. Em `frontend/.env`, preencha:
   ```
   REACT_APP_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=eyJ... (a anon public)
   ```
2. No terminal, dentro de `frontend`: `npm install` e `npm start`.
3. Abre em `http://localhost:3008`. Faça login com Google. Deve entrar no painel (vazio).

### 2.2 Deploy
1. Suba o projeto para o GitHub (a pasta `mapssearch-dashboard`).
2. Na Vercel: **Add New → Project** → importe o repositório.
   - **Root Directory**: `mapssearch-dashboard` (onde está o `vercel.json`).
   - O `vercel.json` já cuida de buildar o frontend.
3. Em **Environment Variables**, adicione:
   - `REACT_APP_SUPABASE_URL` = sua Project URL
   - `REACT_APP_SUPABASE_ANON_KEY` = sua anon public
4. **Deploy**. No fim, anote a URL final, ex.: `https://mapssearch-dashboard.vercel.app`.

### 2.3 Voltar no Supabase e liberar o domínio
1. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: troque para a URL da Vercel.
   - **Redirect URLs**: garanta que a URL da Vercel está lá.

---

## Parte 3 — Extensão do Chrome

### 3.1 Preencher a configuração
1. Abra [`extension/config.js`](extension/config.js) e preencha:
   ```js
   SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ... (anon public)',
   APP_URL: 'https://SEU-APP.vercel.app',
   ```
2. Abra [`extension/manifest.json`](extension/manifest.json). No **primeiro**
   bloco de `content_scripts` (o do `authBridge.js`), troque `https://mapssearch-dashboard.vercel.app/*`
   pela **sua** URL da Vercel (mantenha `http://localhost:3008/*` se for testar local).

### 3.2 Instalar
1. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecione a pasta `extension`.
3. A extensão aparece. (Para distribuir aos amigos: mande a pasta zipada ou publique na
   Chrome Web Store — veja "Distribuição" abaixo.)

---

## Parte 4 — Teste ponta a ponta

1. Abra o painel (Vercel) e **faça login com Google**. Deixe essa aba aberta.
2. Clique no ícone da extensão → deve mostrar **"Conectado: seu@gmail.com"** (bolinha verde).
3. Abra o **Google Maps**, pesquise "dentistas em São Paulo".
4. Use a extensão para **extrair** e depois **enviar**.
5. Volte ao painel → os leads devem aparecer no **Dashboard** e na aba **Prospecção**.
6. Faça login com **outro** Gmail em outro navegador e confirme que **não vê** os leads do primeiro.

Se algo falhar, veja "Diagnóstico" no fim.

---

## Distribuição para os amigos

- **Jeito fácil (privado):** compacte a pasta `extension` e mande. Cada um instala em
  `chrome://extensions` → Modo desenvolvedor → Carregar sem compactação.
- **Jeito profissional:** publique na Chrome Web Store (taxa única de US$5 de desenvolvedor).
  Some o "Modo desenvolvedor"; a extensão atualiza sozinha.
- Cada amigo só precisa: instalar a extensão + **fazer login uma vez** no painel. Os leads dele
  ficam só na conta dele (garantido pelo RLS).

---

## Custos (tudo grátis)

- **Supabase Free**: 500 MB de banco (centenas de milhares de leads), 50 mil usuários no login.
  Só "hiberna" após 7 dias sem uso — some com uso frequente.
- **Vercel Hobby**: 100 GB de banda/mês.
- **Extensão**: roda no PC de cada um. Sem custo de API do Google (não usa a Places API paga).

---

## Diagnóstico rápido

| Sintoma | Causa provável | Solução |
|---|---|---|
| Login não abre / erro `redirect_uri_mismatch` | URL de redirect errada no Google Cloud | Confirme `https://SEU-PROJETO.supabase.co/auth/v1/callback` nas credenciais |
| Entra no login e volta pra tela de login | Vercel domain não está em **Redirect URLs** do Supabase | Adicione a URL da Vercel lá |
| Extensão diz "Não conectado" | Não fez login no painel, ou domínio errado no manifest/config | Faça login no painel; confira `APP_URL` e o `matches` do manifest |
| Enviar dá "Erro 401/403" | Token expirado ou anon key errada | Reabra o painel logado; confira `SUPABASE_ANON_KEY` no `config.js` |
| Amigo vê leads de outro | RLS não aplicada | Rode de novo o `schema.sql` (as políticas RLS) |

---

## Próximo passo (futuro): plano pago

Quando quiser cobrar, a base já está pronta: cada lead tem `user_id` e cada busca fica
registrada. Falta só (1) uma tabela `usage` contando buscas por dia e um limite, e
(2) pagamento recorrente — no Brasil, **Mercado Pago** (Pix + assinatura). Ver seção 10 do
[`PLANO_SUPABASE.md`](PLANO_SUPABASE.md).
