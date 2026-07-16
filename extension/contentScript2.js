// ================================================================
// MAPS SEARCH EXTRACTOR — Content Script 2 (document_start)
// Injeta injected.js no contexto principal (DOM) do Google Maps
// ================================================================

(function () {
    // O Maps costuma reescrever a URL antes do document_end. Preserva os dados
    // do trabalho de mineração no DOM para o script principal recuperá-los.
    try {
        const initialHash = location.hash || '';
        if (initialHash.includes('fm_auto')) {
            document.documentElement.setAttribute('data-fm-auto-hash', initialHash);
        }
    } catch (_) {}

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('[Maps Search Extractor] Interceptador XHR injetado com sucesso.');
})();
