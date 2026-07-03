// ================================================================
// MAPS SEARCH EXTRACTOR — Background Service Worker
// Sem paywall. Sem autenticação externa. 100% local.
// ================================================================

importScripts('js/mybg.js');

const DEFAULT_API_URL = 'http://localhost:5000/api';

// Buscar URL do dashboard salva pelo usuário
async function getApiUrl() {
    return new Promise(resolve => {
        chrome.storage.sync.get({ dashboardUrl: DEFAULT_API_URL }, (data) => {
            resolve(data.dashboardUrl || DEFAULT_API_URL);
        });
    });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    // Abrir página de resultados no dashboard da extensão
    if (msg.action === 'openPage') {
        chrome.storage.local.set({ leads: msg.data }, () => {
            chrome.tabs.create({ url: 'dashboard.html' });
        });
        return false;
    }

    // Enviar leads diretamente para o backend do dashboard
    if (msg.action === 'sendToDashboard') {
        (async () => {
            const apiUrl = await getApiUrl();
            const { leads, keyword, city } = msg.data;
            const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
            const filename = `extensao_${(keyword || 'maps').replace(/\s+/g, '_')}_${(city || 'geral').replace(/\s+/g, '_')}_${timestamp}`;

            try {
                const response = await fetch(`${apiUrl}/upload-direct`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leads, filename, keyword, city }),
                });
                const result = await response.json();
                sendResponse(result);
            } catch (err) {
                console.error('[Maps Search Extractor] Erro ao enviar para o Dashboard:', err);
                sendResponse({ success: false, message: 'Não foi possível conectar ao Dashboard. Verifique se o backend está rodando.' });
            }
        })();
        return true; // indica resposta assíncrona
    }

    // Visitar URL para extração de email (via fetch no service worker)
    if (msg.action === 'access') {
        (async () => {
            const text = await fetchUrlContent(msg.data.url);
            sendResponse(text);
        })();
        return true;
    }

    // Extrair emails de um website
    if (msg.action === 'email') {
        (async () => {
            const d = msg.data;
            const result = await extractemail(d.website, d.name, d.deep_search);
            const serialized = {};
            for (const k in result) serialized[k] = Array.from(result[k]);
            sendResponse(serialized);
        })();
        return true;
    }

    return false;
});
