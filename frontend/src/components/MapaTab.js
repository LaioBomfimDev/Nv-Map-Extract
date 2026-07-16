import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import useRefreshOnFocus from '../hooks/useRefreshOnFocus';
import loadMarkerCluster from '../utils/loadMarkerCluster';
import loadLeaflet from '../utils/loadLeaflet';
import {
  THEME_PALETTE, THEME_PREFS_KEY, themeKeyOf, themeLabelOf, loadThemePrefs, saveThemePrefs,
} from '../utils/themeColors';
import {
  loadMunicipios, loadUfMesh, computeVisited, computeDensities,
  computeSuggestions, computeDeepen, gmapsQuery, gmapsSearchUrl, requestExtensionStatus, startMineQuery,
} from '../utils/geo';
import { isContacted } from '../statuses';
import MapaSuggestions from './MapaSuggestions';
import LeadModal from './LeadModal';
import { Map as MapIcon, Send, Building2, Target, Trash2, Play, Lightbulb } from './Icons';

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_OPTS = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
};
const CONTACTED_COLOR = '#22c55e';
const SUGGEST_COLOR = '#f59e0b';
const TERRITORY_PLAN_KEY = 'mapa_territory_plan_v1';

function loadTerritoryPlan() {
  try {
    const value = JSON.parse(localStorage.getItem(TERRITORY_PLAN_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function territoryPlanId(muni, themeKey) {
  return `${muni?.code || muni?.nome || ''}:${themeKey || ''}`;
}

const num = (v) => (Number(v || 0)).toLocaleString('pt-BR');
const popShort = (p) => p >= 1000000 ? `${(p / 1000000).toFixed(1)} mi` : p >= 1000 ? `${Math.round(p / 1000)} mil` : String(p);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));
const dataAttr = (s) => encodeURIComponent(String(s ?? ''));
const readDataAttr = (s) => {
  try { return decodeURIComponent(s || ''); } catch (_) { return String(s || ''); }
};
const idKey = (id) => String(id ?? '');
const idsEqual = (a, b) => idKey(a) !== '' && idKey(a) === idKey(b);

// URL segura para interpolar num href de popup (HTML puro): força esquema http(s)
// — bloqueando javascript:/data: — e escapa aspas para não vazar do atributo.
const safeUrl = (u) => {
  const raw = String(u ?? '').trim();
  if (!raw) return '';
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return escapeHtml(url.href);
  } catch {
    return '';
  }
};

function mergeHydratedLead(current, hydrated, openedLead) {
  if (!current || !hydrated || !idsEqual(current.id, openedLead?.id)) return current;
  const merged = { ...current, ...hydrated };
  if ((current.prospect_status ?? '') !== (openedLead.prospect_status ?? '')) {
    merged.prospect_status = current.prospect_status;
  }
  if ((current.notes ?? '') !== (openedLead.notes ?? '')) {
    merged.notes = current.notes;
  }
  if ((current.last_contact_at ?? '') !== (openedLead.last_contact_at ?? '')) {
    merged.last_contact_at = current.last_contact_at;
  }
  return merged;
}

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

// Popup rápido de um lead: ações diretas (WhatsApp/Site/Marcar enviado) +
// botão "Abrir ficha" que abre o LeadModal completo (data-open -> listener).
function popupHtml(lead, contacted) {
  const digits = (lead.phone || '').replace(/\D/g, '');
  const wa = digits ? `https://wa.me/${digits.startsWith('55') ? digits : '55' + digits}` : null;
  const site = safeUrl(lead.website);
  const leadId = escapeHtml(idKey(lead.id));
  const btn = (href, bg, label) => `<a href="${href}" target="_blank" rel="noreferrer" style="background:${bg};color:#fff;padding:4px 8px;font-size:11px;text-decoration:none;font-weight:600;">${label}</a>`;
  return `<div style="font-family:'Inter',sans-serif;color:#fafafa;padding:6px;min-width:190px;background:#18181b;">
    <h4 style="margin:0 0 4px;font-size:13px;font-weight:700;color:#fafafa;">${escapeHtml(lead.name)}</h4>
    <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;">${escapeHtml(lead.search_keyword || lead.category || 'Sem tema')}</p>
    <p style="margin:0 0 8px;font-size:11px;color:#52525b;">${escapeHtml(lead.address || 'Sem endereço')}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${wa ? btn(wa, '#10b981', 'WhatsApp') : ''}
      ${site ? btn(site, '#06b6d4', 'Site') : ''}
      ${contacted
        ? `<span style="color:${CONTACTED_COLOR};font-size:11px;font-weight:600;align-self:center;">✓ contatado</span>`
        : (leadId ? `<button data-mark="${leadId}" style="background:#8b5cf6;color:#fff;border:none;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;">Marcar enviado</button>` : '')}
    </div>
    ${leadId ? `<button data-open="${leadId}" style="margin-top:8px;width:100%;background:transparent;border:1px solid #3f3f46;color:#a1a1aa;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;">Abrir ficha completa</button>` : ''}
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
    const link = top ? `<a href="${escapeHtml(gmapsSearchUrl(labelOf(top.tk), muni))}" data-mine-query="${dataAttr(gmapsQuery(labelOf(top.tk), muni))}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:none;">Minerar no Google Maps</a>` : '';
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
  const [modalLead, setModalLead] = useState(null);
  const [territoryPlan, setTerritoryPlan] = useState(loadTerritoryPlan);

  const mapDiv = useRef(null);
  const mapInst = useRef(null);
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const sugGroupRef = useRef(null);
  const sugMarkersRef = useRef(new Map());
  const pluginRef = useRef(false);
  const fitted = useRef(false);
  // Refs para os botões dentro do popup (HTML puro): os listeners nativos do
  // Leaflet são ligados uma vez e não devem capturar um estado/closure antigo.
  const markSentRef = useRef(() => {});
  const openLeadRef = useRef(() => {});
  const leadsByIdRef = useRef(new Map());
  const territoryPlanRef = useRef(territoryPlan);

  const loadMapLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await api.getMapLeads();
      if (response.success) setLeads(response.data || []);
    } catch {
      setError('Não foi possível carregar os leads do mapa.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Busca todos os leads com coordenadas na primeira abertura.
  useEffect(() => { loadMapLeads(); }, [loadMapLeads]);

  // Pede um status fresco da extensão para o dispatcher de mineração decidir
  // entre ponte nativa e fallback de Maps antes do primeiro clique.
  useEffect(() => {
    requestExtensionStatus();
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

  // O plano territorial usa o mesmo padrão das preferências de tema: resposta
  // imediata local e sincronização entre dispositivos quando possível.
  useEffect(() => {
    let cancelled = false;
    api.getUserPref(TERRITORY_PLAN_KEY)
      .then(response => {
        if (cancelled || !response?.success || !Array.isArray(response.data)) return;
        territoryPlanRef.current = response.data;
        setTerritoryPlan(response.data);
        try { localStorage.setItem(TERRITORY_PLAN_KEY, JSON.stringify(response.data)); } catch { /* segue sem cache local */ }
      })
      .catch(() => { /* mantém o plano local */ });
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

  // Preferências do mapa: localStorage dá resposta instantânea, Supabase
  // sincroniza cores/rótulos entre dispositivos quando houver sessão.
  useEffect(() => {
    let cancelled = false;
    api.getUserPref(THEME_PREFS_KEY)
      .then(r => {
        if (cancelled || !r?.success || !r.data || typeof r.data !== 'object') return;
        setPrefs(prev => {
          const next = { ...prev, ...r.data };
          saveThemePrefs(next);
          return next;
        });
      })
      .catch(() => { /* tabela ausente/offline: mantém localStorage */ });
    return () => { cancelled = true; };
  }, []);

  const plotted = useMemo(() => leads.filter(hasCoords), [leads]);

  // Índice id -> lead para o botão "Abrir ficha" do popup resolver o lead
  // completo (o handler nativo do Leaflet só enxerga o id via atributo).
  leadsByIdRef.current = useMemo(() => new Map(plotted.map(l => [idKey(l.id), l])), [plotted]);

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
    if (changed) { setPrefs(next); persistThemePrefs(next); }
  }, [themeStats]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelOf = (tk) => prefs[tk]?.label || tk;
  const colorOf = (tk) => prefs[tk]?.color || '#a1a1aa';

  function persistThemePrefs(next) {
    saveThemePrefs(next);
    api.setUserPref(THEME_PREFS_KEY, next).catch(() => { /* fallback local já salvo */ });
  }

  function commitTerritoryPlan(next) {
    territoryPlanRef.current = next;
    setTerritoryPlan(next);
    try { localStorage.setItem(TERRITORY_PLAN_KEY, JSON.stringify(next)); } catch { /* segue apenas em memória */ }
    api.setUserPref(TERRITORY_PLAN_KEY, next).catch(() => { /* cache local já persistido */ });
  }

  function addTerritoryPlan(item) {
    const id = territoryPlanId(item.muni, item.themeKey);
    const current = territoryPlanRef.current;
    if (current.some(entry => entry.id === id)) return;
    commitTerritoryPlan([...current, {
      ...item,
      id,
      municipality: item.muni?.nome || '',
      uf: item.muni?.uf || '',
      muniCode: item.muni?.code || '',
      lat: item.muni?.lat,
      lng: item.muni?.lng,
      createdAt: new Date().toISOString(),
      status: 'planned',
    }]);
  }

  function removeTerritoryPlan(id) {
    commitTerritoryPlan(territoryPlanRef.current.filter(item => item.id !== id));
  }

  function startTerritoryPlanItem(item) {
    const muni = { code: item.muniCode, nome: item.municipality, uf: item.uf, lat: item.lat, lng: item.lng };
    startMineQuery(gmapsQuery(item.themeLabel, muni));
    commitTerritoryPlan(territoryPlanRef.current.map(entry => entry.id === item.id
      ? { ...entry, status: 'started', startedAt: new Date().toISOString() }
      : entry));
  }

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

  // Marca um lead como "enviado" direto do popup do mapa.
  markSentRef.current = async (id) => {
    const sentAt = new Date().toISOString();
    try {
      await api.updateResultStatus(id, 'enviado');
      setLeads(prev => prev.map(l => (idsEqual(l.id, id) ? { ...l, prospect_status: 'enviado', last_contact_at: sentAt } : l)));
      setModalLead(prev => (prev && idsEqual(prev.id, id) ? { ...prev, prospect_status: 'enviado', last_contact_at: sentAt } : prev));
    } catch { /* mantém como estava */ }
  };

  // Abre a ficha completa (LeadModal) pelo botão "Abrir ficha" do popup. Mostra
  // na hora o que o mapa já tem (nome, telefone, endereço…) e, em paralelo,
  // busca os campos que faltam (email, avaliação, redes, anotações) e mescla.
  openLeadRef.current = (lead) => {
    if (idKey(lead?.id) === '') return;
    setModalLead(lead);
    api.getLead(lead.id)
      .then(r => {
        if (r?.success && r.data) {
          setModalLead(prev => mergeHydratedLead(prev, r.data, lead));
        }
      })
      .catch(() => { /* mantém os campos que já tínhamos */ });
  };

  // Reflete no mapa as edições feitas na ficha (status, anotações, exclusão).
  const onLeadUpdated = (updated) => {
    if (!updated) return;
    setLeads(prev => prev.map(l => (idsEqual(l.id, updated.id) ? { ...l, ...updated } : l)));
    setModalLead(prev => (prev && idsEqual(prev.id, updated.id) ? { ...prev, ...updated } : prev));
  };
  const onLeadDeleted = (id) => {
    setLeads(prev => prev.filter(l => !idsEqual(l.id, id)));
    setModalLead(null);
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

    // Botões dentro dos popups (HTML puro -> listeners aqui).
    mapInst.current.on('popupopen', (e) => {
      const el = e.popup.getElement();
      if (!el) return;
      const markBtn = el.querySelector('[data-mark]');
      if (markBtn) markBtn.onclick = () => {
        markSentRef.current(markBtn.getAttribute('data-mark'));
        mapInst.current?.closePopup();
      };
      const openBtn = el.querySelector('[data-open]');
      if (openBtn) openBtn.onclick = () => {
        const lead = leadsByIdRef.current.get(openBtn.getAttribute('data-open'));
        mapInst.current?.closePopup();
        if (lead) openLeadRef.current(lead);
      };
      const mineBtn = el.querySelector('[data-mine-query], [data-mine]');
      if (mineBtn) mineBtn.onclick = (event) => {
        if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return true;
        event?.preventDefault();
        const encoded = mineBtn.getAttribute('data-mine-query');
        const query = encoded ? readDataAttr(encoded) : mineBtn.getAttribute('data-mine');
        startMineQuery(query);
        mapInst.current?.closePopup();
        return false;
      };
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
      // Nome da empresa ao passar o mouse (sem precisar clicar).
      const name = escapeHtml(l.name || 'Sem nome');
      const tip = l.category
        ? `<b>${escapeHtml(l.category)}:</b> ${name}`
        : `<b>${name}</b>`;
      m.bindTooltip(tip, { direction: 'top', offset: [0, -8] });
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
      persistThemePrefs(next);
      return next;
    });
  };

  const totalPlotted = plotted.length;
  const totalContacted = plotted.reduce((n, l) => n + (isContacted(l.prospect_status) ? 1 : 0), 0);
  const fallbackCities = useMemo(() => new Set(plotted.map(l => (l.search_city || '').trim()).filter(Boolean)), [plotted]);
  const cityCount = visited ? visited.size : fallbackCities.size;
  const pctContacted = totalPlotted ? Math.round((totalContacted / totalPlotted) * 100) : 0;
  const plannedKeys = useMemo(() => new Set(territoryPlan.map(item => item.id)), [territoryPlan]);
  const plannedEstimate = territoryPlan.reduce((sum, item) => sum + Number(item.estimate || 0), 0);

  const tabRef = useRefreshOnFocus(useCallback(async () => {
    api.invalidateMapLeadsCache?.();
    await loadMapLeads(true);
    requestExtensionStatus();
    window.requestAnimationFrame(() => mapInst.current?.invalidateSize?.());
  }, [loadMapLeads]), { minIntervalMs: 2000 });

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
    <div ref={tabRef}>
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
            <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', color: '#fca5a5', background: 'rgba(9,9,11,0.86)', fontSize: 14, padding: 20 }}>
              <span>{error}</span>
              <button type="button" onClick={() => loadMapLeads()} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Tentar novamente</button>
            </div>
          )}
        </div>
      </div>

      {territoryPlan.length > 0 && (
        <section aria-labelledby="territory-plan-title" style={{ ...card, marginTop: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h3 id="territory-plan-title" style={{ color: '#fafafa', fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Target size={15} color="#f59e0b" /> Plano territorial
              </h3>
              <p style={{ color: '#71717a', fontSize: 11, margin: '3px 0 0' }}>
                {territoryPlan.length} {territoryPlan.length === 1 ? 'oportunidade priorizada' : 'oportunidades priorizadas'} · ~{num(plannedEstimate)} leads estimados
              </p>
            </div>
            {territoryPlan.some(item => item.status !== 'started') && (
              <button type="button" onClick={() => startTerritoryPlanItem(territoryPlan.find(item => item.status !== 'started'))}
                style={{ background: '#d97706', border: 'none', color: '#fff', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Play size={12} color="#fff" /> Minerar próxima
              </button>
            )}
          </div>
          <div className="territory-plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {territoryPlan.map(item => (
              <div key={item.id} style={{ background: '#09090b', border: '1px solid #27272a', borderLeft: `3px solid ${item.status === 'started' ? '#10b981' : '#f59e0b'}`, padding: '10px 11px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#fafafa', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.themeLabel}</div>
                    <div style={{ color: '#a1a1aa', fontSize: 11, marginTop: 2 }}>{item.municipality} — {item.uf}</div>
                  </div>
                  <span className="mono" title="Estimativa baseada na densidade do seu histórico" style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>~{num(item.estimate)}</span>
                </div>
                <div style={{ color: '#52525b', fontSize: 10, marginTop: 5 }}>
                  {item.kind === 'expand' ? `${item.distance || 0} km da operação atual` : 'Novo segmento nesta cidade'} · estimativa, não garantia
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button type="button" onClick={() => startTerritoryPlanItem(item)}
                    style={{ flex: 1, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', padding: '5px 7px', fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Play size={10} color="#10b981" /> {item.status === 'started' ? 'Minerar novamente' : 'Minerar agora'}
                  </button>
                  <button type="button" onClick={() => removeTerritoryPlan(item.id)} aria-label={`Remover ${item.themeLabel} em ${item.municipality} do plano`}
                    style={{ background: 'transparent', border: '1px solid #27272a', color: '#71717a', padding: '5px 7px', cursor: 'pointer' }}><Trash2 size={10} color="#71717a" /></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ color: '#52525b', fontSize: 10, marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lightbulb size={10} color="#f59e0b" /> As estimativas usam densidade observada × população; valide a oportunidade durante a mineração.
          </div>
        </section>
      )}

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
          onAddPlan={addTerritoryPlan}
          plannedKeys={plannedKeys}
        />
      )}

      {/* Ficha completa da empresa ao clicar num ponto do mapa */}
      {modalLead && (
        <LeadModal
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onUpdated={onLeadUpdated}
          onDeleted={onLeadDeleted}
        />
      )}
    </div>
  );
}
