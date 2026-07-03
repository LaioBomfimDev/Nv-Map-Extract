// ================================================================
// SCRAPER CONTROLLER — Controle da busca integrada do Google Maps
// ================================================================

const scraperService = require('../services/scraperService');
const logger = require('../utils/logger');

async function startScrape(req, res) {
    try {
        const { keyword, city, collectEmails = true, showBrowser = false } = req.body || {};

        if (!keyword || !String(keyword).trim()) {
            return res.status(400).json({ success: false, message: 'Informe a palavra-chave da busca (ex: "Dentistas").' });
        }
        if (!city || !String(city).trim()) {
            return res.status(400).json({ success: false, message: 'Informe a cidade ou região da busca (ex: "São Paulo").' });
        }

        const result = await scraperService.start({
            keyword: String(keyword).trim(),
            city: String(city).trim(),
            collectEmails: Boolean(collectEmails),
            showBrowser: Boolean(showBrowser),
        });

        res.json({
            success: true,
            message: 'Busca iniciada com sucesso.',
            data: result,
        });
    } catch (e) {
        logger.error('Erro ao iniciar scraper', { error: e.message });
        res.status(e.message.includes('em andamento') ? 409 : 500).json({ success: false, message: e.message });
    }
}

async function stopScrape(req, res) {
    try {
        const result = await scraperService.stop();
        res.json({ success: true, ...result });
    } catch (e) {
        logger.error('Erro ao parar scraper', { error: e.message });
        res.status(500).json({ success: false, message: e.message });
    }
}

function getScrapeStatus(req, res) {
    try {
        res.json({ success: true, data: scraperService.getStatus() });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

module.exports = { startScrape, stopScrape, getScrapeStatus };
