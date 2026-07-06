// ================================================================
// FRIENDLY MINER — Popup JS
// Busca rápida + status da conta (login feito no painel Vercel).
// ================================================================

// ——— Botão: Busca rápida no Maps ————————————————————————————————
document.getElementById('btnSearch').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    window.open('https://www.google.com.br/maps/search/' + encodeURIComponent(q));
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
});

// ——— Botão: Abrir painel (fazer login) ——————————————————————————
document.getElementById('btnPanel').addEventListener('click', () => {
    const url = (typeof FM_CONFIG !== 'undefined' && FM_CONFIG.APP_URL) || '';
    if (url) window.open(url);
});

// ——— Status da conta ————————————————————————————————————————————
function renderStatus() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const hint = document.getElementById('loginHint');

    chrome.storage.local.get(['fmAuth'], (data) => {
        const auth = data.fmAuth;
        if (auth && auth.access_token && auth.email) {
            dot.style.background = '#22c55e'; // verde
            text.textContent = `Conectado: ${auth.email}`;
            hint.textContent = 'Tudo pronto! Minere no Google Maps e clique em enviar.';
        } else {
            dot.style.background = '#ef4444'; // vermelho
            text.textContent = 'Não conectado';
            hint.textContent = 'Clique em "Abrir Painel / Entrar", faça login com o Google e volte aqui.';
        }
    });
}

renderStatus();
// Atualiza se a sessão chegar enquanto o popup está aberto.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fmAuth) renderStatus();
});
