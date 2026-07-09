# Guia de Deploy no Vercel

Este projeto publica o frontend React na Vercel e usa Supabase para banco, autenticacao, RLS e funcoes SQL. Nao ha backend Node no fluxo atual de producao.

## Pre-requisitos

- Conta na Vercel
- Repositorio GitHub conectado
- Projeto Supabase criado
- `supabase/schema.sql` executado no SQL Editor do Supabase

## Configuracao do Projeto

No Vercel, importe o repositorio e use:

- Framework Preset: `Create React App`
- Install Command: `cd frontend && npm ci`
- Build Command: `cd frontend && npm run build`
- Output Directory: `frontend/build`

O arquivo `vercel.json` ja declara esses comandos.

## Variaveis de Ambiente

Configure na Vercel:

```text
REACT_APP_SUPABASE_URL=https://SEU-PROJETO.supabase.co
REACT_APP_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

Depois de alterar variaveis, faca um redeploy.

## Supabase Auth

Em `Authentication > URL Configuration`:

- Site URL: URL final da Vercel
- Redirect URLs: inclua a URL final da Vercel e a URL local usada em desenvolvimento

No provedor Google, o redirect autorizado no Google Cloud deve apontar para:

```text
https://SEU-PROJETO.supabase.co/auth/v1/callback
```

## Teste Local Antes do Deploy

```bash
cd frontend
npm ci
npm run build
```

Para desenvolvimento:

```bash
cd frontend
npm start
```

## Extensao

Atualize `extension/config.js` com:

```js
SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
SUPABASE_ANON_KEY: 'SUA_CHAVE_ANON_PUBLIC',
APP_URL: 'https://SEU-APP.vercel.app',
```

No `extension/manifest.json`, confirme que o content script do `authBridge.js` permite a URL da Vercel e a URL local de desenvolvimento.

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Build falha | Dependencia ou erro de React | Rode `cd frontend && npm run build` localmente |
| Login volta para a tela inicial | Redirect URL ausente no Supabase | Adicione a URL da Vercel em `Redirect URLs` |
| Dados nao carregam | Variaveis Supabase ausentes ou erradas | Confira `REACT_APP_SUPABASE_URL` e `REACT_APP_SUPABASE_ANON_KEY` |
| Extensao nao conecta | `APP_URL` ou `manifest.json` aponta para outro dominio | Atualize a configuracao da extensao |
| Usuario ve dados de outro | RLS ausente | Rode novamente `supabase/schema.sql` e confira as policies |

## Backend Legado

A pasta `backend/` pertence a arquitetura antiga Express/SQLite/FileWatcher. Ela nao deve ser publicada nem iniciada no deploy atual. Se precisar consultar ou testar esse fluxo antigo, use o script `legacy:backend` na raiz.
