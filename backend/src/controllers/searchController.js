const path = require('path');
const fs = require('fs');
const dataService = require('../services/dataService');
const fileWatcher = require('../services/fileWatcher');
const logger = require('../utils/logger');

async function getAllSearches(req, res) {
    try {
        const searches = await dataService.getSearches();
        res.json({ success: true, data: searches });
    } catch (e) {
        logger.error('Erro ao listar buscas', { error: e.message });
        res.status(500).json({ success: false, message: 'Erro ao listar buscas', error: e.message });
    }
}

async function uploadFile(req, res) {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
        const result = await fileWatcher.processUploadedFile(req.file.path, req.file.originalname);
        // limpar arquivo temporário
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        res.json({ success: true, message: 'Arquivo processado com sucesso', data: result });
    } catch (e) {
        logger.error('Erro ao processar upload', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

async function exportResults(searchId, format, filters) {
    try {
        const { data } = await dataService.getResults(searchId, { page: 1, limit: 99999, filters });
        if (!data.length) return { success: false, message: 'Sem dados para exportar' };

        const exportsDir = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '../../exports');
        if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

        const filename = `export_${searchId}_${Date.now()}.csv`;
        const filePath = path.join(exportsDir, filename);

        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
        fs.writeFileSync(filePath, [headers, ...rows].join('\n'), 'utf8');

        return { success: true, filePath, filename };
    } catch (e) {
        logger.error('Erro ao exportar', { error: e.message });
        return { success: false, message: e.message };
    }
}

module.exports = { getAllSearches, uploadFile, exportResults };
