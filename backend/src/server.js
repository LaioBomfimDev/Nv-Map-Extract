// ========================================
// SERVIDOR BACKEND - DASHBOARD PERSONALIZADO
// Google Maps Scraper + Interface Customizada
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

// Importar controladores e utilitários
const searchController = require('./controllers/searchController');
const dashboardController = require('./controllers/dashboardController');
const dataService = require('./services/dataService');
const logger = require('./utils/logger');

// Importar rotas da API
const apiRoutes = require('./routes/api');

// Configuração do servidor
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Carregar configuração da empresa
let companyConfig = {};
try {
    const configPath = path.join(__dirname, '../config/company-config.json');
    if (fs.existsSync(configPath)) {
        companyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        logger.info('Configuração da empresa carregada');
    } else {
        logger.warn('Arquivo de configuração não encontrado, usando padrões');
        companyConfig = {
            company: {
                name: "Dashboard Personalizado",
                primaryColor: "#1976d2",
                secondaryColor: "#dc004e"
            },
            search: {
                defaultCity: "São Paulo",
                maxResults: 120
            }
        };
    }
} catch (error) {
    logger.error('Erro ao carregar configuração', error.message);
}

// Inicializar banco de dados
dataService.initDatabase();

// ========================================
// ROTAS BÁSICAS DE SISTEMA (ANTES DA API)
// ========================================

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Dashboard Backend está funcionando',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ========================================
// REGISTRAR ROTAS DA API
// ========================================

// Usar as rotas da API
app.use('/api', apiRoutes);

// Rota para obter configuração da empresa
app.get('/api/config', (req, res) => {
    res.json(companyConfig);
});

// Rota para atualizar configuração da empresa
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        const configPath = path.join(__dirname, '../config/company-config.json');
        
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        companyConfig = newConfig;
        
        res.json({
            success: true,
            message: 'Configuração atualizada com sucesso'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configuração',
            error: error.message
        });
    }
});

// ========================================
// ROTAS BÁSICAS
// ========================================

// Rota alternativa para configuração da empresa
app.get('/api/config/company', (req, res) => {
    res.json({
        success: true,
        data: companyConfig.company || {}
    });
});

// Status do sistema
app.get('/api/system/status', async (req, res) => {
    try {
        const scraperPath = path.join(__dirname, '../../../Google_Maps_Extractor.exe');
        const scraperExists = fs.existsSync(scraperPath);
        
        const dbStatus = await dataService.checkDatabaseConnection();
        
        res.json({
            success: true,
            data: {
                api: {
                    status: 'online',
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                },
                database: {
                    status: dbStatus ? 'connected' : 'disconnected',
                    type: 'SQLite'
                },
                scraper: {
                    status: scraperExists ? 'available' : 'not_found',
                    path: scraperPath
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar status do sistema',
            error: error.message
        });
    }
});

// ========================================
// ROTAS DE RESULTADOS
// ========================================

// Obter resultados de uma busca
app.get('/api/results/:searchId', async (req, res) => {
    try {
        const { searchId } = req.params;
        const { page = 1, limit = 50, filters = {} } = req.query;
        
        const results = await dataService.getResults(searchId, {
            page: parseInt(page),
            limit: parseInt(limit),
            filters: typeof filters === 'string' ? JSON.parse(filters) : filters
        });
        
        res.json({
            success: true,
            data: results
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao obter resultados',
            error: error.message
        });
    }
});

// Exportar resultados
app.get('/api/export/:searchId/:format', async (req, res) => {
    try {
        const { searchId, format } = req.params;
        const { filters = {} } = req.query;
        
        const exportResult = await searchController.exportResults(searchId, format, filters);
        
        if (exportResult.success) {
            res.download(exportResult.filePath, exportResult.filename);
        } else {
            res.status(500).json(exportResult);
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar resultados',
            error: error.message
        });
    }
});

// ========================================
// MONITORAMENTO DE ARQUIVOS
// ========================================

// Inicializar FileWatcher para monitoramento automático
const fileWatcher = require('./services/fileWatcher');
const resultsPath = path.join(__dirname, '../../resultados');

// Iniciar monitoramento com FileWatcher
fileWatcher.startWatching(resultsPath)
    .then(() => {
        logger.info('FileWatcher iniciado com sucesso', { path: resultsPath });
    })
    .catch((error) => {
        logger.error('Erro ao iniciar FileWatcher', { error: error.message });
    });

// ========================================
// TRATAMENTO DE ERROS
// ========================================

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
    logger.error('Erro no servidor', { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
});

// Rota 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info('🚀 DASHBOARD BACKEND INICIADO', {
            port: PORT,
            url: `http://localhost:${PORT}`,
            empresa: companyConfig.company?.name || 'Dashboard Personalizado',
            ambiente: process.env.NODE_ENV || 'development',
            rotas: [
                'GET  /api/health - Status do servidor',
                'GET  /api/config - Configuração da empresa', 
                'GET  /api/config/company - Configuração da empresa (alternativa)',
                'GET  /api/system/status - Status do sistema',
                'POST /api/search - Iniciar nova busca',
                'GET  /api/dashboard/metrics - Métricas do dashboard',
                'GET  /api/dashboard/charts - Gráficos do dashboard'
            ]
        });
    });
}

// Tratamento de sinais de encerramento
process.on('SIGINT', () => {
    logger.info('🛑 Encerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('🛑 Encerrando servidor...');
    process.exit(0);
});

module.exports = app;