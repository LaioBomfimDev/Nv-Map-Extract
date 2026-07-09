#!/bin/bash

# Script de build para o frontend no Vercel
# Este script garante que o build seja executado corretamente

echo "🚀 Iniciando build do frontend..."

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: package.json não encontrado"
    echo "📁 Diretório atual: $(pwd)"
    echo "📂 Conteúdo do diretório:"
    ls -la
    exit 1
fi

echo "✅ package.json encontrado"
echo "📁 Diretório de build: $(pwd)"

# Instalar dependências
echo "📦 Instalando dependências..."
npm ci --production=false

if [ $? -ne 0 ]; then
    echo "❌ Erro na instalação das dependências"
    exit 1
fi

echo "✅ Dependências instaladas com sucesso"

# Verificar variáveis de ambiente
echo "🔧 Verificando variáveis de ambiente..."
echo "NODE_ENV: $NODE_ENV"
echo "REACT_APP_SUPABASE_URL: ${REACT_APP_SUPABASE_URL:+configurado}"
echo "REACT_APP_SUPABASE_ANON_KEY: ${REACT_APP_SUPABASE_ANON_KEY:+configurada}"

# Executar build
echo "🔨 Executando build..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Erro no build"
    exit 1
fi

echo "✅ Build concluído com sucesso"

# Verificar se o diretório build foi criado
if [ ! -d "build" ]; then
    echo "❌ Erro: Diretório build não foi criado"
    exit 1
fi

echo "✅ Diretório build criado"
echo "📂 Conteúdo do diretório build:"
ls -la build/

echo "🎉 Build do frontend finalizado com sucesso!"
exit 0
