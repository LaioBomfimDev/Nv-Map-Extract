# Friendly Miner

Painel inteligente e amigável para inteligência geográfica e análise de leads extraídos do Google Maps com processamento automático de arquivos CSV e visualização em tempo real.

## 🚀 Funcionalidades

- **Processamento Automático**: Monitora pasta `resultados/` e processa arquivos CSV automaticamente
- **Dashboard em Tempo Real**: Visualização de métricas e estatísticas
- **API RESTful**: Backend Node.js com Express e SQLite
- **Interface Moderna**: Frontend React com componentes responsivos
- **FileWatcher**: Detecção automática de novos arquivos de scraping

## 📋 Pré-requisitos

- Node.js 16+
- npm ou yarn

## 🛠️ Instalação

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## 🎯 Como usar

1. Coloque arquivos CSV na pasta `resultados/`
2. Nomeie os arquivos com palavras-chave: `google_maps`, `search_result`, `extract`, `scraper`, `business`, `places`
3. O sistema detecta e processa automaticamente
4. Acesse http://localhost:3000 para ver o dashboard

## 📊 Estrutura do Projeto

```
friendly-miner/
├── backend/          # API Node.js + Express
├── frontend/         # React App
├── database/         # SQLite Database
├── resultados/       # CSV Files (monitored)
└── config/          # Configuration files
```

## 🔧 Configuração

1. Copie `.env.example` para `.env` no backend
2. Configure as variáveis de ambiente necessárias
3. O banco SQLite é criado automaticamente

## 📈 Deploy

- **Frontend**: Deploy automático no Vercel
- **Backend**: Configurado para deploy em serviços Node.js

## 🤝 Contribuição

Contribuições são bem-vindas! Abra uma issue ou envie um pull request.

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.