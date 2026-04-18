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
    getResults:  (id, page = 1, limit = 50) => request(`/results/${id}?page=${page}&limit=${limit}`),
    getExportUrl:(id) => `${API_BASE}/export/${id}`,
    getHealth:   () => request('/health'),
    uploadFile: (file) => {
        const form = new FormData();
        form.append('file', file);
        return fetch(`${API_BASE}/upload`, { method: 'POST', body: form }).then(r => r.json());
    },
};
