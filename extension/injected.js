// ================================================================
// MAPS SEARCH EXTRACTOR — Interceptador (contexto da página)
// Escuta as respostas do endpoint /search do Google Maps.
// Precisa cobrir XHR *e* fetch: buscas grandes usam XHR na paginação,
// mas buscas pequenas (1–2 resultados) chegam via fetch no carregamento.
// ================================================================
(function () {

    function isSearchUrl(url) {
        return typeof url === 'string' && url.includes('/search');
    }

    function emit(text) {
        try { window.postMessage({ type: 'search', data: text }, '*'); }
        catch (e) { console.error('[MSE] Erro ao postar resposta:', e); }
    }

    // ——— Hook de XMLHttpRequest ————————————————————————————————————
    (function (proto) {
        const origOpen = proto.open;
        const origSend = proto.send;

        proto.open = function (method, url) {
            this._mse_url = url;
            return origOpen.apply(this, arguments);
        };

        proto.send = function (body) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4 && isSearchUrl(this._mse_url)) {
                    emit(this.response);
                }
            });
            return origSend.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype);

    // ——— Hook de fetch ————————————————————————————————————————————
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const promise = origFetch.apply(this, arguments);
            if (isSearchUrl(url)) {
                promise.then((res) => {
                    try { res.clone().text().then(emit).catch(() => {}); } catch (e) {}
                }).catch(() => {});
            }
            return promise;
        };
    }

    console.log('[Maps Search Extractor] Interceptador (XHR + fetch) ativo.');
})();
