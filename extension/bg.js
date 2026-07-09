// ================================================================
// FRIENDLY MINER — Background Service Worker
// Envia os leads minerados direto para o SUPABASE (nuvem), em nome
// do usuário logado no painel. Sem backend local.
// ================================================================

importScripts('config.js');   // FM_CONFIG (URL + anon key + app url)
importScripts('js/emailExtractor.js');  // fetchUrlContent, extractemail

// ——— Sessão do usuário (recebida do painel via authBridge.js) ———————————————
async function getStoredAuth() {
    return new Promise(res => chrome.storage.local.get(['fmAuth'], d => res(d.fmAuth || null)));
}

// Retorna um access_token válido, renovando via refresh_token se expirado.
async function getValidToken() {
    const auth = await getStoredAuth();
    if (!auth || !auth.access_token) return null;

    const now = Math.floor(Date.now() / 1000);
    if (auth.expires_at && auth.expires_at - 60 > now) return auth.access_token;

    if (auth.refresh_token) {
        try {
            const r = await fetch(`${FM_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: FM_CONFIG.SUPABASE_ANON_KEY },
                body: JSON.stringify({ refresh_token: auth.refresh_token }),
            });
            if (r.ok) {
                const j = await r.json();
                const newAuth = {
                    access_token: j.access_token,
                    refresh_token: j.refresh_token,
                    expires_at: j.expires_at || (now + (j.expires_in || 3600)),
                    email: (j.user && j.user.email) || auth.email,
                };
                await new Promise(res => chrome.storage.local.set({ fmAuth: newAuth }, res));
                return newAuth.access_token;
            }
        } catch (_) { /* cai no retorno abaixo */ }
    }
    return auth.access_token; // último recurso
}

// Janela pop-up do Maps aberta pelo fluxo automático (disparado pelo site).
let fmPopupWindowId = null;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    // Site pediu para iniciar uma busca → abre o Maps numa janelinha e minera sozinho
    if (msg.action === 'fmStartSearch') {
        const q = (msg.data && msg.data.query || '').trim();
        if (!q) { try { sendResponse({ ok: false }); } catch (_) {} return false; }
        const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}#fm_auto`;
        chrome.windows.create({ url, type: 'popup', width: 1000, height: 820, focused: true }, (win) => {
            fmPopupWindowId = win ? win.id : null;
        });
        try { sendResponse({ ok: true }); } catch (_) {}
        return false;
    }

    // Extração terminou e enviou → fecha a janelinha do Maps
    if (msg.action === 'fmSearchDone') {
        if (fmPopupWindowId != null) {
            const id = fmPopupWindowId;
            fmPopupWindowId = null;
            setTimeout(() => { try { chrome.windows.remove(id); } catch (_) {} }, 2500);
        }
        return false;
    }

    // Painel enviou a sessão do usuário logado → guardar
    if (msg.action === 'fmAuth') {
        if (msg.data && msg.data.access_token) {
            chrome.storage.local.set({ fmAuth: msg.data });
        }
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
