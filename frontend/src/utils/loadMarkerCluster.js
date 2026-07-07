// Carrega o plugin Leaflet.markercluster sob demanda, em cima do Leaflet.
// Usado pela aba Mapa para agrupar os pontos em "rosquinhas" (donut) que
// mostram a proporção de temas por região quando o usuário tira o zoom.
// Se o plugin falhar, quem chama pode cair para pontos simples (loadLeaflet).
import loadLeaflet from './loadLeaflet';

const MC_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const MC_JS_INTEGRITY = 'sha256-Hk4dIpcqOSb0hZjgyvFOP+cEmDXUKKNE/tT542ZbNQg=';
const MC_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
const MC_CSS_INTEGRITY = 'sha256-YU3qCpj/P06tdPBJGPax0bm6Q1wltfwjsho5TR4+TYc=';

let mcPromise = null;

export default function loadMarkerCluster() {
  if (window.L && window.L.MarkerClusterGroup) return Promise.resolve(window.L);
  if (mcPromise) return mcPromise;

  mcPromise = loadLeaflet().then(L => new Promise((resolve, reject) => {
    if (L.MarkerClusterGroup) return resolve(L);

    if (!document.querySelector('link[data-markercluster]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MC_CSS;
      link.integrity = MC_CSS_INTEGRITY;
      link.crossOrigin = '';
      link.setAttribute('data-markercluster', '');
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = MC_JS;
    script.integrity = MC_JS_INTEGRITY;
    script.crossOrigin = '';
    script.async = true;
    script.onload = () => resolve(L);
    script.onerror = () => {
      mcPromise = null; // permite tentar de novo numa próxima abertura
      reject(new Error('Falha ao carregar o Leaflet.markercluster'));
    };
    document.head.appendChild(script);
  }));

  return mcPromise;
}
