// ================================================================
// FRIENDLY MINER — Background Service Worker
// Envia os leads minerados direto para o SUPABASE (nuvem), em nome
// do usuário logado no painel. Sem backend local.
// ================================================================

importScripts('config.js');   // FM_CONFIG (URL + anon key + app url)
importScripts('js/emailExtractor.js');  // fetchUrlContent, extractemail

// ——— Sessão do usuário (recebida do painel via authBridge.js) ———————————————
async function getStoredAuth() {
    return new Promise(res => chrome.storage.local.get(['fmAuth'], d => {
        const stored = d.fmAuth || null;
        if (!stored) { res(null); return; }
        // Migra instalações antigas: refresh tokens nunca devem permanecer na extensão.
        const sanitized = {
            access_token: stored.access_token || '',
            expires_at: stored.expires_at || 0,
            email: stored.email || '',
        };
        if (Object.prototype.hasOwnProperty.call(stored, 'refresh_token')) {
            chrome.storage.local.set({ fmAuth: sanitized });
        }
        res(sanitized);
    }));
}

// Retorna o access_token curto que o painel renova e reenvia periodicamente.
async function getValidToken() {
    const auth = await getStoredAuth();
    if (!auth || !auth.access_token) return null;

    const now = Math.floor(Date.now() / 1000);
    if (!auth.expires_at || auth.expires_at - 60 > now) return auth.access_token;
    return null;
}

// Janela pop-up do Maps aberta pelo fluxo automático (disparado pelo site).
let fmPopupWindowId = null;
let fmActiveSearch = null;

try {
    chrome.storage.session.get(['fmActiveSearch', 'fmPopupWindowId'], stored => {
        if (chrome.runtime.lastError) return;
        fmActiveSearch = stored.fmActiveSearch || null;
        fmPopupWindowId = stored.fmPopupWindowId ?? null;
    });
} catch (_) {}

function storeActiveSearch() {
    try { chrome.storage.session.set({ fmActiveSearch, fmPopupWindowId }); } catch (_) {}
}

function clearActiveSearch() {
    try { chrome.storage.session.remove(['fmActiveSearch', 'fmPopupWindowId']); } catch (_) {}
}

const FM_PANEL_URLS = [
    'https://nv-map-extract.vercel.app/*',
    'http://localhost:3000/*',
    'http://localhost:3008/*',
    'http://127.0.0.1:3000/*',
    'http://127.0.0.1:3008/*',
];

function relaySearchEvent(action, data) {
    const payload = {
        ...(data && typeof data === 'object' ? data : {}),
        jobId: (data && data.jobId) || (fmActiveSearch && fmActiveSearch.jobId) || '',
        keyword: (data && data.keyword) || (fmActiveSearch && fmActiveSearch.keyword) || '',
        city: (data && data.city) || (fmActiveSearch && fmActiveSearch.city) || '',
    };
    try {
        chrome.tabs.query({ url: FM_PANEL_URLS }, (tabs) => {
            if (chrome.runtime.lastError) return;
            (tabs || []).forEach(tab => {
                if (tab.id == null) return;
                try { chrome.tabs.sendMessage(tab.id, { action, jobId: payload.jobId, data: payload }); } catch (_) {}
            });
        });
    } catch (_) {}
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    // Site pediu para iniciar uma busca → abre o Maps numa janelinha e minera sozinho
    if (msg.action === 'fmStartSearch') {
        const q = (msg.data && msg.data.query || '').trim();
        const keyword = (msg.data && msg.data.keyword || q).trim();
        const city = (msg.data && msg.data.city || '').trim();
        const jobId = (msg.data && msg.data.jobId || '').trim();
        if (!q) {
            try { sendResponse({ ok: false, jobId, error: 'Informe um termo para iniciar a mineração.' }); } catch (_) {}
            return false;
        }
        const jobMeta = encodeURIComponent(JSON.stringify({ jobId, query: q, keyword, city }));
        const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}#fm_auto=${jobMeta}`;
        chrome.windows.create({ url, type: 'popup', width: 1000, height: 820, focused: true }, (win) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError || !win) {
                try { sendResponse({ ok: false, jobId, error: runtimeError?.message || 'O Chrome não criou a janela de mineração.' }); } catch (_) {}
                return;
            }
            fmPopupWindowId = win ? win.id : null;
            fmActiveSearch = { jobId, keyword, city, startedAt: Date.now() };
            storeActiveSearch();
            try { sendResponse({ ok: true, jobId, windowId: fmPopupWindowId }); } catch (_) {}
        });
        return true;
    }

    // Progresso vindo do content script da janela do Maps.
    if (msg.action === 'fmSearchProgress') {
        relaySearchEvent('fmSearchProgress', msg.data || {});
        try { sendResponse({ ok: true, jobId: (msg.data && msg.data.jobId) || (fmActiveSearch && fmActiveSearch.jobId) || '' }); } catch (_) {}
        return false;
    }

    // Extração terminou e enviou → fecha a janelinha do Maps
    if (msg.action === 'fmSearchDone') {
        const doneData = {
            ...(msg.data && typeof msg.data === 'object' ? msg.data : {}),
            jobId: (msg.data && msg.data.jobId) || (fmActiveSearch && fmActiveSearch.jobId) || '',
            ok: msg.ok === true,
        };
        relaySearchEvent('fmSearchDone', doneData);
        if (doneData.ok && fmPopupWindowId != null) {
            const id = fmPopupWindowId;
            fmPopupWindowId = null;
            setTimeout(() => {
                try { chrome.windows.remove(id, () => void chrome.runtime.lastError); } catch (_) {}
            }, 2500);
        }
        if (doneData.ok) {
            fmActiveSearch = null;
            clearActiveSearch();
        } else {
            storeActiveSearch();
        }
        try { sendResponse({ ok: true, jobId: doneData.jobId }); } catch (_) {}
        return false;
    }

    // Atalho do painel para abrir a tela de extensões do Chrome.
    if (msg.action === 'fmOpenExtensionsPage') {
        try {
            chrome.tabs.create({ url: 'chrome://extensions/' }, (tab) => {
                const runtimeError = chrome.runtime.lastError;
                try {
                    sendResponse(runtimeError || !tab
                        ? { ok: false, error: runtimeError?.message || 'Não foi possível abrir a página de extensões.' }
                        : { ok: true, tabId: tab.id });
                } catch (_) {}
            });
        } catch (error) {
            try { sendResponse({ ok: false, error: error?.message || 'Não foi possível abrir a página de extensões.' }); } catch (_) {}
            return false;
        }
        return true;
    }

    // Painel enviou a sessão do usuário logado → guardar
    if (msg.action === 'fmAuth') {
        if (msg.data && msg.data.access_token) {
            chrome.storage.local.set({
                fmAuth: {
                    access_token: msg.data.access_token,
                    expires_at: msg.data.expires_at || 0,
                    email: msg.data.email || '',
                },
            });
        }
        return false;
    }

    if (msg.action === 'fmAuthClear') {
        chrome.storage.local.remove('fmAuth');
        return false;
    }

    // Abrir página de resultados no dashboard interno da extensão
    if (msg.action === 'openPage') {
        chrome.storage.local.set({ leads: msg.data }, () => {
            chrome.tabs.create({ url: 'dashboard.html' });
        });
        return false;
    }

    // Enviar leads minerados para o Supabase (nuvem)
    if (msg.action === 'sendToDashboard') {
        (async () => {
            const token = await getValidToken();
            if (!token) {
                sendResponse({ success: false, message: 'Você não está logado. Abra o painel e entre com o Google.' });
                return;
            }
            const { leads, keyword, city } = msg.data;
            try {
                const response = await fetch(`${FM_CONFIG.SUPABASE_URL}/rest/v1/rpc/import_leads`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: FM_CONFIG.SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ p_keyword: keyword || '', p_city: city || '', p_leads: leads }),
                });
                if (!response.ok) {
                    const t = await response.text();
                    sendResponse({ success: false, message: `Erro ${response.status}: ${t.slice(0, 140)}` });
                    return;
                }
                const data = await response.json();
                sendResponse({
                    success: true,
                    message: `Enviado! ${data.inserted || 0} novos, ${data.merged || 0} mesclados`,
                    data,
                });
            } catch (err) {
                console.error('[Friendly Miner] Erro ao enviar para a nuvem:', err);
                sendResponse({ success: false, message: 'Falha ao enviar para a nuvem. Verifique sua conexão.' });
            }
        })();
        return true; // resposta assíncrona
    }

    // Visitar URL para extração de email (via fetch no service worker)
    if (msg.action === 'access') {
        (async () => {
            const text = await fetchUrlContent(msg.data.url);
            sendResponse(text);
        })();
        return true;
    }

    // Extrair emails/redes de um website
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
