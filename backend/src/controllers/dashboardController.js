const dataService = require('../services/dataService');
const logger = require('../utils/logger');

async function getMetrics(req, res) {
    try {
        const metrics = await dataService.getDashboardMetrics();
        const recent = await dataService.getRecentSearches(5);
        res.json({ success: true, data: { ...metrics, recentSearches: recent } });
    } catch (e) {
        logger.error('Erro ao obter métricas', { error: e.message });
        res.status(500).json({ success: false, message: 'Erro ao obter métricas', error: e.message });
    }
}

async function getCharts(req, res) {
    try {
        const searches = await dataService.getSearches();
        // Agrupar por data (últimos 7 dias)
        const byDate = {};
        searches.forEach(s => {
            const date = new Date(s.created_at).toLocaleDateString('pt-BR');
            byDate[date] = (byDate[date] || 0) + (s.total_results || 0);
        });

        const chartData = Object.entries(byDate).slice(-7).map(([date, count]) => ({ date, count }));
        res.json({ success: true, data: { resultsByDate: chartData, searches } });
    } catch (e) {
        logger.error('Erro ao obter gráficos', { error: e.message });
        res.status(500).json({ success: false, message: 'Erro ao obter dados de gráficos', error: e.message });
    }
}

module.exports = { getMetrics, getCharts };
