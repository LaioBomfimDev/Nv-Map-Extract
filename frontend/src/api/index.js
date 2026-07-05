// ========================================
// Cliente da API — URL dinâmica (localStorage)
// Permite configurar o backend em runtime, útil para
// acessar o app (deployado no Vercel/HTTPS) pelo celular
// apontando para um túnel HTTPS (ngrok/localtunnel) ou,
// em rede local HTTP, para o IP do computador.
// ========================================

const STORAGE_KEY = 'FM_API_URL';

// Default embutido no build (definido em .env / .env.production).
// Vazio em produção => força a configuração pelo modal.
const ENV_DEFAULT = process.env.REACT_APP_API_URL || '';

// Fallback final apenas para desenvolvimento local no PC.
const LOCAL_DEFAULT = 'http://localhost:5000/api';

// Remove barra final para evitar "//" ao concatenar paths.
function normalize(url) {
    return (url || '').trim().replace(/\/+$/, '');
}

export function getApiBase() {
    const stored = normalize(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
    if (ENV_DEFAULT) return normalize(ENV_DEFAULT);
    return LOCAL_DEFAULT;
}

// True quando o usuário já configurou uma URL ou existe default embutido.
// Usado para sugerir abrir o modal no mobile quando nada foi configurado.
export function isApiConfigured() {
    return !!normalize(localStorage.getItem(STORAGE_KEY)) || !!ENV_DEFAULT;
}

export function getStoredApiUrl() {
    return normalize(localStorage.getItem(STORAGE_KEY));
}

export function setApiUrl(url) {
    const clean = normalize(url);
    if (clean) {
        localStorage.setItem(STORAGE_KEY, clean);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
    return clean;
}

// Detecta o clássico bloqueio de "mixed content": página servida em
// HTTPS não consegue chamar um backend em http:// (o navegador bloqueia).
export function isMixedContent(url) {
    try {
        const target = new URL(normalize(url));
        return window.location.protocol === 'https:' && target.protocol === 'http:';
    } catch {
        return false;
    }
}

async function request(path, options = {}) {
    const base = getApiBase();
    const res = await fetch(`${base}${path}`, {
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
    getExportUrl:(id) => `${getApiBase()}/export/${id}`,
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
    getIgnored: () => request('/ignored'),
    restoreIgnored: (id) => request(`/ignored/${id}`, { method: 'DELETE' }),
    getHealth:   () => request('/health'),
    // Ping usado pelo modal para validar a URL configurada.
    ping: (baseOverride) => {
        const base = baseOverride ? normalize(baseOverride) : getApiBase();
        return fetch(`${base}/health`).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
    },
    uploadFile: (file) => {
        const base = getApiBase();
        const form = new FormData();
        form.append('file', file);
        return fetch(`${base}/upload`, { method: 'POST', body: form }).then(r => r.json());
    },
};
