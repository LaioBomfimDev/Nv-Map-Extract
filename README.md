# Friendly Miner

Painel React para mineracao, prospeccao e inteligencia geografica de leads do Google Maps. A arquitetura atual usa Supabase diretamente no frontend, com login por usuario, RLS e funcoes SQL para metricas, importacao e deduplicacao.

## Funcionalidades

- Dashboard com metricas e graficos vindos do Supabase
- Historico de buscas e resultados importados pela extensao ou por planilha
- Prospecao com status, anotacoes, exclusao e lista de ignorados
- Aba Mapa com clusters, legenda por tema, ficha completa do lead e sugestoes inteligentes por municipio
- Inteligencia geografica baseada em densidade medida x populacao municipal
- Exportacao CSV client-side

## Arquitetura Atual

```text
friendly-miner/
├── frontend/              # React App principal
├── frontend/src/api/      # Camada de API sobre Supabase
├── frontend/public/data/  # Bases estaticas usadas pelo mapa
├── extension/             # Extensao Chrome que minera e envia leads
├── supabase/              # Schema, seeds e migracoes SQL
└── backend/               # Legado: Express/SQLite antigo, fora do fluxo atual
```

O frontend nao depende mais do backend Node para o uso normal. A pasta `backend/` ficou preservada como referencia historica da implementacao Express/SQLite e deve ser tratada como legado ate uma decisao final de remocao ou mudanca para `legacy/`.

## Pre-Requisitos

- Node.js 16+
- npm 8+
- Projeto Supabase configurado
- Chrome/Edge para usar a extensao de mineracao

## Configuracao

1. Crie o projeto no Supabase.
2. Rode `supabase/schema.sql` inteiro no SQL Editor.
3. Se precisar popular usuarios iniciais, use `supabase/seed_users.sql`.
4. Crie `frontend/.env` com:

```bash
REACT_APP_SUPABASE_URL=https://SEU-PROJETO.supabase.co
REACT_APP_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

As mesmas variaveis precisam existir nas Environment Variables da Vercel em producao.

## Desenvolvimento

```bash
cd frontend
npm install
npm start
```

Acesse `http://localhost:3000`.

Para gerar build de producao:

```bash
cd frontend
npm run build
```

## Deploy

O deploy atual publica apenas o frontend:

- `vercel.json` usa `cd frontend && npm ci` na instalacao e `cd frontend && npm run build` no build
- output: `frontend/build`
- banco, autenticacao e funcoes ficam no Supabase

## Mapa e Sugestoes

A aba Mapa usa:

- `frontend/src/components/MapaTab.js` para renderizar mapa, clusters, popups, malha municipal e painel de sugestoes
- `frontend/src/components/MapaSuggestions.js` para Expandir/Aprofundar
- `frontend/src/utils/geo.js` para municipios, malhas do IBGE, densidade, ranking e links do Google Maps
- `frontend/public/data/municipios.json` como base estatica municipal

As sugestoes combinam o historico do usuario com populacao municipal: densidade observada por tema x populacao, com penalidade por distancia.

## Backend Legado

`backend/` descreve a versao antiga com Node, Express, SQLite e FileWatcher. Ele nao deve ser iniciado como parte do fluxo principal enquanto a aplicacao estiver operando sobre Supabase. Antes de remover ou mover essa pasta, confirme se nenhum deploy, script local ou automacao ainda depende dela.
