// ================================================================
// MAPS SEARCH EXTRACTOR — Popup JS
// Sem login, sem paywall. Busca rápida + configuração de URL.
// ================================================================

const DEFAULT_URL = 'http://localhost:5000/api';

// ——— Carregar URL salva ——————————————————————————————————————————
chrome.storage.sync.get({ dashboardUrl: DEFAULT_URL }, (data) => {
    document.getElementById('dashboardUrl').value = data.dashboardUrl;
    checkHealth(data.dashboardUrl);
});

// ——— Botão: Busca rápida no Maps ————————————————————————————————
document.getElementById('btnSearch').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    window.open('https://www.google.com.br/maps/search/' + encodeURIComponent(q));
});

// Abrir no Enter
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
});

// ——— Botão: Salvar URL ————————————————————————————————————————
document.getElementById('btnSave').addEventListener('click', () => {
    const url = document.getElementById('dashboardUrl').value.trim() || DEFAULT_URL;
    chrome.storage.sync.set({ dashboardUrl: url }, () => {
        const msg = document.getElementById('savedMsg');
        msg.textContent = '✅ URL salva!';
        setTimeout(() => { msg.textContent = ''; }, 3000);
        checkHealth(url);
    });
});

// ——— Verificar saúde do backend ————————————————————————————————
async function checkHealth(apiUrl) {
    const dot  = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const healthUrl = apiUrl.replace(/\/api\/?$/, '') + '/api/health';

    dot.style.background = '#f59e0b'; // amarelo = verificando
    text.textContent = 'Verificando conexão...';

    try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            dot.style.background = '#22c55e'; // verde
            text.textContent = 'Dashboard online ✅';
        } else {
            throw new Error('offline');
        }
    } catch (_) {
        dot.style.background = '#ef4444'; // vermelho
        text.textContent = 'Dashboard offline ❌';
    }
}
