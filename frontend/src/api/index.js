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

function cleanFilters(filters = {}) {
  const out = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) out[key] = value;
  });
  return out;
}

async function fetchLeadIds(filters = {}, maxLeads = 1000) {
  const PAGE = 1000;
  const activeFilters = cleanFilters(filters);
  const ids = [];
  for (let page = 0; ids.length < maxLeads; page++) {
    const remaining = maxLeads - ids.length;
    const size = Math.min(PAGE, remaining);
    let q = supabase.from('results').select('id');
    q = applyFilters(q, activeFilters)
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + size - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    ids.push(...rows.map(r => r.id).filter(Boolean));
    if (rows.length < size) break;
  }
  return [...new Set(ids)];
}

function resultStatusPatchForCampaign(status) {
  const now = new Date().toISOString();
  if (status === 'sent') return { prospect_status: 'enviado', last_contact_at: now };
  if (status === 'responded') return { prospect_status: 'respondeu' };
  if (status === 'won') return { prospect_status: 'fechado' };
  if (status === 'lost') return { prospect_status: 'descartado' };
  return null;
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

  // ── Campanhas e cadência comercial ───────────────────────────────────────
  getCampaignTemplates: async () => {
    const { data, error } = await supabase
      .from('campaign_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  },
  createCampaignTemplate: async ({ name, body }) => {
    const { data, error } = await supabase
      .from('campaign_templates')
      .insert({ name, body, channel: 'whatsapp' })
      .select('*')
      .single();
    if (error) throw error;
    return { success: true, data };
  },
  deleteCampaignTemplate: async (id) => {
    const { error } = await supabase.from('campaign_templates').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },
  getCampaigns: async () => {
    const { data, error } = await supabase.rpc('campaign_overview');
    if (error) throw error;
    return { success: true, data: data || [] };
  },
  createCampaign: async ({ name, templateId = null, messageBody, filters = {}, maxLeads = 1000 }) => {
    const activeFilters = cleanFilters(filters);
    const leadIds = await fetchLeadIds(activeFilters, maxLeads);
    if (!leadIds.length) {
      return { success: false, message: 'Nenhum lead encontrado para estes filtros', data: null };
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name,
        template_id: templateId || null,
        message_body: messageBody,
        filters: activeFilters,
        total_leads: leadIds.length,
        status: 'active',
      })
      .select('*')
      .single();
    if (campaignError) throw campaignError;

    const rows = leadIds.map(result_id => ({
      campaign_id: campaign.id,
      result_id,
      status: 'pending',
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('campaign_leads').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }

    return { success: true, data: { ...campaign, total_leads: leadIds.length } };
  },
  deleteCampaign: async (id) => {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },
  getCampaignLeads: async (campaignId, status = '', page = 1, limit = 30) => {
    const { from, to } = rangeOf(page, limit);
    let q = supabase
      .from('campaign_leads')
      .select('*, results(id,name,phone,email,website,address,category,rating,reviews_count,prospect_status,notes,last_contact_at)', { count: 'exact' })
      .eq('campaign_id', campaignId);

    if (status === 'due') {
      q = q.eq('status', 'sent').not('followup_due_at', 'is', null).lte('followup_due_at', new Date().toISOString());
    } else if (status) {
      q = q.eq('status', status);
    }

    q = q.order(status === 'due' ? 'followup_due_at' : 'created_at', { ascending: true }).range(from, to);
    const { data, count, error } = await q;
    if (error) throw error;
    const rows = (data || []).map(row => {
      const lead = row.results || {};
      delete row.results;
      return { ...row, lead };
    });
    return { success: true, data: { data: rows, total: count || 0, page, limit } };
  },
  updateCampaignLeadStatus: async (campaignLeadId, status, resultId) => {
    const now = new Date();
    const patch = { status, updated_at: now.toISOString() };
    if (status === 'sent') {
      patch.sent_at = now.toISOString();
      patch.followup_due_at = new Date(now.getTime() + 3 * 86400000).toISOString();
    }
    if (status === 'responded') patch.responded_at = now.toISOString();
    if (status === 'won') patch.closed_at = now.toISOString();
    if (status === 'lost') patch.discarded_at = now.toISOString();

    const { data, error } = await supabase
      .from('campaign_leads')
      .update(patch)
      .eq('id', campaignLeadId)
      .select('*')
      .single();
    if (error) throw error;

    const resultPatch = resultStatusPatchForCampaign(status);
    if (resultId && resultPatch) {
      const { error: resultError } = await supabase.from('results').update(resultPatch).eq('id', resultId);
      if (resultError) throw resultError;
      clearMapLeadsCache();
    }

    return { success: true, data };
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
