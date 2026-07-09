// Motor geográfico da aba Mapa.
// Base estática de municípios do IBGE (public/data/municipios.json, gerada de
// kelvins/municipios-brasileiros + Censo 2022) + malhas municipais da API do
// IBGE, e a inteligência de sugestões: densidade medida × população.
import { themeKeyOf } from './themeColors';
import { isContacted } from '../statuses';

const GMAPS_SEARCH_BASE = 'https://www.google.com/maps/search/';

let bridgeListenerInstalled = false;
let lastBridgeStatusAt = 0;

function canUseBrowserBridge() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof window.postMessage === 'function';
}

function rememberBridgeStatus() {
  lastBridgeStatusAt = Date.now();
}

function ensureBridgeStatusListener() {
  if (bridgeListenerInstalled || !canUseBrowserBridge()) return;
  bridgeListenerInstalled = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (d && d.__fm === 'extension' && d.action === 'status' && d.installed) {
      rememberBridgeStatus();
    }
  });
}

ensureBridgeStatusListener();

export function requestExtensionStatus() {
  if (!canUseBrowserBridge()) return false;
  ensureBridgeStatusListener();
  try {
    window.postMessage({ __fm: 'site', action: 'getExtensionStatus' }, '*');
    return true;
  } catch (_) {
    return false;
  }
}

export function hasExtensionBridge() {
  if (!canUseBrowserBridge()) return false;
  ensureBridgeStatusListener();
  const hasMarker = document.documentElement.getAttribute('data-fm-extension') === '1';
  const hasRecentStatus = lastBridgeStatusAt && (Date.now() - lastBridgeStatusAt < 90 * 1000);
  return !!(hasMarker || hasRecentStatus);
}

function cleanSearchQuery(query) {
  return String(query || '').replace(/\s+/g, ' ').trim();
}

// ── Base de municípios (nome, UF, coords, população) ────────────────────────
// Formato do JSON: [[codigo_ibge, nome, uf, lat, lng, pop], ...]
let muniPromise = null;

export function loadMunicipios() {
  if (!muniPromise) {
    muniPromise = fetch(`${process.env.PUBLIC_URL || ''}/data/municipios.json`)
      .then(r => { if (!r.ok) throw new Error('Falha ao carregar municípios'); return r.json(); })
      .then(rows => rows.map(([code, nome, uf, lat, lng, pop]) => ({ code, nome, uf, lat, lng, pop })))
      .catch(e => { muniPromise = null; throw e; });
  }
  return muniPromise;
}

// ── Malhas municipais (contornos) por estado, via API do IBGE ────────────────
export const UF_CODES = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53,
};

const meshCache = {};

export function loadUfMesh(uf) {
  const code = UF_CODES[uf];
  if (!code) return Promise.reject(new Error(`UF desconhecida: ${uf}`));
  if (!meshCache[uf]) {
    const fmt = encodeURIComponent('application/vnd.geo+json');
    meshCache[uf] = fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?formato=${fmt}&qualidade=minima&intrarregiao=municipio`)
      .then(r => { if (!r.ok) throw new Error('Falha na malha do IBGE'); return r.json(); })
      .catch(e => { delete meshCache[uf]; throw e; });
  }
  return meshCache[uf];
}

// ── Geometria ────────────────────────────────────────────────────────────────
export function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestMuni(munis, lat, lng) {
  let best = null, bd = Infinity;
  for (const m of munis) {
    const d = haversineKm(lat, lng, m.lat, m.lng);
    if (d < bd) { bd = d; best = m; }
  }
  return { muni: best, dist: bd };
}

// ── Cidades visitadas ────────────────────────────────────────────────────────
// Agrupa os leads pela cidade da busca (ou por coordenada arredondada quando a
// busca não tem cidade) e casa cada grupo com o município mais próximo do
// centroide — sem geocoding, só com os dados que o scrapper já trouxe.
// Retorna Map codigo_ibge -> { muni, themes: Map tema -> {count, contacted}, total, contacted }
export function computeVisited(plotted, munis) {
  const groups = new Map();
  for (const l of plotted) {
    const lat = parseFloat(l.latitude), lng = parseFloat(l.longitude);
    const city = (l.search_city || '').trim().toLowerCase();
    const key = city || `@${lat.toFixed(1)},${lng.toFixed(1)}`;
    let g = groups.get(key);
    if (!g) { g = { latSum: 0, lngSum: 0, leads: [] }; groups.set(key, g); }
    g.latSum += lat; g.lngSum += lng; g.leads.push(l);
  }

  const visited = new Map();
  for (const g of groups.values()) {
    const n = g.leads.length;
    const { muni } = nearestMuni(munis, g.latSum / n, g.lngSum / n);
    if (!muni) continue;
    let v = visited.get(muni.code);
    if (!v) { v = { muni, themes: new Map(), total: 0, contacted: 0 }; visited.set(muni.code, v); }
    for (const l of g.leads) {
      const tk = themeKeyOf(l.search_keyword);
      let t = v.themes.get(tk);
      if (!t) { t = { count: 0, contacted: 0 }; v.themes.set(tk, t); }
      t.count++; v.total++;
      if (isContacted(l.prospect_status)) { t.contacted++; v.contacted++; }
    }
  }
  return visited;
}

// ── Densidade medida por tema ────────────────────────────────────────────────
// Ex.: 40 clínicas em Catu (48 mil hab.) => 40/48000 per capita. A densidade
// de cada tema considera só as cidades onde aquele tema já foi pesquisado.
export function computeDensities(visited) {
  const agg = new Map();
  for (const v of visited.values()) {
    for (const [tk, t] of v.themes) {
      let a = agg.get(tk);
      if (!a) { a = { count: 0, pop: 0 }; agg.set(tk, a); }
      a.count += t.count;
      if (v.muni.pop > 0) a.pop += v.muni.pop;
    }
  }
  const out = new Map();
  for (const [tk, a] of agg) {
    if (a.pop > 0) out.set(tk, { perCapita: a.count / a.pop, total: a.count });
  }
  return out;
}

// ── Sugestões: EXPANDIR (tema conhecido, cidade vizinha nova) ────────────────
// Estimativa = densidade medida × população da vizinha; ranking penaliza a
// distância (uma cidade 2× mais longe precisa render ~proporcionalmente mais).
export function computeSuggestions(visited, munis, densities, { maxKm = 100, minEst = 0, themeKey = '' } = {}) {
  const visArr = [...visited.values()];
  if (!visArr.length || !densities.size) return [];
  const out = [];
  for (const m of munis) {
    if (visited.has(m.code) || !m.pop) continue;
    let dist = Infinity, from = null;
    for (const v of visArr) {
      const d = haversineKm(m.lat, m.lng, v.muni.lat, v.muni.lng);
      if (d < dist) { dist = d; from = v.muni; }
    }
    if (dist > maxKm) continue;
    const ests = [];
    for (const [tk, d] of densities) {
      if (themeKey && tk !== themeKey) continue;
      const est = Math.round(d.perCapita * m.pop);
      if (est > 0) ests.push({ themeKey: tk, est });
    }
    ests.sort((a, b) => b.est - a.est);
    if (!ests.length || ests[0].est < minEst) continue;
    out.push({ muni: m, dist: Math.round(dist), from, ests, score: ests[0].est / (1 + dist / 40) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 15);
}

// ── Sugestões: APROFUNDAR (cidade já visitada, tema ainda não pesquisado lá) ─
export function computeDeepen(visited, densities, { minEst = 0, themeKey = '' } = {}) {
  const out = [];
  for (const v of visited.values()) {
    if (!v.muni.pop) continue;
    for (const [tk, d] of densities) {
      if (themeKey && tk !== themeKey) continue;
      if (v.themes.has(tk)) continue;
      const est = Math.round(d.perCapita * v.muni.pop);
      if (est < Math.max(1, minEst)) continue;
      out.push({ muni: v.muni, themeKey: tk, est });
    }
  }
  out.sort((a, b) => b.est - a.est);
  return out.slice(0, 10);
}

// Texto da busca "tema em Cidade - UF" — o que a extensão recebe/pesquisa.
export function gmapsQuery(themeLabel, muni) {
  const theme = cleanSearchQuery(themeLabel);
  const city = cleanSearchQuery(muni?.nome);
  const uf = cleanSearchQuery(muni?.uf);
  if (!theme || !city) return theme;
  return cleanSearchQuery(`${theme} em ${city}${uf ? ` - ${uf}` : ''}`);
}

export function gmapsSearchUrlForQuery(query) {
  const q = cleanSearchQuery(query);
  return q ? `${GMAPS_SEARCH_BASE}${encodeURIComponent(q)}#fm_auto` : '';
}

// URL do Google Maps já com a busca e a hash #fm_auto, que faz a extensão
// iniciar a extração sozinha (fallback para quando não há a ponte da extensão).
export function gmapsSearchUrl(themeLabel, muni) {
  return gmapsSearchUrlForQuery(gmapsQuery(themeLabel, muni));
}

// Dispara a mineração AUTOMÁTICA de uma busca, igual ao botão "Minerar" da aba
// Buscar Leads: se a extensão está presente (marca o <html> com data-fm-extension),
// usa a mesma ponte (postMessage → extensão abre a janelinha, minera, envia e
// fecha sozinha). Sem a extensão, abre o Maps com #fm_auto num tab novo.
export function startMineQuery(query) {
  const q = cleanSearchQuery(query);
  const url = gmapsSearchUrlForQuery(q);
  if (!q) return { ok: false, mode: 'empty', query: q, url };
  if (!canUseBrowserBridge()) return { ok: false, mode: 'unavailable', query: q, url };

  requestExtensionStatus();

  if (hasExtensionBridge()) {
    try {
      window.postMessage({ __fm: 'site', action: 'startSearch', query: q }, '*');
      return { ok: true, mode: 'bridge', query: q, url };
    } catch (_) {
      // If the bridge marker is stale or blocked, fall through to Maps.
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, mode: 'fallback', query: q, url };
}

// Conveniência: minera o tema numa cidade (tema + município).
export function startMineOnMaps(themeLabel, muni) {
  return startMineQuery(gmapsQuery(themeLabel, muni));
}
