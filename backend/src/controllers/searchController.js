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

// Receber leads direto da extensão Chrome (formato JSON)
async function importDirectLeads(req, res) {
    try {
        const { leads, filename, keyword, city } = req.body;
        if (!leads || !Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum lead recebido ou formato inválido' });
        }

        const name = filename || `extensao_${keyword || 'maps'}_${city || 'geral'}_${Date.now()}.json`;
        const result = await dataService.saveSearch(name, leads, 'extension');

        logger.info('Leads recebidos da extensão Chrome', {
            filename: name,
            total: leads.length,
            searchId: result.id,
        });

        res.json({
            success: true,
            message: `${leads.length} leads salvos com sucesso no Dashboard`,
            data: result,
        });
    } catch (e) {
        logger.error('Erro ao importar leads da extensão', { error: e.message });
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

// Apagar uma busca/importação e todos os seus leads
async function deleteSearch(req, res) {
    try {
        const { id } = req.params;
        const ok = await dataService.deleteSearch(id);
        if (!ok) return res.status(404).json({ success: false, message: 'Busca não encontrada' });
        logger.info('Busca apagada', { searchId: id });
        res.json({ success: true, message: 'Busca apagada com sucesso' });
    } catch (e) {
        logger.error('Erro ao apagar busca', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

// Renomear uma busca/importação
async function renameSearch(req, res) {
    try {
        const { id } = req.params;
        const { filename } = req.body || {};
        if (!filename || !String(filename).trim()) {
            return res.status(400).json({ success: false, message: 'Informe o novo nome.' });
        }
        const ok = await dataService.renameSearch(id, String(filename).trim());
        if (!ok) return res.status(404).json({ success: false, message: 'Busca não encontrada' });
        res.json({ success: true, message: 'Busca renomeada com sucesso' });
    } catch (e) {
        logger.error('Erro ao renomear busca', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

async function updateStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: 'Status não informado' });
        }
        
        const success = await dataService.updateProspectStatus(id, status);
        if (success) {
            res.json({ success: true, message: 'Status atualizado com sucesso' });
        } else {
            res.status(404).json({ success: false, message: 'Lead não encontrado' });
        }
    } catch (e) {
        logger.error('Erro ao atualizar status do lead', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

module.exports = { getAllSearches, uploadFile, exportResults, importDirectLeads, updateStatus, deleteSearch, renameSearch };
