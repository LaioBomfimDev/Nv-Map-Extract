// ============================================================================
// authBridge.js — Content script injetado no PAINEL (Vercel / localhost:3008).
// Lê a sessão do Supabase que o site guarda no localStorage e a repassa para
// o service worker da extensão (bg.js), que a usa para enviar leads à nuvem
// em nome do usuário logado. Assim o amigo faz login UMA vez no site.
// ============================================================================
(function () {
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
    if (!s) return;
    try {
      chrome.runtime.sendMessage({
        action: 'fmAuth',
        data: {
          access_token: s.access_token,
          refresh_token: s.refresh_token || '',
          expires_at: s.expires_at || 0,       // epoch em segundos
          email: (s.user && s.user.email) || '',
        },
      });
    } catch (_) {}
  }

  // Envia ao carregar, ao focar a aba e periodicamente (o token é renovado
  // pelo próprio site; relemos o valor atualizado).
  push();
  window.addEventListener('focus', push);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) push(); });
  setInterval(push, 4 * 60 * 1000); // a cada 4 min

  // Marca presença da extensão para o site detectar (aba "Buscar Leads").
  document.documentElement.setAttribute('data-fm-extension', '1');

  // Recebe comandos do site (ex.: iniciar busca) e repassa ao service worker.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.__fm !== 'site') return;
    if (d.action === 'startSearch' && d.query) {
      try { chrome.runtime.sendMessage({ action: 'fmStartSearch', data: { query: d.query } }); } catch (_) {}
    }
  });
})();
