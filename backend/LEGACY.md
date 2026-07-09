# Backend legado

Este backend Express/SQLite pertence a arquitetura antiga do Friendly Miner.

A aplicacao atual usa:

- React na Vercel
- Supabase Auth
- Supabase Postgres com RLS
- Funcoes SQL em `supabase/schema.sql`
- Extensao Chrome enviando leads direto para o Supabase

Nao inicie este backend como parte do fluxo principal e nao configure `REACT_APP_API_URL` para ele em producao. Ele permanece aqui apenas como referencia historica ate ser removido ou movido para uma pasta `legacy/`.
