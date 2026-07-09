# Acao Imediata: Deploy Vercel + Supabase

Use este checklist quando o site nao abre ou abre sem login/dados.

## 1. Vercel

Em `Settings > General > Build & Development Settings`:

```text
Framework Preset: Create React App
Root Directory: ./
Install Command: cd frontend && npm ci
Build Command: cd frontend && npm run build
Output Directory: frontend/build
```

## 2. Variaveis

Em `Settings > Environment Variables`, configure em Production e Preview:

```text
REACT_APP_SUPABASE_URL=https://SEU-PROJETO.supabase.co
REACT_APP_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

Nao configure `REACT_APP_API_URL`; o app atual nao usa backend proprio.

## 3. Supabase

No SQL Editor, rode `supabase/schema.sql` inteiro.

Em `Authentication > URL Configuration`:

```text
Site URL: https://SEU-APP.vercel.app
Redirect URLs:
  https://SEU-APP.vercel.app
  http://localhost:3000
  http://localhost:3008
```

## 4. Redeploy

Na Vercel:

```text
Deployments > ultimo deploy > Redeploy
Use existing Build Cache: desmarcado
```

## 5. Teste

1. Abra a URL da Vercel.
2. Faca login.
3. Confirme que o Dashboard carrega.
4. Abra a extensao e confira se aparece conectado.
5. Rode uma busca pequena no Maps e confirme que os leads aparecem.
