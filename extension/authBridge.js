// ============================================================================
// authBridge.js — Content script injetado no painel web.
// Lê a sessão do Supabase que o site guarda no localStorage e a repassa para
// o service worker da extensão (bg.js), que a usa para enviar leads à nuvem
// em nome do usuário logado. Somente o access token de curta duração é enviado;
// o refresh token permanece sob responsabilidade do site.
// ============================================================================
(function () {
  const manifest = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : {};
  const extensionVersion = manifest.version || '';
  const extensionName = manifest.name || 'Friendly Miner Extractor';
  const pageOrigin = window.location.origin;

  function postToPage(payload) {
    try {
      window.postMessage({ __fm: 'extension', ...payload }, pageOrigin);
    } catch (_) {}
  }

  function publishStatus(requestId) {
    try {
      document.documentElement.setAttribute('data-fm-extension', '1');
      document.documentElement.setAttribute('data-fm-extension-version', extensionVersion);
      document.documentElement.setAttribute('data-fm-extension-name', extensionName);
      postToPage({
        action: 'status',
        installed: true,
        version: extensionVersion,
        name: extensionName,
        requestId: typeof requestId === 'string' ? requestId : undefined,
      });
    } catch (_) {}
  }

  // Encontra a sessão salva pelo supabase-js: chave tipo "sb-<ref>-auth-token".
  function readSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        // v2 guarda a sessão direto; algumas versões embrulham em currentSession.
        const s = parsed.access_token ? parsed : (parsed.currentSession || null);
        if (s && s.access_token) return s;
      }
    } catch (_) {}
    return null;
  }

  function push() {
    const s = readSession();
    try {
      if (!s) {
        chrome.runtime.sendMessage({ action: 'fmAuthClear' });
        return;
      }
      chrome.runtime.sendMessage({
        action: 'fmAuth',
        data: {
          access_token: s.access_token,
          expires_at: s.expires_at || 0,       // epoch em segundos
          email: (s.user && s.user.email) || '',
        },
      });
    } catch (_) {}
  }

  // Envia ao carregar, ao focar a aba e periodicamente (o token é renovado
  // pelo próprio site; relemos o valor atualizado).
  push();
  publishStatus();
  window.addEventListener('focus', push);
  window.addEventListener('storage', push);
  window.addEventListener('focus', publishStatus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      push();
      publishStatus();
    }
  });
  setInterval(push, 30 * 1000);
  setInterval(publishStatus, 30 * 1000);

  // Marca presença da extensão para o site detectar (abas "Buscar Leads" e "Atualizações").
  publishStatus();

  // Recebe comandos do site (ex.: iniciar busca) e repassa ao service worker.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== pageOrigin) return;
    const d = event.data;
    if (!d || d.__fm !== 'site') return;
    if (d.action === 'getExtensionStatus') {
      publishStatus(d.requestId);
      return;
    }
    if (d.action === 'openExtensionsPage') {
      const requestId = typeof d.requestId === 'string' ? d.requestId : '';
      try {
        chrome.runtime.sendMessage({ action: 'fmOpenExtensionsPage', requestId }, (response) => {
          const runtimeError = chrome.runtime.lastError;
          postToPage({
            action: 'openExtensionsPageAck',
            requestId,
            ok: !runtimeError && response?.ok === true,
            error: runtimeError?.message || response?.error || '',
          });
        });
      } catch (error) {
        postToPage({ action: 'openExtensionsPageAck', requestId, ok: false, error: error?.message || 'Falha ao chamar a extensão.' });
      }
      return;
    }
    if (d.action === 'startSearch' && d.query) {
      const requestId = typeof d.requestId === 'string' ? d.requestId : '';
      const jobId = typeof d.jobId === 'string' ? d.jobId : '';
      try {
        chrome.runtime.sendMessage({
          action: 'fmStartSearch',
          requestId,
          data: {
            query: d.query,
            keyword: typeof d.keyword === 'string' ? d.keyword : d.query,
            city: typeof d.city === 'string' ? d.city : '',
            jobId,
          },
        }, (response) => {
          const runtimeError = chrome.runtime.lastError;
          postToPage({
            action: 'startSearchAck',
            requestId,
            jobId: response?.jobId || jobId,
            ok: !runtimeError && response?.ok === true,
            windowId: response?.windowId ?? null,
            error: runtimeError?.message || response?.error || '',
          });
        });
      } catch (error) {
        postToPage({
          action: 'startSearchAck',
          requestId,
          jobId,
          ok: false,
          error: error?.message || 'Falha ao iniciar a mineração.',
        });
      }
    }
  });

  // O service worker retransmite o progresso da aba do Maps para este content
  // script; daqui o evento chega à aplicação React por postMessage.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !['fmSearchProgress', 'fmSearchDone'].includes(message.action)) return false;
    postToPage({
      action: message.action === 'fmSearchDone' ? 'searchDone' : 'searchProgress',
      jobId: typeof message.jobId === 'string' ? message.jobId : '',
      ok: message.action === 'fmSearchDone' ? message.data?.ok === true : undefined,
      data: message.data && typeof message.data === 'object' ? message.data : {},
    });
    try { sendResponse({ ok: true }); } catch (_) {}
    return false;
  });
})();
