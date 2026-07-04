const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const searchController = require('../controllers/searchController');
const scraperController = require('../controllers/scraperController');
const leadsController = require('../controllers/leadsController');
const { importDirectLeads } = require('../controllers/searchController');
const dataService = require('../services/dataService');

// Configurar multer para upload
const upload = multer({
    dest: process.env.VERCEL ? '/tmp/' : path.join(__dirname, '../../temp/'),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// Dashboard
router.get('/dashboard/metrics', dashboardController.getMetrics);
router.get('/dashboard/charts',  dashboardController.getCharts);

// Buscas
router.get('/searches', searchController.getAllSearches);
router.delete('/searches/:id', searchController.deleteSearch);
router.patch('/searches/:id', searchController.renameSearch);
router.post('/upload', upload.single('file'), searchController.uploadFile);

// Base unificada de leads + prospecção
router.get('/leads', leadsController.getAllLeads);
router.get('/prospect/summary', leadsController.getProspectSummary);
router.post('/results/bulk-status', leadsController.bulkStatus);
router.post('/results/bulk-delete', leadsController.bulkDelete);
router.patch('/results/:id', leadsController.updateLead);
router.get('/ignored', leadsController.getIgnored);
router.delete('/ignored/:id', leadsController.restoreIgnored);

// Upload direto da extensão Chrome (JSON)
router.post('/upload-direct', importDirectLeads);

// Scraper integrado (Puppeteer)
router.post('/scraper/start', scraperController.startScrape);
router.post('/scraper/stop', scraperController.stopScrape);
router.get('/scraper/status', scraperController.getScrapeStatus);

// Resultados
router.get('/results/:searchId', async (req, res) => {
    try {
        const { searchId } = req.params;
        const { page = 1, limit = 50, filters = {} } = req.query;
        const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters;
        
        const data = await dataService.getResults(searchId, { 
            page: parseInt(page), 
            limit: parseInt(limit),
            filters: parsedFilters
        });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Atualizar status do lead (CRM)
router.patch('/results/:id/status', searchController.updateStatus);

// Exportar
router.get('/export/:searchId', async (req, res) => {
    try {
        const result = await searchController.exportResults(req.params.searchId, 'csv', {});
        if (result.success) {
            res.download(result.filePath, result.filename);
        } else {
            res.status(500).json(result);
        }
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
