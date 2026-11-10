// ================================================================
// FRIENDLY MINER — Popup JS
// Busca rápida + status da conta (login feito no painel Vercel).
// ================================================================

const FALLBACK_APP_URL = 'https://nv-map-extract.vercel.app';
let isConnected = false;

function getAppUrl() {
    return ((typeof FM_CONFIG !== 'undefined' && FM_CONFIG.APP_URL) || FALLBACK_APP_URL).replace(/\/$/, '');
}

function isAuthValid(auth) {
    if (!auth || !auth.access_token || !auth.email) return false;
    if (!auth.expires_at) return true;
    const now = Math.floor(Date.now() / 1000);
    return auth.expires_at - 60 > now;
}

// ——— Botão: Busca rápida no Maps ————————————————————————————————
document.getElementById('btnSearch').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    window.open('https://www.google.com.br/maps/search/' + encodeURIComponent(q));
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
});

// ——— Botão: Abrir painel (fazer login ou ir direto ao dashboard) —————
document.getElementById('btnPanel').addEventListener('click', () => {
    const base = getAppUrl();
    window.open(isConnected ? base : `${base}/?login=1`);
});

// ——— Status da conta ————————————————————————————————————————————
function renderStatus() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const hint = document.getElementById('loginHint');
    const btnPanel = document.getElementById('btnPanel');

    chrome.storage.local.get(['fmAuth'], (data) => {
        const auth = data.fmAuth;
        if (isAuthValid(auth)) {
            isConnected = true;
            dot.style.background = '#22c55e';
            text.textContent = `Conectado: ${auth.email}`;
            hint.textContent = 'Tudo pronto! Minere no Google Maps e clique em enviar.';
            btnPanel.textContent = '🌐 Abrir Dashboard Oficial';
        } else if (auth && auth.email) {
            isConnected = false;
            dot.style.background = '#f59e0b';
            text.textContent = 'Sessão expirada';
            hint.textContent = 'Sua sessão expirou. Clique abaixo para reconectar rapidamente.';
            btnPanel.textContent = '🔑 Reconectar no Painel';
        } else {
            isConnected = false;
            dot.style.background = '#ef4444';
            text.textContent = 'Não conectado';
            hint.textContent = 'Clique abaixo, entre com sua conta Google e volte aqui.';
            btnPanel.textContent = '🌐 Abrir Painel / Entrar';
        }
    });
}

renderStatus();
// Atualiza se a sessão chegar enquanto o popup está aberto.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fmAuth) renderStatus();
});
