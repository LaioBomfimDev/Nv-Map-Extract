// ============================================================================
// Camada de API — agora sobre o SUPABASE (sem backend Node).
// Mantém o MESMO formato de resposta que os componentes já consomem:
//   leituras -> { success, data }
//   listas paginadas -> { success, data: { data, total, page, limit } }
//   mutações -> { success, message }
// Os componentes React NÃO precisam mudar.
// ============================================================================
import { supabase } from '../supabaseClient';

const MAP_LEADS_CACHE_TTL_MS = 5 * 60 * 1000;
let mapLeadsCache = { data: null, loadedAt: 0, promise: null };

function clearMapLeadsCache() {
  mapLeadsCache = { data: null, loadedAt: 0, promise: null };
}

// Aplica os filtros do frontend (buildResultFilters do backend antigo) numa
// query do supabase-js. Cada .or() adicional é combinado com AND.
function applyFilters(q, filters = {}) {
  if (!filters) return q;
  if (filters.name)     q = q.ilike('name', `%${filters.name}%`);
  if (filters.category) q = q.ilike('category', `%${filters.category}%`);
  if (filters.city)     q = q.ilike('address', `%${filters.city}%`);
  if (filters.prospect_status) q = q.eq('prospect_status', filters.prospect_status);

  const hasField = (col, v) => {
    if (v === '1') q = q.not(col, 'is', null).neq(col, '').neq(col, '—');
    else if (v === '0') q = q.or(`${col}.is.null,${col}.eq.,${col}.eq.—`);
  };
  hasField('website', filters.has_website);
  hasField('email',   filters.has_email);
  hasField('phone',   filters.has_phone);

  if (filters.no_social === '1') {
    ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'].forEach(col => {
      q = q.or(`${col}.is.null,${col}.eq.`);
    });
  }

  if (filters.min_rating)  q = q.gte('rating', parseFloat(filters.min_rating));
  if (filters.max_rating)  q = q.lte('rating', parseFloat(filters.max_rating));
  if (filters.min_reviews) q = q.gte('reviews_count', parseInt(filters.min_reviews));
  if (filters.max_reviews) q = q.lte('reviews_count', parseInt(filters.max_reviews));
  return q;
}

function rangeOf(page, limit) {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1 };
}

// Achata o objeto aninhado `searches` (join) em campos search_* planos.
function flattenLead(row) {
  if (row && row.searches) {
    row.search_filename = row.searches.filename;
    row.search_keyword  = row.searches.keyword;
    row.search_city     = row.searches.city;
    delete row.searches;
  }
  return row;
}

// Dispara download de um CSV a partir de linhas já carregadas.
function downloadCsv(filename, rows) {
  const cols = ['name', 'phone', 'website', 'email', 'address', 'category', 'rating',
    'reviews_count', 'instagram', 'facebook', 'linkedin', 'twitter', 'youtube',
    'prospect_status', 'latitude', 'longitude', 'place_id'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = cols.join(',');
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // ── Dashboard ─────────────────────────────────────────────────────────────
  getMetrics: async () => {
    const { data, error } = await supabase.rpc('dashboard_metrics');
    if (error) throw error;
    return { success: true, data };
  },
  getCharts: async () => {
    const { data, error } = await supabase.rpc('dashboard_charts');
    if (error) throw error;
    return { success: true, data };
  },

  // ── Buscas (importações) ──────────────────────────────────────────────────
  getSearches: async () => {
    const { data, error } = await supabase
      .from('searches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  },
  deleteSearch: async (id) => {
    // Apaga a busca inteira do histórico. Mantém os leads já trabalhados
    // (status != 'novo') e remove o resto — sem deixar "fantasma" no histórico.
    const { data, error } = await supabase.rpc('delete_search_smart', { p_search_id: id });
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true, data };
  },
  renameSearch: async (id, filename) => {
    const { error } = await supabase.from('searches').update({ filename }).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // ── Resultados de uma busca ───────────────────────────────────────────────
  // `withCount`: só pede o COUNT(*) exato (caro no Postgres) quando realmente
  // precisamos — normalmente na 1ª página / quando o filtro muda. Ao paginar,
  // o total não muda, então mandamos withCount=false e reaproveitamos o anterior.
  getResults: async (id, page = 1, limit = 50, filters = {}, withCount = true) => {
    const { from, to } = rangeOf(page, limit);
    const countOpt = withCount ? { count: 'exact' } : undefined;
    let q = supabase.from('results').select('*', countOpt).eq('search_id', id);
    q = applyFilters(q, filters).order('created_at', { ascending: false }).range(from, to);
    const { data, count, error } = await q;
    if (error) throw error;
    return { success: true, data: { data: data || [], total: withCount ? (count || 0) : null, page, limit } };
  },

  // ── Base unificada de leads ───────────────────────────────────────────────
  getAllLeads: async (page = 1, limit = 50, filters = {}, withCount = true) => {
    const { from, to } = rangeOf(page, limit);
    const countOpt = withCount ? { count: 'exact' } : undefined;
    let q = supabase
      .from('results')
      .select('*, searches(filename,keyword,city)', countOpt);
    q = applyFilters(q, filters).order('created_at', { ascending: false }).range(from, to);
    const { data, count, error } = await q;
    if (error) throw error;
    return { success: true, data: { data: (data || []).map(flattenLead), total: withCount ? (count || 0) : null, page, limit } };
  },

  // ── Mapa: TODOS os leads com coordenadas (todas as buscas) ────────────────
  // Traz só os campos que o mapa precisa + o tema (keyword) e a cidade da busca.
  // Pagina em blocos porque o Supabase limita o nº de linhas por request.
  getMapLeads: async () => {
    const fresh = mapLeadsCache.data && (Date.now() - mapLeadsCache.loadedAt < MAP_LEADS_CACHE_TTL_MS);
    if (fresh) return { success: true, data: mapLeadsCache.data };
    if (mapLeadsCache.promise) return mapLeadsCache.promise;

    mapLeadsCache.promise = (async () => {
      const PAGE = 1000;
      const cols = 'id,name,category,phone,website,address,latitude,longitude,prospect_status,place_id,searches(keyword,city)';
      let all = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('results')
          .select(cols)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .neq('latitude', 0)
          .neq('longitude', 0)
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []).map(flattenLead);
        all = all.concat(rows);
        if (rows.length < PAGE) break;
      }
      mapLeadsCache = { data: all, loadedAt: Date.now(), promise: null };
      return { success: true, data: all };
    })().catch(error => {
      mapLeadsCache.promise = null;
      throw error;
    });

    return mapLeadsCache.promise;
  },
  invalidateMapLeadsCache: () => {
    clearMapLeadsCache();
    return { success: true };
  },

  // ── Preferências por usuário ──────────────────────────────────────────────
  getUserPref: async (key) => {
    const { data, error } = await supabase
      .from('user_prefs')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return { success: true, data: data?.value || null };
  },
  setUserPref: async (key, value) => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const userId = authData?.user?.id;
    if (!userId) return { success: false };
    const { error } = await supabase
      .from('user_prefs')
      .upsert({
        user_id: userId,
        key,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
    if (error) throw error;
    return { success: true };
  },

  // ── Um lead completo por id ───────────────────────────────────────────────
  // Usado para hidratar a ficha (LeadModal) a partir de uma origem enxuta,
  // como os pontos do mapa, que só carregam alguns campos.
  getLead: async (id) => {
    if (id === undefined || id === null || id === '') {
      return { success: false, data: null };
    }
    const { data, error } = await supabase
      .from('results')
      .select('*, searches(filename,keyword,city)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return { success: !!data, data: data ? flattenLead(data) : null };
  },

  // ── Mutações de lead ──────────────────────────────────────────────────────
  updateResultStatus: async (id, status) => {
    const patch = { prospect_status: status };
    if (status === 'enviado') patch.last_contact_at = new Date().toISOString();
    const { error } = await supabase.from('results').update(patch).eq('id', id);
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true };
  },
  updateLead: async (id, data) => {
    const patch = {};
    if (data.status !== undefined) {
      patch.prospect_status = data.status;
      if (data.status === 'enviado') patch.last_contact_at = new Date().toISOString();
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (!Object.keys(patch).length) return { success: true };
    const { error } = await supabase.from('results').update(patch).eq('id', id);
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true };
  },
  bulkStatus: async (ids, status) => {
    const patch = { prospect_status: status };
    if (status === 'enviado') patch.last_contact_at = new Date().toISOString();
    const { error } = await supabase.from('results').update(patch).in('id', ids);
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true, changed: ids.length };
  },
  bulkDelete: async (ids) => {
    const { data, error } = await supabase.rpc('delete_results', { p_ids: ids });
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true, deleted: data || 0 };
  },

  // ── Prospecção ────────────────────────────────────────────────────────────
  getProspectSummary: async () => {
    const { data, error } = await supabase.rpc('prospect_summary');
    if (error) throw error;
    return { success: true, data };
  },
  getIgnored: async () => {
    const { data, error } = await supabase
      .from('ignored_leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  },
  restoreIgnored: async (id) => {
    const { error } = await supabase.from('ignored_leads').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // ── Exportação CSV (client-side) ──────────────────────────────────────────
  // Substitui o antigo href de download do backend. Chamado no onClick.
  exportSearch: async (searchId, filters = {}) => {
    const PAGE = 1000;
    let rows = [];
    for (let page = 0; ; page++) {
      let q = supabase.from('results').select('*').eq('search_id', searchId);
      q = applyFilters(q, filters)
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    downloadCsv(`leads_${searchId}`, rows);
    return { success: true };
  },

  // ── Importação manual (CSV/planilha) ──────────────────────────────────────
  // Usa a mesma função de dedup/merge do Supabase que a extensão usa.
  importLeads: async (keyword, city, leads) => {
    const { data, error } = await supabase.rpc('import_leads', {
      p_keyword: keyword || 'planilha', p_city: city || '', p_leads: leads,
    });
    if (error) throw error;
    clearMapLeadsCache();
    return { success: true, data };
  },

  // ── Health/compat ─────────────────────────────────────────────────────────
  getHealth: async () => {
    const { error } = await supabase.from('searches').select('id').limit(1);
    return { success: !error };
  },
};
