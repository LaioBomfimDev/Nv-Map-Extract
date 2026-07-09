# Troubleshooting de Producao

Arquitetura atual: Vercel serve o frontend React; Supabase cuida de Auth, Postgres, RLS e funcoes SQL. O backend Express/SQLite e legado.

## Site nao abre

Confira na Vercel:

```text
Install Command: cd frontend && npm ci
Build Command: cd frontend && npm run build
Output Directory: frontend/build
```

Depois faca `Redeploy` sem cache.

## Tela avisa Supabase nao configurado

Faltam variaveis de ambiente no deploy:

```text
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
```

Depois de alterar variaveis, faca novo deploy.

## Login Google falha

No Supabase, confira:

```text
Authentication > Providers > Google: ativo
Authentication > URL Configuration > Site URL: URL da Vercel
Authentication > URL Configuration > Redirect URLs: URL da Vercel
```

No Google Cloud, o redirect autorizado deve ser:

```text
https://SEU-PROJETO.supabase.co/auth/v1/callback
```

## Login funciona, mas dados nao carregam

1. Rode `supabase/schema.sql` inteiro.
2. Confirme que RLS esta habilitado nas tabelas `searches`, `results` e `ignored_leads`.
3. Confirme que o usuario esta autenticado.
4. Veja o console do navegador para mensagens do Supabase.

## Extensao nao conecta

1. Abra o painel logado no mesmo navegador.
2. Confira `extension/config.js`:

```js
SUPABASE_URL
SUPABASE_ANON_KEY
APP_URL
```

3. Confirme que `extension/manifest.json` inclui a URL do painel no bloco do `authBridge.js`.
4. Recarregue a extensao em `chrome://extensions`.

## Leads nao aparecem apos minerar

1. Veja o popup/status da extensao.
2. Confirme que o painel estava logado antes da mineracao.
3. Teste uma busca pequena.
4. Se o erro for SQL, rode novamente o `schema.sql` atualizado.

## Coisas que nao resolvem mais

- Configurar `REACT_APP_API_URL`
- Publicar `backend/src/server.js` como Vercel Function
- Rodar SQLite em producao
- Liberar CORS do backend antigo

Esses passos pertencem a arquitetura antiga e tendem a criar diagnostico falso.
