// Carrega o Leaflet (CSS + JS) sob demanda a partir do CDN, só quando o mapa
// é realmente aberto. Antes ele era um <script> bloqueante no <head>, baixado
// em todo acesso mesmo por quem nunca usa o mapa. O promise é cacheado para
// que abrir/fechar o mapa várias vezes não recarregue nada.
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

let leafletPromise = null;

export default function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.integrity = LEAFLET_CSS_INTEGRITY;
      link.crossOrigin = '';
      link.setAttribute('data-leaflet', '');
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.integrity = LEAFLET_JS_INTEGRITY;
    script.crossOrigin = '';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      leafletPromise = null; // permite tentar de novo numa próxima abertura
      reject(new Error('Falha ao carregar o Leaflet'));
    };
    document.head.appendChild(script);
  });

  return leafletPromise;
}
