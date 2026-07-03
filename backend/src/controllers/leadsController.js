// ================================================================
// LEADS CONTROLLER — Base unificada de leads e funil de prospecção
// ================================================================

const dataService = require('../services/dataService');
const logger = require('../utils/logger');

const VALID_STATUSES = ['novo', 'fila', 'enviado', 'respondeu', 'fechado', 'descartado'];

// GET /api/leads — todos os leads de todas as buscas (com filtros e paginação)
async function getAllLeads(req, res) {
    try {
        const { page = 1, limit = 50, filters = {} } = req.query;
        const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters;
        const data = await dataService.getAllLeads({
            page: parseInt(page),
            limit: parseInt(limit),
            filters: parsedFilters,
        });
        res.json({ success: true, data });
    } catch (e) {
        logger.error('Erro ao listar leads', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

// PATCH /api/results/:id — atualiza status e/ou anotações do lead
async function updateLead(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body || {};

        if (status === undefined && notes === undefined) {
            return res.status(400).json({ success: false, message: 'Informe status e/ou notes para atualizar.' });
        }
        if (status !== undefined && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` });
        }

        const ok = await dataService.updateLead(id, { status, notes });
        if (!ok) return res.status(404).json({ success: false, message: 'Lead não encontrado' });
        res.json({ success: true, message: 'Lead atualizado com sucesso' });
    } catch (e) {
        logger.error('Erro ao atualizar lead', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

// POST /api/results/bulk-status — { ids: [], status: 'fila' }
async function bulkStatus(req, res) {
    try {
        const { ids, status } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, message: 'Informe os ids dos leads.' });
        }
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` });
        }
        const changed = await dataService.bulkUpdateStatus(ids, status);
        res.json({ success: true, changed, message: `${changed} leads atualizados` });
    } catch (e) {
        logger.error('Erro no bulk-status', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

// POST /api/results/bulk-delete — { ids: [] }
async function bulkDelete(req, res) {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, message: 'Informe os ids dos leads.' });
        }
        const deleted = await dataService.deleteResults(ids);
        res.json({ success: true, deleted, message: `${deleted} leads apagados` });
    } catch (e) {
        logger.error('Erro no bulk-delete', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

// GET /api/prospect/summary — contagens do funil, follow-ups e sugestões
async function getProspectSummary(req, res) {
    try {
        const summary = await dataService.getProspectSummary();
        res.json({ success: true, data: summary });
    } catch (e) {
        logger.error('Erro no resumo de prospecção', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

module.exports = { getAllLeads, updateLead, bulkStatus, bulkDelete, getProspectSummary };
