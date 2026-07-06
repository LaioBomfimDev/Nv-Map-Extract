# Plano: Friendly Miner Online (Extensão → Supabase → Vercel)

**Objetivo:** amigos abrem um site (Vercel), fazem login com Google, e cada um vê os
próprios leads. A mineração roda de graça na extensão do navegador de cada um (IP
residencial → sem bloqueio, sem custo de API). Ver os leads funciona até no celular.

**Custo:** R$ 0. Sem API paga do Google. Supabase grátis + Vercel grátis.

---

## 1. Visão geral da arquitetura

```
  ┌─────────────────────────────┐
  │  Amigo no PC (Chrome)        │
  │  ┌───────────────────────┐   │
  │  │ Extensão Friendly Miner│  │  minera o Google Maps com o IP
  │  │  - contentScript: raspa│  │  residencial da pessoa (grátis,
  │  │  - bg.js: enriquece    │  │  sem bloqueio)
  │  └───────────┬───────────┘   │
  └──────────────┼───────────────┘
                 │ grava leads (com o token do usuário)
                 ▼
        ┌──────────────────┐        login Google (OAuth nativo)
        │    SUPABASE      │◀───────────────────────────────┐
        │  Auth + Postgres │                                │
        │  (RLS por user)  │──────── leads do usuário ──────┤
        └──────────────────┘                                │
                                                    ┌────────┴────────┐
                                                    │ Dashboard React  │
                                                    │  na VERCEL       │
                                                    │  (PC ou celular) │
                                                    └──────────────────┘
```

Três peças, todas grátis:

| Peça | Papel | Plano grátis |
|---|---|---|
| **Extensão Chrome** (já existe) | Minera + enriquece no PC do usuário | Sempre grátis |
| **Supabase** | Login Google + banco Postgres + isolamento por usuário (RLS) | Free tier |
| **Vercel** | Serve o dashboard React (ver/gerenciar leads) | Hobby |

O que **deixa de existir:** o backend Node/Express, o Puppeteer e o SQLite. A extensão
já faz o trabalho de mineração; o Supabase já faz o de banco. O backend vira redundante.

---

## 2. Por que isso funciona (e é pouco código)

Descobertas ao ler o código atual:

- **A extensão já captura tudo.** `contentScript.js` raspa o Maps e monta cada lead com
  `name, phone, website, address, instagram, facebook, linkedin, twitter, youtube, ...`.
- **A extensão já enriquece sozinha.** `bg.js` tem as ações `email`/`access` que visitam
  o site do lead pelo service worker e extraem e-mail/redes. **Não precisa de backend pra isso.**
- **O único elo com o backend local** é `bg.js → sendToDashboard → POST localhost:5000/api/upload-direct`.
  É só esse ponto que muda: em vez de mandar pro localhost, manda pro Supabase.
- **O frontend fala com o backend por um só arquivo:** `frontend/src/api/index.js` expõe um
  objeto `api` com ~20 funções (`getSearches`, `getLeads`, `updateLead`, `bulkDelete`, ...).
  Os componentes React chamam só esse `api`. Trocando a implementação dessas 20 funções por
  chamadas ao Supabase, **os componentes não mudam.**

---

## 3. Modelo de dados no Supabase

Espelha o SQLite atual, adicionando `user_id` (dono do lead) em tudo. RLS garante que cada
pessoa só enxerga o que é seu.

**Tabela `searches`** (uma linha por mineração feita)
- `id` uuid pk
- `user_id` uuid → auth.users (dono)
- `keyword`, `city`, `source` ('extensao')
- `created_at`

**Tabela `results`** (os leads) — mesmos campos de hoje + dono:
- `id` uuid pk
- `search_id` uuid → searches
- `user_id` uuid → auth.users
- `name, address, phone, website, category`
- `rating, reviews_count, latitude, longitude`
- `place_id, cid`  ← usados pra deduplicar
- `email, instagram, facebook, linkedin, twitter, youtube`
- `prospect_status` (default 'novo'), `notes`, `last_contact_at`
- `created_at`

**RLS (o coração do "cada gmail com seus leads")** — em ambas as tabelas:
```sql
alter table results enable row level security;

create policy "dono lê" on results
  for select using (auth.uid() = user_id);
create policy "dono insere" on results
  for insert with check (auth.uid() = user_id);
create policy "dono atualiza" on results
  for update using (auth.uid() = user_id);
create policy "dono apaga" on results
  for delete using (auth.uid() = user_id);
```
Com isso, mesmo que alguém tente ler leads de outro, o banco recusa. Segurança no banco,
não no código.

**Dedupe:** índice único `(user_id, place_id)` pra não duplicar o mesmo estabelecimento
pro mesmo usuário.

---

## 4. A parte que exige cuidado: identidade da extensão

Este é o único ponto realmente delicado. A extensão precisa saber **qual usuário** está
mandando os leads, pra caírem na conta certa.

**Mecanismo recomendado (login só no site, extensão pega carona):**

1. O amigo faz login com Google **no site (Vercel)**. O `supabase-js` guarda a sessão no
   `localStorage` daquele domínio (chave `sb-<projeto>-auth-token`).
2. A extensão injeta um pequeno content script **no domínio da Vercel** que lê esse token do
   `localStorage` da página (content script tem acesso ao `localStorage` da origem em que roda)
   e manda pro `bg.js`, que guarda no `chrome.storage`.
3. Quando o amigo minera no Maps, o `bg.js` usa esse token como `Authorization: Bearer` ao
   inserir no Supabase. O RLS aplica a identidade automaticamente.

**Vantagem:** o amigo loga **uma vez no site** e a extensão "se casa" com a conta sozinha.
Sem tela de login própria na extensão.

**Detalhe técnico:** o token expira (~1h) mas o supabase-js renova sozinho no site. A extensão
relê o token atualizado sempre que a aba da Vercel estiver aberta. Alternativa mais robusta
(fase 2): a extensão fazer o próprio OAuth via `chrome.identity.launchWebAuthFlow`. Começaria
pelo jeito simples.

---

## 5. Mudanças arquivo por arquivo

### Extensão (`extension/`)
- **`manifest.json`** [MODIFY]
  - Adicionar o domínio da Vercel aos `content_scripts` (pro novo script de auth).
  - Adicionar a URL do Supabase (`https://<projeto>.supabase.co/*`) aos `host_permissions`.
- **`authBridge.js`** [NEW]
  - Content script que roda **no domínio da Vercel**, lê a sessão do Supabase no `localStorage`
    e envia pro `bg.js` guardar.
- **`bg.js`** [MODIFY]
  - Trocar `sendToDashboard`: em vez de `POST localhost:5000/api/upload-direct`, inserir em
    `searches` + `results` via REST do Supabase (`POST /rest/v1/...`), com o `Bearer` token do
    usuário e a `apikey` anon do projeto. Marcar `user_id`.
  - Manter as ações `email`/`access` (enriquecimento) como estão.
- **`popup.js` / `popup.html`** [MODIFY]
  - Trocar o campo "URL do dashboard/localhost" por um status: "Conectado como fulano@gmail
    ✅" ou "Abra o site e faça login". Some a configuração de porta 5000.

### Frontend (`frontend/`)
- **Adicionar `@supabase/supabase-js`** e um `supabaseClient.js` com URL + anon key
  (via `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` nas env vars da Vercel).
- **Tela de login** [NEW] — botão "Entrar com Google" (`supabase.auth.signInWithOAuth`).
  Um "gate": sem sessão, mostra login; com sessão, mostra o app.
- **`api/index.js`** [MODIFY] — reimplementar as ~20 funções do objeto `api` usando o cliente
  Supabase no lugar de `fetch(localhost)`. Ex.:
  - `getSearches()` → `supabase.from('searches').select().order('created_at')`
  - `getLeads(...)` → `supabase.from('results').select()...`
  - `updateLead(id, data)` → `supabase.from('results').update(data).eq('id', id)`
  - `bulkDelete(ids)` → `supabase.from('results').delete().in('id', ids)`
  - Os componentes React **não mudam** — continuam chamando `api.x()`.
- **Remover a UI de "iniciar/parar scraper"** (start/stop/status) — a mineração agora acontece
  na extensão, dentro do Maps, não é disparada do dashboard. Substituir por uma instrução:
  "Abra o Google Maps com a extensão e minere por lá; os leads aparecem aqui."
- **`ApiConfigModal.js`** [MODIFY/REMOVE] — não precisa mais configurar URL de backend.

### Backend (`backend/`)
- **Aposentar.** Node/Express/Puppeteer/SQLite não são mais usados em produção. Pode manter
  numa pasta `legacy/` só como referência, ou remover. (A extensão + Supabase cobrem tudo.)

---

## 6. Migração dos dados que já existem

Opcional: os leads já minerados estão em `database/searches.db` (SQLite). Dá pra exportar
pra CSV e importar no Supabase pelo painel (ou um script único). Como o foco é usar daqui pra
frente, isso pode ficar por último — ou nem fazer.

---

## 7. Limites grátis e o que observar

| Serviço | Grátis | Observação |
|---|---|---|
| Supabase | 500 MB banco (~centenas de milhares de leads), 50 mil usuários no login, Google OAuth incluso | Projeto "dorme" após 7 dias sem uso; acorda na 1ª chamada (uns segundos). Uso contínuo nunca dorme. |
| Vercel | 100 GB banda/mês | Sobra para um dashboard. |
| Extensão | — | Grátis. Roda no PC do usuário. |

Nada de API do Google → **R$ 0 de custo variável.**

---

## 8. Riscos e pontos honestos

1. **Ainda é scraping do Maps** (área cinza dos termos do Google), mas roda no navegador e no
   IP de cada usuário — o mesmo modelo que já funciona hoje pra você. Baixo risco prático.
2. **Sincronizar o token site↔extensão** é a parte fiddly (seção 4). É o item que merece mais
   atenção no desenvolvimento.
3. **Celular só vê, não minera.** Capturar exige a extensão (desktop). Ver/gerenciar leads no
   celular funciona 100%.
4. **Publicar na Chrome Web Store**: extensões de scraping às vezes são barradas na revisão.
   Alternativa: distribuir a extensão "unpacked" (modo desenvolvedor) ou como `.zip` pros
   amigos — funciona igual, sem loja.
5. **Supabase pausa após 7 dias ocioso** (só no free) — irrelevante com uso frequente.

---

## 9. Roteiro em fases

- **Fase 0 — Supabase:** criar projeto, tabelas `searches`/`results`, políticas RLS, ligar o
  provider Google no Auth. (Sem código de app ainda.)
- **Fase 1 — Frontend:** adicionar supabase-js, tela de login Google, reimplementar `api/index.js`
  sobre o Supabase, remover UI de start/stop scraper. Deploy na Vercel. *(Já dá pra ver/gerenciar
  leads inseridos manualmente — testável de imediato.)*
- **Fase 2 — Extensão:** `authBridge.js` + `bg.js` inserindo no Supabase com o token do usuário.
  Fim a ponta a ponta: minerar no Maps → aparecer no site logado.
- **Fase 3 — Polimento:** deduplicação, contador de buscas por dia (base pro futuro plano pago),
  ajustes de UX.

---

## 10. Base para o futuro plano pago

Quando quiser cobrar: como cada lead já tem `user_id` e as buscas ficam registradas, basta
uma tabela `usage` (contagem por usuário/dia) e uma checagem de limite. Pagamento recorrente
no Brasil: **Mercado Pago** (Pix + assinatura). Nada disso é necessário no MVP — mas a
arquitetura já nasce pronta pra isso.
