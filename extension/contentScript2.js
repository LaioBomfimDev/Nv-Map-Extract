// ================================================================
// MAPS SEARCH EXTRACTOR — Content Script 2 (document_start)
// Injeta injected.js no contexto principal (DOM) do Google Maps
// ================================================================

(function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('[Maps Search Extractor] Interceptador XHR injetado com sucesso.');
})();
