const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export const api = {
    getMetrics:  () => request('/dashboard/metrics'),
    getCharts:   () => request('/dashboard/charts'),
    getSearches: () => request('/searches'),
    getResults:  (id, page = 1, limit = 50, filters = {}) => {
        const query = new URLSearchParams({
            page,
            limit,
            filters: JSON.stringify(filters)
        }).toString();
        return request(`/results/${id}?${query}`);
    },
    updateResultStatus: (id, status) => request(`/results/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    }),
    getExportUrl:(id) => `${API_BASE}/export/${id}`,
    startScraper: (data) => request('/scraper/start', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    stopScraper: () => request('/scraper/stop', { method: 'POST' }),
    getScraperStatus: () => request('/scraper/status'),
    deleteSearch: (id) => request(`/searches/${id}`, { method: 'DELETE' }),
    renameSearch: (id, filename) => request(`/searches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ filename })
    }),
    getAllLeads: (page = 1, limit = 50, filters = {}) => {
        const query = new URLSearchParams({
            page,
            limit,
            filters: JSON.stringify(filters)
        }).toString();
        return request(`/leads?${query}`);
    },
    updateLead: (id, data) => request(`/results/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    bulkStatus: (ids, status) => request('/results/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids, status })
    }),
    bulkDelete: (ids) => request('/results/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
    }),
    getProspectSummary: () => request('/prospect/summary'),
    getHealth:   () => request('/health'),
    uploadFile: (file) => {
        const form = new FormData();
        form.append('file', file);
        return fetch(`${API_BASE}/upload`, { method: 'POST', body: form }).then(r => r.json());
    },
};
