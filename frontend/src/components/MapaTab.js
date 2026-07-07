import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import loadMarkerCluster from '../utils/loadMarkerCluster';
import loadLeaflet from '../utils/loadLeaflet';
import {
  THEME_PALETTE, themeKeyOf, themeLabelOf, loadThemePrefs, saveThemePrefs,
} from '../utils/themeColors';
import {
  loadMunicipios, loadUfMesh, computeVisited, computeDensities,
  computeSuggestions, computeDeepen, gmapsSearchUrl,
} from '../utils/geo';
import { isContacted } from '../statuses';
import MapaSuggestions from './MapaSuggestions';
import { Map as MapIcon, Send, Building2 } from './Icons';

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_OPTS = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
};
const CONTACTED_COLOR = '#22c55e';
const SUGGEST_COLOR = '#f59e0b';

const num = (v) => (Number(v || 0)).toLocaleString('pt-BR');
const popShort = (p) => p >= 1000000 ? `${(p / 1000000).toFixed(1)} mi` : p >= 1000 ? `${Math.round(p / 1000)} mil` : String(p);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

function hasCoords(l) {
  const lat = parseFloat(l.latitude), lng = parseFloat(l.longitude);
  return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
}

// Ícone de um ponto: círculo na cor do tema; anel verde se já foi contatado.
function pointIcon(L, color, contacted) {
  const ring = contacted ? CONTACTED_COLOR : 'rgba(0,0,0,0.5)';
  const rw = contacted ? 3 : 1.5;
  return L.divIcon({
    className: 'mapa-point',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -9],
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};border:${rw}px solid ${ring};box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></span>`,
  });
}

// SVG da "rosquinha" de um cluster: fatias por tema + arco verde de progresso
// (proporção já contatada) + o total no centro.
function donutSvg(segments, total, contacted) {
  const d = Math.round(Math.max(44, Math.min(72, 40 + Math.sqrt(total) * 4)));
  const c = d / 2;
  const rProg = c - 3, wProg = 4;
  const rDon = c - 12, wDon = 11;
  const Cp = 2 * Math.PI * rProg;
  const Cd = 2 * Math.PI * rDon;
  const progLen = total ? (contacted / total) * Cp : 0;

  let offset = 0;
  const slices = segments.map(s => {
    const len = (s.value / total) * Cd;
    const el = `<circle cx="${c}" cy="${c}" r="${rDon}" fill="none" stroke="${s.color}" stroke-width="${wDon}" stroke-dasharray="${len} ${Cd}" stroke-dashoffset="${-offset}"/>`;
    offset += len;
    return el;
  }).join('');

  return `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-90 ${c} ${c})">
      <circle cx="${c}" cy="${c}" r="${rProg}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="${wProg}"/>
      <circle cx="${c}" cy="${c}" r="${rProg}" fill="none" stroke="${CONTACTED_COLOR}" stroke-width="${wProg}" stroke-dasharray="${progLen} ${Cp}" stroke-linecap="round"/>
      ${slices}
    </g>
    <circle cx="${c}" cy="${c}" r="${rDon - 6}" fill="#18181b"/>
    <text x="${c}" y="${c}" dy="0.35em" text-anchor="middle" font-size="12" font-weight="700" fill="#fafafa" font-family="Inter,sans-serif">${total}</text>
  </svg>`;
}

function makeClusterIcon(cluster) {
  const L = window.L;
  const children = cluster.getAllChildMarkers();
  const byColor = {};
  let contacted = 0;
  children.forEach(m => {
    const t = m.options.__theme || {};
    byColor[t.color] = (byColor[t.color] || 0) + 1;
    if (t.contacted) contacted++;
  });
  const segments = Object.entries(byColor).map(([color, value]) => ({ color, value }));
  const total = children.length;
  const d = Math.round(Math.max(44, Math.min(72, 40 + Math.sqrt(total) * 4)));
  return L.divIcon({
    className: 'mapa-cluster',
    iconSize: [d, d],
    html: donutSvg(segments, total, contacted),
  });
}

function popupHtml(lead, contacted) {
  const digits = (lead.phone || '').replace(/\D/g, '');
  const wa = digits ? `https://wa.me/${digits.startsWith('55') ? digits : '55' + digits}` : null;
  const btn = (href, bg, label) => `<a href="${href}" target="_blank" rel="noreferrer" style="background:${bg};color:#fff;padding:4px 8px;font-size:11px;text-decoration:none;font-weight:600;">${label}</a>`;
  return `<div style="font-family:'Inter',sans-serif;color:#fafafa;padding:6px;min-width:190px;background:#18181b;">
    <h4 style="margin:0 0 4px;font-size:13px;font-weight:700;color:#fafafa;">${escapeHtml(lead.name)}</h4>
    <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;">${escapeHtml(lead.search_keyword || lead.category || 'Sem tema')}</p>
    <p style="margin:0 0 8px;font-size:11px;color:#52525b;">${escapeHtml(lead.address || 'Sem endereço')}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${wa ? btn(wa, '#10b981', 'WhatsApp') : ''}
      ${lead.website ? btn(lead.website, '#06b6d4', 'Site') : ''}
      ${contacted
        ? `<span style="color:${CONTACTED_COLOR};font-size:11px;font-weight:600;align-self:center;">✓ contatado</span>`
        : `<button data-mark="${lead.id}" style="background:#8b5cf6;color:#fff;border:none;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">Marcar enviado</button>`}
    </div>
  </div>`;
}

// Popup de um município (clicando no contorno cinza ou numa sugestão).
function muniPopupHtml(muni, visitedEntry, densities, labelOf, colorOf, extra = '') {
  let body = '';
  if (visitedEntry) {
    const lines = [...visitedEntry.themes.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([tk, t]) => `<div style="font-size:11px;color:#a1a1aa;"><span style="color:${colorOf(tk)};font-weight:600;">${num(t.count)}</span> ${escapeHtml(labelOf(tk))} · <span style="color:${CONTACTED_COLOR};">${num(t.contacted)} contatados</span></div>`)
      .join('');
    body = `<div style="margin:4px 0 8px;">${lines}</div>`;
  } else if (densities.size) {
    const ests = [...densities.entries()]
      .map(([tk, d]) => ({ tk, est: Math.round(d.perCapita * muni.pop) }))
      .filter(e => e.est > 0)
      .sort((a, b) => b.est - a.est)
      .slice(0, 4);
    const lines = ests.map(e => `<div style="font-size:11px;color:#a1a1aa;">~<span style="color:${colorOf(e.tk)};font-weight:600;">${num(e.est)}</span> ${escapeHtml(labelOf(e.tk))}</div>`).join('');
    const top = ests[0];
    const link = top ? `<a href="${gmapsSearchUrl(labelOf(top.tk), muni)}" target="_blank" rel="noreferrer" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;padding:4px 8px;font-size:11px;text-decoration:none;font-weight:600;">Minerar no Google Maps</a>` : '';
    body = `<div style="margin:4px 0 8px;">${lines}<div style="font-size:10px;color:#52525b;margin-top:2px;">estimativa pelo seu histórico</div></div>${link}`;
  }
  return `<div style="font-family:'Inter',sans-serif;color:#fafafa;padding:6px;min-width:180px;background:#18181b;">
    <h4 style="margin:0;font-size:13px;font-weight:700;">${escapeHtml(muni.nome)} <span style="color:#52525b;font-weight:400;">— ${muni.uf}</span></h4>
    <p style="margin:2px 0 0;font-size:11px;color:#71717a;">pop. ${popShort(muni.pop)}${extra}</p>
    ${body}
  </div>`;
}

export default function MapaTab() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [mapReady, setMapReady] = useState(0);
  const [prefs, setPrefs] = useState(loadThemePrefs);
  const [editingKey, setEditingKey] = useState(null);
  const [munis, setMunis] = useState(null);
  const [muniError, setMuniError] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [sugControls, setSugControls] = useState({ maxKm: 100, minEst: 0, themeKey: '' });

  const mapDiv = useRef(null);
  const mapInst = useRef(null);
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const sugGroupRef = useRef(null);
  const sugMarkersRef = useRef(new Map());
  const pluginRef = useRef(false);
  const fitted = useRef(false);
  const markSentRef = useRef(() => {});

  // Busca todos os leads com coordenadas uma vez.
  useEffect(() => {
    let cancelled = false;
    api.getMapLeads()
      .then(r => { if (!cancelled) setLeads(r.data || []); })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os leads do mapa.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Carrega o Leaflet + plugin de cluster (com fallback para pontos simples).
  useEffect(() => {
    let cancelled = false;
    loadMarkerCluster()
      .then(L => { if (!cancelled) { pluginRef.current = !!L.MarkerClusterGroup; setReady(true); } })
      .catch(() => loadLeaflet()
        .then(() => { if (!cancelled) { pluginRef.current = false; setReady(true); } })
        .catch(() => { if (!cancelled) setError('Falha ao carregar o mapa.'); }));
    return () => { cancelled = true; };
  }, []);

  // Base de municípios do IBGE (nome, coords, população) — usada pelas fases 2 e 3.
  useEffect(() => {
    let cancelled = false;
    loadMunicipios()
      .then(m => { if (!cancelled) setMunis(m); })
      .catch(() => { if (!cancelled) setMuniError('Base de municípios indisponível — sugestões desativadas.'); });
    return () => { cancelled = true; };
  }, []);

  const plotted = useMemo(() => leads.filter(hasCoords), [leads]);

  // Estatística por tema (base da legenda e das cores).
  const themeStats = useMemo(() => {
    const map = new Map();
    plotted.forEach(l => {
      const key = themeKeyOf(l.search_keyword);
      let s = map.get(key);
      if (!s) { s = { key, label: themeLabelOf(l.search_keyword), total: 0, contacted: 0 }; map.set(key, s); }
      s.total++;
      if (isContacted(l.prospect_status)) s.contacted++;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [plotted]);

  // Garante que todo tema tem cor/rótulo (auto-atribui a próxima cor livre).
  useEffect(() => {
    if (!themeStats.length) return;
    let changed = false;
    const next = { ...prefs };
    const used = new Set(Object.values(next).map(p => p.color));
    let pi = 0;
    const freeColor = () => {
      for (let i = 0; i < THEME_PALETTE.length; i++) {
        const c = THEME_PALETTE[(pi + i) % THEME_PALETTE.length];
        if (!used.has(c)) { pi += i + 1; used.add(c); return c; }
      }
      return THEME_PALETTE[(pi++) % THEME_PALETTE.length];
    };
    themeStats.forEach(s => {
      if (!next[s.key]) { next[s.key] = { color: freeColor(), label: s.label }; changed = true; }
    });
    if (changed) { setPrefs(next); saveThemePrefs(next); }
  }, [themeStats]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelOf = (tk) => prefs[tk]?.label || tk;
  const colorOf = (tk) => prefs[tk]?.color || '#a1a1aa';

  // ── Inteligência geográfica (fase 3) ─────────────────────────────────────
  const visited = useMemo(
    () => (munis && plotted.length ? computeVisited(plotted, munis) : null),
    [plotted, munis]
  );
  const densities = useMemo(() => (visited ? computeDensities(visited) : new Map()), [visited]);
  const suggestions = useMemo(
    () => (visited && munis ? computeSuggestions(visited, munis, densities, sugControls) : []),
    [visited, munis, densities, sugControls]
  );
  const deepen = useMemo(
    () => (visited ? computeDeepen(visited, densities, sugControls) : []),
    [visited, densities, sugControls]
  );

  // Marca um lead como "enviado" direto do popup do mapa (via ref para o
  // handler nativo do Leaflet não capturar um estado antigo).
  markSentRef.current = async (id) => {
    try {
      await api.updateResultStatus(id, 'enviado');
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, prospect_status: 'enviado' } : l)));
    } catch { /* mantém como estava */ }
  };

  // Inicializa o mapa quando o Leaflet estiver pronto.
  useEffect(() => {
    if (!ready || !window.L || !mapDiv.current || mapInst.current) return;
    const L = window.L;
    mapInst.current = L.map(mapDiv.current, {
      center: [-14.235, -51.925], zoom: 4, zoomControl: true, worldCopyJump: true,
    });
    L.tileLayer(DARK_TILES, TILE_OPTS).addTo(mapInst.current);
    groupRef.current = pluginRef.current
      ? L.markerClusterGroup({
          maxClusterRadius: 55,
          showCoverageOnHover: false,
          disableClusteringAtZoom: 15,
          chunkedLoading: true,
          iconCreateFunction: makeClusterIcon,
        })
      : L.featureGroup();
    groupRef.current.addTo(mapInst.current);
    sugGroupRef.current = L.featureGroup().addTo(mapInst.current);

    // Botão "Marcar enviado" dentro dos popups (HTML puro -> listener aqui).
    mapInst.current.on('popupopen', (e) => {
      const btn = e.popup.getElement()?.querySelector('[data-mark]');
      if (btn) {
        btn.onclick = () => {
          markSentRef.current(btn.getAttribute('data-mark'));
          mapInst.current?.closePopup();
        };
      }
    });

    setMapReady(x => x + 1);
    return () => {
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null; groupRef.current = null; sugGroupRef.current = null; meshRef.current = null;
      }
    };
  }, [ready]);

  // (Re)desenha os pontos quando os leads, as cores ou os filtros mudam.
  useEffect(() => {
    const L = window.L;
    const group = groupRef.current;
    if (!ready || !L || !group || !mapReady) return;

    group.clearLayers();
    const markers = [];
    plotted.forEach(l => {
      const key = themeKeyOf(l.search_keyword);
      const pref = prefs[key];
      if (!pref || pref.hidden) return;
      const contacted = isContacted(l.prospect_status);
      if (onlyPending && contacted) return;
      const m = L.marker([parseFloat(l.latitude), parseFloat(l.longitude)], {
        icon: pointIcon(L, pref.color, contacted),
        __theme: { key, color: pref.color, contacted },
      });
      m.bindPopup(popupHtml(l, contacted));
      markers.push(m);
    });

    if (group.addLayers) group.addLayers(markers);
    else markers.forEach(m => group.addLayer(m));

    if (!fitted.current && markers.length) {
      const b = L.latLngBounds(markers.map(m => m.getLatLng()));
      if (b.isValid()) mapInst.current.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
      fitted.current = true;
    }
  }, [mapReady, plotted, prefs, ready, onlyPending]);

  // ── Fase 2: contornos dos municípios (cinza = ainda não visitado) ─────────
  // Busca a malha do IBGE só dos estados onde você já tem leads.
  useEffect(() => {
    const L = window.L;
    if (!ready || !L || !mapInst.current || !mapReady || !visited || !munis) return;
    const ufs = [...new Set([...visited.values()].map(v => v.muni.uf))].filter(Boolean);
    if (!ufs.length) return;

    const byCode = new Map(munis.map(m => [m.code, m]));
    let cancelled = false;

    Promise.all(ufs.map(uf => loadUfMesh(uf).catch(() => null))).then(meshes => {
      if (cancelled || !mapInst.current) return;
      if (meshRef.current) { mapInst.current.removeLayer(meshRef.current); meshRef.current = null; }
      const features = meshes.filter(Boolean).flatMap(m => m.features || []);
      if (!features.length) return;

      const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
        style: f => (visited.has(f.properties.codarea)
          ? { color: '#10b981', weight: 1, opacity: 0.5, fillColor: '#10b981', fillOpacity: 0.06 }
          : { color: '#3f3f46', weight: 0.6, opacity: 0.8, fillColor: '#27272a', fillOpacity: 0.22 }),
        onEachFeature: (f, lyr) => {
          const m = byCode.get(f.properties.codarea);
          if (!m) return;
          lyr.bindTooltip(m.nome, { sticky: true, direction: 'top' });
          lyr.on('click', () => {
            lyr.bindPopup(muniPopupHtml(m, visited.get(m.code), densities, labelOf, colorOf)).openPopup();
          });
        },
      });
      layer.addTo(mapInst.current);
      meshRef.current = layer;
    });

    return () => { cancelled = true; };
  }, [ready, mapReady, visited, munis, densities, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fase 3: marcadores tracejados das cidades sugeridas ──────────────────
  useEffect(() => {
    const L = window.L;
    const g = sugGroupRef.current;
    if (!ready || !L || !g || !mapReady) return;
    g.clearLayers();
    sugMarkersRef.current.clear();
    suggestions.forEach(s => {
      const icon = L.divIcon({
        className: 'mapa-sug',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14],
        html: `<span style="display:block;width:26px;height:26px;border-radius:50%;border:2px dashed ${SUGGEST_COLOR};box-sizing:border-box;"></span>`,
      });
      const m = L.marker([s.muni.lat, s.muni.lng], { icon });
      m.bindTooltip(`${s.muni.nome} — sugerida`, { direction: 'top' });
      m.bindPopup(muniPopupHtml(s.muni, null, densities, labelOf, colorOf, ` · ${s.dist} km de ${escapeHtml(s.from?.nome || '')}`));
      g.addLayer(m);
      sugMarkersRef.current.set(s.muni.code, m);
    });
  }, [suggestions, mapReady, ready, densities, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centraliza o mapa numa cidade sugerida (botão "Ver no mapa" do painel).
  function focusMuni(muni) {
    if (!mapInst.current) return;
    mapInst.current.setView([muni.lat, muni.lng], 10);
    const marker = sugMarkersRef.current.get(muni.code);
    if (marker) marker.openPopup();
    mapDiv.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Re-enquadra todos os pontos plotados.
  function refit() {
    const L = window.L;
    if (!L || !mapInst.current || !groupRef.current) return;
    try {
      const b = groupRef.current.getBounds();
      if (b.isValid()) mapInst.current.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
    } catch { /* sem pontos */ }
  }

  // ── Ações da legenda ────────────────────────────────────────────────────
  const patchPref = (key, patch) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      saveThemePrefs(next);
      return next;
    });
  };

  const totalPlotted = plotted.length;
  const totalContacted = plotted.reduce((n, l) => n + (isContacted(l.prospect_status) ? 1 : 0), 0);
  const fallbackCities = useMemo(() => new Set(plotted.map(l => (l.search_city || '').trim()).filter(Boolean)), [plotted]);
  const cityCount = visited ? visited.size : fallbackCities.size;
  const pctContacted = totalPlotted ? Math.round((totalContacted / totalPlotted) * 100) : 0;

  const card = { background: '#18181b', border: '1px solid #27272a', padding: '14px 16px' };
  const metric = (label, value) => (
    <div style={card}>
      <div style={{ fontSize: 12, color: '#a1a1aa' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fafafa' }}>{value}</div>
    </div>
  );
  const overlayBtn = (active) => ({
    background: active ? 'rgba(16,185,129,0.9)' : 'rgba(24,24,27,0.9)',
    color: active ? '#fff' : '#a1a1aa',
    border: `1px solid ${active ? '#10b981' : '#3f3f46'}`,
    fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer',
  });

  return (
    <div>
      <style>{`
        .mapa-point, .mapa-cluster, .mapa-sug { background: transparent !important; border: none !important; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #18181b; color: #fafafa; border-radius: 0; }
        .leaflet-popup-content { margin: 0; }
        .leaflet-tooltip { background: #18181b; color: #fafafa; border: 1px solid #27272a; border-radius: 0; font-family: 'Inter', sans-serif; font-size: 11px; }
        .leaflet-tooltip-top:before { border-top-color: #27272a; }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapIcon size={18} color="#10b981" /> Mapa
        </h2>
        <p style={{ color: '#52525b', fontSize: 13 }}>
          Seu progresso geográfico — cada ponto é um lead, colorido pelo tema da busca. Anel verde = mensagem enviada.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {metric('Leads no mapa', num(totalPlotted))}
        {metric('Temas', num(themeStats.length))}
        {metric('Cidades', num(cityCount))}
        {metric('Já contatados', `${pctContacted}%`)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }} className="responsive-grid-searches">
        {/* Legenda editável */}
        <div style={{ ...card, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fafafa', marginBottom: 10 }}>Legenda</div>
          {themeStats.length === 0 && (
            <p style={{ color: '#52525b', fontSize: 12 }}>Nenhum tema ainda.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {themeStats.map(s => {
              const pref = prefs[s.key] || {};
              const hidden = !!pref.hidden;
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: hidden ? 0.4 : 1 }}>
                  <input
                    type="color"
                    value={pref.color || '#888888'}
                    onChange={e => patchPref(s.key, { color: e.target.value })}
                    title="Trocar a cor"
                    style={{ width: 20, height: 20, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingKey === s.key ? (
                      <input
                        autoFocus
                        defaultValue={pref.label || s.label}
                        onBlur={e => { patchPref(s.key, { label: e.target.value.trim() || s.label }); setEditingKey(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        style={{ width: '100%', background: '#0f0f11', border: '1px solid #27272a', color: '#fafafa', fontSize: 12, padding: '2px 4px' }}
                      />
                    ) : (
                      <div
                        onClick={() => setEditingKey(s.key)}
                        title="Clique para renomear"
                        style={{ fontSize: 12, color: '#fafafa', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {pref.label || s.label}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#71717a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {num(s.total)} · <Send size={10} color={CONTACTED_COLOR} /> {num(s.contacted)}
                    </div>
                  </div>
                  <button
                    onClick={() => patchPref(s.key, { hidden: !hidden })}
                    title={hidden ? 'Mostrar no mapa' : 'Ocultar do mapa'}
                    style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', fontSize: 10, padding: '2px 6px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {hidden ? 'Mostrar' : 'Ocultar'}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #27272a', marginTop: 12, paddingTop: 10, fontSize: 11, color: '#52525b', lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3b82f6', border: `2px solid ${CONTACTED_COLOR}`, boxSizing: 'border-box', display: 'inline-block', flexShrink: 0 }} />
              anel verde = mensagem enviada
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px dashed ${SUGGEST_COLOR}`, boxSizing: 'border-box', display: 'inline-block', flexShrink: 0 }} />
              tracejado = cidade sugerida
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 12, height: 12, background: 'rgba(39,39,42,0.7)', border: '1px solid #3f3f46', boxSizing: 'border-box', display: 'inline-block', flexShrink: 0 }} />
              cinza = município ainda não visitado
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={12} color="#52525b" /> ao afastar o zoom, as cores se juntam por cidade
            </div>
          </div>
        </div>

        {/* Mapa */}
        <div style={{ position: 'relative', height: 560, ...card, padding: 0, overflow: 'hidden' }}>
          <div ref={mapDiv} style={{ width: '100%', height: '100%', background: '#18181b' }} />

          {/* Controles sobre o mapa */}
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 6 }}>
            <button onClick={() => setOnlyPending(p => !p)} style={overlayBtn(onlyPending)} title="Mostrar só quem ainda não recebeu mensagem">
              Só não contatados
            </button>
            <button onClick={refit} style={overlayBtn(false)} title="Enquadrar todos os pontos">
              Enquadrar
            </button>
          </div>

          {(loading || (!ready && !error)) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', fontSize: 14, pointerEvents: 'none' }}>
              Carregando mapa…
            </div>
          )}
          {!loading && ready && totalPlotted === 0 && !error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: 14, textAlign: 'center', padding: 20 }}>
              Nenhum lead com coordenadas ainda. Faça uma busca com o scrapper para o mapa se preencher.
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 14, padding: 20 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Sugestões inteligentes (fase 3) */}
      {totalPlotted > 0 && (
        <MapaSuggestions
          loading={!munis && !muniError}
          error={muniError}
          suggestions={suggestions}
          deepen={deepen}
          themeOptions={themeStats.map(s => ({ key: s.key, label: labelOf(s.key), color: colorOf(s.key) }))}
          controls={sugControls}
          onControls={patch => setSugControls(prev => ({ ...prev, ...patch }))}
          onFocus={focusMuni}
        />
      )}
    </div>
  );
}
