import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import useRefreshOnFocus from '../hooks/useRefreshOnFocus';
import { getWhatsAppUrl, STATUS_OPTIONS } from '../statuses';
import {
  Target, FileText, Users, Send, Clock, MessageCircle, Trophy, XCircle,
  Pin, Lightbulb, Search, Globe, Share2, Star, Check, Trash2, Phone,
  Building2, ArrowRight, AlertTriangle
} from './Icons';

const LIMIT = 30;

const DEFAULT_TEMPLATES = [
  {
    id: 'sem_site',
    name: 'Oferta para empresa sem site',
    filters: { prospect_status: 'novo', has_phone: '1', has_website: '0' },
    body: 'Oi {nome}, tudo bem? Vi a empresa de voces no Google Maps e percebi que ainda nao encontrei um site oficial. Eu ajudo negocios locais a criarem uma presenca online simples para receber mais contatos. Posso te mandar uma ideia rapida?'
  },
  {
    id: 'sem_redes',
    name: 'Oferta para empresa sem redes',
    filters: { prospect_status: 'novo', has_phone: '1', no_social: '1' },
    body: 'Oi {nome}, tudo bem? Encontrei voces no Google Maps e vi uma oportunidade de melhorar a presenca da empresa nas redes. Trabalho com conteudo e captacao local. Posso te mandar uma sugestao simples?'
  },
  {
    id: 'lead_quente',
    name: 'Abordagem para lead quente',
    filters: { prospect_status: 'novo', has_phone: '1', min_rating: '4', min_reviews: '10' },
    body: 'Oi {nome}, tudo bem? Vi que voces tem boas avaliacoes no Google e queria te mostrar uma ideia para transformar essa reputacao em mais contatos pelo WhatsApp. Faz sentido eu te mandar?'
  }
];

const CAMPAIGN_STATUS = [
  { value: 'pending', label: 'Na fila', icon: Pin, color: '#f59e0b' },
  { value: 'sent', label: 'Enviados', icon: Send, color: '#8b5cf6' },
  { value: 'due', label: 'Follow-up', icon: Clock, color: '#06b6d4' },
  { value: 'responded', label: 'Responderam', icon: MessageCircle, color: '#22c55e' },
  { value: 'won', label: 'Fechados', icon: Trophy, color: '#eab308' },
  { value: 'lost', label: 'Descartados', icon: XCircle, color: '#ef4444' },
];

const card = { background: '#18181b', border: '1px solid #27272a', borderRadius: 0 };
const input = {
  background: '#0e0e11',
  border: '1px solid #27272a',
  borderRadius: 0,
  color: '#fafafa',
  padding: '9px 11px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

function cleanFilters(filters) {
  const out = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) out[key] = value;
  });
  return out;
}

function renderMessage(template, lead) {
  const values = {
    nome: lead?.name || '',
    empresa: lead?.name || '',
    categoria: lead?.category || '',
    telefone: lead?.phone || '',
    site: lead?.website || '',
    endereco: lead?.address || '',
  };
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => values[key.toLowerCase()] ?? '');
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isDue(row) {
  return row?.status === 'sent' && row.followup_due_at && new Date(row.followup_due_at) <= new Date();
}

function statusMeta(value) {
  return CAMPAIGN_STATUS.find(s => s.value === value) || CAMPAIGN_STATUS[0];
}

function campaignMetrics(campaign = {}) {
  const currentSent = Number(campaign.sent || 0);
  const currentResponded = Number(campaign.responded || 0);
  const currentWon = Number(campaign.won || 0);
  const currentLost = Number(campaign.lost || 0);
  // Os campos *_total usam timestamps e não diminuem quando o lead avança de
  // etapa. O fallback mantém números coerentes em bancos ainda não migrados.
  const contacted = Number(campaign.sent_total ?? (currentSent + currentResponded + currentWon + currentLost));
  const responses = Number(campaign.responded_total ?? (currentResponded + currentWon));
  const wins = Number(campaign.won_total ?? currentWon);
  const responseRate = campaign.response_rate == null
    ? (contacted ? Math.round((responses / contacted) * 100) : 0)
    : Math.round(Number(campaign.response_rate));
  const conversionRate = contacted ? Math.round((wins / contacted) * 100) : 0;
  const total = Number(campaign.total_leads || 0);
  const processed = Math.max(0, total - Number(campaign.pending || 0));
  return { contacted, responses, wins, responseRate, conversionRate, total, processed };
}

function FilterButton({ active, onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-pressed={active}
      style={{
        background: active ? 'rgba(16,185,129,0.14)' : 'transparent',
        color: active ? '#10b981' : '#a1a1aa',
        border: active ? '1px solid rgba(16,185,129,0.35)' : '1px solid #27272a',
        padding: '6px 10px',
        borderRadius: 0,
        cursor: 'pointer',
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {Icon && <Icon size={12} color={active ? '#10b981' : '#a1a1aa'} />}
      <span>{children}</span>
    </button>
  );
}

export default function CampaignsTab() {
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const [campaignName, setCampaignName] = useState(DEFAULT_TEMPLATES[0].name);
  const [templateChoice, setTemplateChoice] = useState(`default:${DEFAULT_TEMPLATES[0].id}`);
  const [messageBody, setMessageBody] = useState(DEFAULT_TEMPLATES[0].body);
  const [templateName, setTemplateName] = useState('');
  const [maxLeads, setMaxLeads] = useState(300);
  const [filters, setFilters] = useState(DEFAULT_TEMPLATES[0].filters);
  const [preview, setPreview] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedId) || campaigns[0] || null,
    [campaigns, selectedId]
  );

  const totalPages = Math.max(1, Math.ceil(totalRows / LIMIT));
  const totals = useMemo(() => campaigns.reduce((acc, c) => {
    const metric = campaignMetrics(c);
    acc.campaigns += 1;
    acc.pending += c.pending || 0;
    acc.contacted += metric.contacted;
    acc.responses += metric.responses;
    acc.won += metric.wins;
    acc.due += c.due_followups || 0;
    return acc;
  }, { campaigns: 0, pending: 0, contacted: 0, responses: 0, won: 0, due: 0 }), [campaigns]);
  const overallResponseRate = totals.contacted ? Math.round((totals.responses / totals.contacted) * 100) : 0;
  const overallConversionRate = totals.contacted ? Math.round((totals.won / totals.contacted) * 100) : 0;

  const loadCampaigns = useCallback(async () => {
    const res = await api.getCampaigns();
    if (res.success) {
      setCampaigns(res.data);
      setSelectedId(prev => prev || res.data[0]?.id || '');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await api.getCampaignTemplates();
    if (res.success) setTemplates(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadTemplates(), loadCampaigns()]);
      } catch {
        if (!cancelled) setActionMsg('Não foi possível carregar campanhas. Rode a migração do Supabase.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadTemplates, loadCampaigns]);

  const loadRows = useCallback(async () => {
    if (!selectedCampaign?.id) {
      setRows([]);
      setTotalRows(0);
      return;
    }
    setLoadingRows(true);
    try {
      const res = await api.getCampaignLeads(selectedCampaign.id, statusFilter, page, LIMIT);
      if (res.success) {
        setRows(res.data.data || []);
        setTotalRows(res.data.total || 0);
      }
    } catch {
      setActionMsg('Erro ao carregar a fila da campanha');
    }
    setLoadingRows(false);
  }, [selectedCampaign?.id, statusFilter, page]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setPage(1); }, [selectedCampaign?.id, statusFilter]);

  const refreshRef = useRefreshOnFocus(useCallback(async () => {
    await loadCampaigns();
    await loadRows();
  }, [loadCampaigns, loadRows]));

  function flash(msg) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3500);
  }

  function chooseTemplate(value) {
    setTemplateChoice(value);
    if (value.startsWith('default:')) {
      const id = value.replace('default:', '');
      const tpl = DEFAULT_TEMPLATES.find(t => t.id === id);
      if (!tpl) return;
      setCampaignName(tpl.name);
      setMessageBody(tpl.body);
      setFilters(tpl.filters);
      return;
    }

    const id = value.replace('template:', '');
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      setMessageBody(tpl.body);
      setCampaignName(tpl.name);
    }
  }

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function toggleFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: prev[key] === value ? '' : value }));
  }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const res = await api.getAllLeads(1, 12, cleanFilters(filters), true);
      if (res.success) {
        setPreview(res.data.data || []);
        setPreviewTotal(res.data.total || 0);
      }
    } catch {
      flash('Erro ao carregar a prévia');
    }
    setPreviewLoading(false);
  }

  async function createCampaign() {
    const name = campaignName.trim();
    const body = messageBody.trim();
    if (!name || !body) {
      flash('Preencha nome e mensagem da campanha');
      return;
    }
    setCreating(true);
    try {
      const templateId = templateChoice.startsWith('template:') ? templateChoice.replace('template:', '') : null;
      const res = await api.createCampaign({
        name,
        messageBody: body,
        templateId,
        filters,
        maxLeads: Math.max(1, Number(maxLeads) || 300),
      });
      if (!res.success) {
        flash(res.message || 'Nenhum lead encontrado para estes filtros');
      } else {
        flash(`Campanha criada com ${res.data.total_leads} leads`);
        await loadCampaigns();
        setSelectedId(res.data.id);
      }
    } catch {
      flash('Erro ao criar campanha. Confira se a migração foi aplicada no Supabase.');
    }
    setCreating(false);
  }

  async function saveTemplate() {
    const name = templateName.trim() || campaignName.trim();
    const body = messageBody.trim();
    if (!name || !body) {
      flash('Preencha um nome e uma mensagem para salvar o modelo');
      return;
    }
    try {
      const res = await api.createCampaignTemplate({ name, body });
      if (res.success) {
        setTemplates(prev => [res.data, ...prev]);
        setTemplateChoice(`template:${res.data.id}`);
        setTemplateName('');
        flash('Modelo salvo');
      }
    } catch {
      flash('Erro ao salvar modelo');
    }
  }

  async function deleteCampaign(campaign) {
    if (!campaign) return;
    if (!window.confirm(`Apagar a campanha "${campaign.name}"? Os leads não serão apagados.`)) return;
    try {
      await api.deleteCampaign(campaign.id);
      setRows([]);
      setSelectedId('');
      await loadCampaigns();
      flash('Campanha apagada');
    } catch {
      flash('Erro ao apagar campanha');
    }
  }

  async function updateRowStatus(row, status) {
    try {
      await api.updateCampaignLeadStatus(row.id, status, row.result_id);
      await Promise.all([loadRows(), loadCampaigns()]);
      flash('Status atualizado');
    } catch {
      flash('Erro ao atualizar status');
    }
  }

  function openWhatsApp(row) {
    const lead = row.lead || {};
    const msg = renderMessage(selectedCampaign?.message_body, lead);
    const url = getWhatsAppUrl(lead.phone, msg);
    if (url) window.open(url, '_blank', 'noopener');
  }

  const selectedCounts = selectedCampaign || {};
  const selectedMetrics = campaignMetrics(selectedCampaign || {});

  if (loading) {
    return <p style={{ color: '#52525b', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Carregando campanhas...</p>;
  }

  return (
    <div ref={refreshRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fafafa', marginBottom: 4 }}>Campanhas</h1>
        <p style={{ color: '#71717a', fontSize: 14 }}>Crie filas de prospecção, siga a cadência e acompanhe respostas e conversão reais.</p>
      </div>

      <div aria-live="polite" aria-atomic="true">
      {actionMsg && (
        <div role={actionMsg.includes('Erro') || actionMsg.includes('Não') ? 'alert' : 'status'} style={{
          background: /Erro|Não|Nao/.test(actionMsg) ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
          border: /Erro|Não|Nao/.test(actionMsg) ? '1px solid rgba(239,68,68,0.28)' : '1px solid rgba(16,185,129,0.28)',
          color: /Erro|Não|Nao/.test(actionMsg) ? '#fca5a5' : '#6ee7b7',
          padding: '10px 14px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <AlertTriangle size={14} color="currentColor" />
          <span>{actionMsg}</span>
        </div>
      )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Campanhas', value: totals.campaigns, icon: Target, color: '#10b981' },
          { label: 'Na fila', value: totals.pending, icon: Pin, color: '#f59e0b' },
          { label: 'Contatados', value: totals.contacted, icon: Send, color: '#8b5cf6' },
          { label: 'Follow-up', value: totals.due, icon: Clock, color: '#06b6d4' },
          { label: 'Taxa de resposta', value: `${overallResponseRate}%`, icon: MessageCircle, color: '#22c55e' },
          { label: 'Conversão', value: `${overallConversionRate}%`, icon: Trophy, color: '#eab308' },
        ].map(item => (
          <div key={item.label} style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${item.color}` }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value || 0}</div>
            <div style={{ fontSize: 12, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <item.icon size={13} color={item.color} />
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="campaign-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={16} color="#f59e0b" />
              <span>Nova campanha</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#71717a', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>Nome</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} style={input} placeholder="Ex: Academias sem site" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#71717a', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>Modelo</label>
                <select value={templateChoice} onChange={e => chooseTemplate(e.target.value)} style={input}>
                  {DEFAULT_TEMPLATES.map(t => <option key={t.id} value={`default:${t.id}`}>{t.name}</option>)}
                  {templates.length > 0 && <option disabled>-- Modelos salvos --</option>}
                  {templates.map(t => <option key={t.id} value={`template:${t.id}`}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#71717a', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>Mensagem</label>
                <textarea
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  rows={7}
                  style={{ ...input, resize: 'vertical', lineHeight: 1.45, fontFamily: 'inherit' }}
                  placeholder="Use {nome}, {categoria}, {site}, {endereco}"
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ ...input, padding: '7px 10px' }} placeholder="Nome do modelo" />
                  <button onClick={saveTemplate}
                    style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', padding: '7px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
                    Salvar
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #27272a', paddingTop: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#71717a', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Filtros de leads</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={filters.category || ''} onChange={e => setFilter('category', e.target.value)} style={input} placeholder="Categoria" />
                  <input value={filters.city || ''} onChange={e => setFilter('city', e.target.value)} style={input} placeholder="Cidade/endereco" />
                  <select value={filters.prospect_status || ''} onChange={e => setFilter('prospect_status', e.target.value)} style={input}>
                    <option value="">Todos status</option>
                    {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <input type="number" min="1" max="1000" value={maxLeads} onChange={e => setMaxLeads(e.target.value)} style={input} placeholder="Limite" />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <FilterButton active={filters.has_phone === '1'} onClick={() => toggleFilter('has_phone', '1')} icon={Phone}>Com telefone</FilterButton>
                  <FilterButton active={filters.has_website === '0'} onClick={() => toggleFilter('has_website', '0')} icon={Globe}>Sem site</FilterButton>
                  <FilterButton active={filters.no_social === '1'} onClick={() => toggleFilter('no_social', '1')} icon={Share2}>Sem redes</FilterButton>
                  <FilterButton active={filters.min_rating === '4'} onClick={() => toggleFilter('min_rating', '4')} icon={Star}>Nota 4+</FilterButton>
                  <FilterButton active={filters.min_reviews === '10'} onClick={() => toggleFilter('min_reviews', '10')} icon={Users}>10+ reviews</FilterButton>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={loadPreview} disabled={previewLoading}
                  style={{ flex: 1, background: '#0e0e11', color: '#e4e4e7', border: '1px solid #27272a', padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Search size={13} />
                  <span>{previewLoading ? 'Carregando...' : 'Ver prévia'}</span>
                </button>
                <button onClick={createCampaign} disabled={creating}
                  style={{ flex: 1, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Target size={13} />
                  <span>{creating ? 'Criando...' : 'Criar campanha'}</span>
                </button>
              </div>
            </div>
          </div>

          {(previewLoading || preview.length > 0 || previewTotal > 0) && (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, color: '#fafafa', fontWeight: 700 }}>Previa</h3>
                <span className="mono" style={{ fontSize: 12, color: '#52525b' }}>{previewTotal.toLocaleString('pt-BR')} leads</span>
              </div>
              {previewLoading && <p style={{ color: '#52525b', fontSize: 12 }}>Carregando...</p>}
              {!previewLoading && preview.map(lead => (
                <div key={lead.id} style={{ padding: '8px 0', borderTop: '1px solid #27272a' }}>
                  <div style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                  <div style={{ color: '#52525b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[lead.category, lead.phone].filter(Boolean).join(' · ') || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={16} color="#10b981" />
                <span>Campanhas ativas</span>
              </h2>
              {selectedCampaign && (
                <button onClick={() => deleteCampaign(selectedCampaign)}
                  style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '6px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Trash2 size={12} color="#ef4444" />
                  <span>Apagar</span>
                </button>
              )}
            </div>

            {campaigns.length === 0 ? (
              <div style={{ color: '#52525b', fontSize: 13, padding: 20, textAlign: 'center', border: '1px dashed #27272a' }}>
                Nenhuma campanha criada ainda.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {campaigns.map(c => {
                  const active = selectedCampaign?.id === c.id;
                  const metric = campaignMetrics(c);
                  return (
                    <button key={c.id} onClick={() => setSelectedId(c.id)}
                      style={{
                        ...card,
                        background: active ? 'rgba(16,185,129,0.08)' : '#09090b',
                        border: active ? '1px solid rgba(16,185,129,0.45)' : '1px solid #27272a',
                        padding: 13,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}>
                      <div style={{ color: '#fafafa', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ color: '#52525b', fontSize: 11, marginTop: 4 }}>
                        <span className="mono">{c.total_leads || 0}</span> leads · <span className="mono">{metric.responseRate}%</span> resposta
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                        <span style={{ color: '#f59e0b', fontSize: 11 }}>{c.pending || 0} fila</span>
                        <span style={{ color: '#8b5cf6', fontSize: 11 }}>{c.sent || 0} env.</span>
                        <span style={{ color: '#22c55e', fontSize: 11 }}>{c.responded || 0} resp.</span>
                        {c.due_followups > 0 && <span style={{ color: '#06b6d4', fontSize: 11 }}>{c.due_followups} follow</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCampaign && (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: 16, borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <h2 style={{ color: '#fafafa', fontSize: 18, fontWeight: 700, marginBottom: 3 }}>{selectedCampaign.name}</h2>
                  <p style={{ color: '#52525b', fontSize: 12 }}>
                    Criada em {formatDate(selectedCampaign.created_at)} · <span className="mono">{selectedCampaign.total_leads || 0}</span> leads
                  </p>
                </div>
                {(Number(selectedCounts.due_followups || 0) > 0 || Number(selectedCounts.pending || 0) > 0) && (
                  <button type="button"
                    onClick={() => setStatusFilter(Number(selectedCounts.due_followups || 0) > 0 ? 'due' : 'pending')}
                    style={{ background: Number(selectedCounts.due_followups || 0) > 0 ? '#0891b2' : '#d97706', color: '#fff', border: 'none', padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {Number(selectedCounts.due_followups || 0) > 0 ? <Clock size={13} /> : <Pin size={13} />}
                    <span>{Number(selectedCounts.due_followups || 0) > 0
                      ? `Fazer ${selectedCounts.due_followups} follow-up${selectedCounts.due_followups === 1 ? '' : 's'}`
                      : `Abordar ${selectedCounts.pending} da fila`}</span>
                  </button>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <FilterButton active={!statusFilter} onClick={() => setStatusFilter('')} icon={Users}>Todos</FilterButton>
                  {CAMPAIGN_STATUS.map(s => {
                    const Icon = s.icon;
                    const count = s.value === 'due' ? selectedCounts.due_followups : selectedCounts[s.value] || 0;
                    return (
                      <button key={s.value} onClick={() => setStatusFilter(statusFilter === s.value ? '' : s.value)}
                        style={{
                          background: statusFilter === s.value ? `${s.color}18` : 'transparent',
                          border: statusFilter === s.value ? `1px solid ${s.color}66` : '1px solid #27272a',
                          color: statusFilter === s.value ? s.color : '#a1a1aa',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontSize: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}>
                        <Icon size={12} color={statusFilter === s.value ? s.color : '#a1a1aa'} />
                        <span>{s.label}</span>
                        <span className="mono">{count || 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="campaign-performance" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(110px, 1fr))', gap: 1, background: '#27272a', borderBottom: '1px solid #27272a' }}>
                {[
                  { label: 'Contatados', value: selectedMetrics.contacted.toLocaleString('pt-BR') },
                  { label: 'Taxa de resposta', value: `${selectedMetrics.responseRate}%` },
                  { label: 'Conversão', value: `${selectedMetrics.conversionRate}%` },
                  { label: 'Progresso', value: `${selectedMetrics.total ? Math.round((selectedMetrics.processed / selectedMetrics.total) * 100) : 0}%` },
                ].map(item => (
                  <div key={item.label} style={{ background: '#111113', padding: '11px 14px' }}>
                    <div className="mono" style={{ color: '#fafafa', fontWeight: 700, fontSize: 17 }}>{item.value}</div>
                    <div style={{ color: '#71717a', fontSize: 10, textTransform: 'uppercase', marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Lead', 'Status', 'Cadência', 'Contato', 'Ações'].map(h => (
                        <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid #27272a', color: '#52525b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRows && (
                      <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: '#52525b', fontFamily: 'var(--font-mono)' }}>Carregando fila...</td></tr>
                    )}
                    {!loadingRows && rows.map(row => {
                      const lead = row.lead || {};
                      const meta = statusMeta(row.status);
                      const due = isDue(row);
                      const waUrl = getWhatsAppUrl(lead.phone, renderMessage(selectedCampaign.message_body, lead));
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #18181b' }}>
                          <td style={{ padding: '13px 14px', maxWidth: 240 }}>
                            <div style={{ color: '#fafafa', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Building2 size={13} color="#a1a1aa" />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name || '-'}</span>
                            </div>
                            <div style={{ color: '#52525b', fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.category || '-'}</div>
                          </td>
                          <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: due ? '#06b6d4' : meta.color, background: due ? 'rgba(6,182,212,0.12)' : `${meta.color}18`, border: due ? '1px solid rgba(6,182,212,0.28)' : `1px solid ${meta.color}30`, padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
                              {due ? <Clock size={11} color="#06b6d4" /> : <meta.icon size={11} color={meta.color} />}
                              <span>{due ? 'Follow-up' : meta.label}</span>
                            </span>
                          </td>
                          <td style={{ padding: '13px 14px', color: '#52525b', whiteSpace: 'nowrap' }}>
                            {row.sent_at ? (
                              <span>Enviado {formatDate(row.sent_at)} · prox. {formatDate(row.followup_due_at)}</span>
                            ) : (
                              <span>Ainda não enviado</span>
                            )}
                          </td>
                          <td style={{ padding: '13px 14px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                            <span className="mono">{lead.phone || '-'}</span>
                          </td>
                          <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button onClick={() => openWhatsApp(row)} disabled={!waUrl}
                                style={{ background: waUrl ? 'rgba(16,185,129,0.14)' : '#18181b', color: waUrl ? '#10b981' : '#52525b', border: '1px solid #27272a', padding: '6px 9px', cursor: waUrl ? 'pointer' : 'not-allowed', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <MessageCircle size={12} color={waUrl ? '#10b981' : '#52525b'} />
                                <span>WhatsApp</span>
                              </button>
                              <button onClick={() => updateRowStatus(row, 'sent')}
                                style={{ background: 'transparent', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', padding: '6px 9px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Send size={12} color="#a78bfa" />
                                <span>{due ? 'Follow-up enviado' : 'Marcar enviado'}</span>
                              </button>
                              <button onClick={() => updateRowStatus(row, 'responded')}
                                style={{ background: 'transparent', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', padding: '6px 9px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Check size={12} color="#22c55e" />
                                <span>Respondeu</span>
                              </button>
                              <button onClick={() => updateRowStatus(row, 'won')}
                                style={{ background: 'transparent', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', padding: '6px 9px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Trophy size={12} color="#eab308" />
                                <span>Fechou</span>
                              </button>
                              <button onClick={() => updateRowStatus(row, 'lost')}
                                style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 9px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <XCircle size={12} color="#ef4444" />
                                <span>Descartar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loadingRows && rows.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#52525b' }}>Nenhum lead nesta visao.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ padding: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, borderTop: '1px solid #27272a' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '7px 14px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                    Anterior
                  </button>
                  <span style={{ color: '#52525b', fontSize: 12 }}>Página {page} de {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '7px 14px', cursor: page === totalPages ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span>Próxima</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedCampaign && campaigns.length === 0 && (
            <div style={{ ...card, padding: 24, textAlign: 'center', color: '#52525b' }}>
              <FileText size={36} color="#52525b" />
              <p style={{ marginTop: 10, fontSize: 13 }}>Crie a primeira campanha para iniciar a cadência comercial.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
