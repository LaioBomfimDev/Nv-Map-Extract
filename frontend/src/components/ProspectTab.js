import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { api } from '../api';
import useDebouncedValue from '../hooks/useDebounce';
import useRefreshOnFocus from '../hooks/useRefreshOnFocus';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getStatusMeta, getWhatsAppUrl, timeSince } from '../statuses';
import { LayoutGrid, Clock, Lightbulb, Zap, X, Pin, Send, XCircle, Trash2, StickyNote, MessageCircle, ArrowRight, Tag, MapPin, AlertTriangle, DynIcon } from './Icons';

const card = { background: '#18181b', border: '1px solid #27272a', borderRadius: 0 };
const LIMIT = 50;
const MAX_FILTER_SELECTION = 1000;

async function runInChunks(ids, action, size = 200) {
  for (let index = 0; index < ids.length; index += size) {
    await action(ids.slice(index, index + size));
  }
}

// Linha da lista de leads memoizada: só re-renderiza quando ESTE lead muda
// (dados ou seleção), em vez de a lista inteira a cada clique de checkbox.
const ProspectRow = memo(function ProspectRow({ lead, isSelected, onToggleSelect, onOpen }) {
  const meta = getStatusMeta(lead.prospect_status);
  const waUrl = getWhatsAppUrl(lead.phone);
  return (
    <tr
        style={{ transition: 'background 0.15s', cursor: 'pointer', borderBottom: '1px solid #18181b' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '14px 14px' }} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(lead.id)} aria-label={`Selecionar ${lead.name || 'lead'}`} style={{ accentColor: '#10b981', cursor: 'pointer' }} />
      </td>
      <td onClick={() => onOpen(lead)} style={{ padding: '14px 14px', maxWidth: 220 }}>
        <div style={{ color: '#fafafa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }} title={lead.name}>
          <span>{lead.name}</span>
          {lead.notes && <StickyNote size={12} color="#a1a1aa" title="Tem anotações" />}
        </div>
        <div style={{ color: '#52525b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{lead.category || '—'}</div>
      </td>
      <td onClick={() => onOpen(lead)} style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}18`, padding: '3px 10px', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <DynIcon name={meta.icon} size={11} color={meta.color} />
          <span>{meta.label}</span>
        </span>
      </td>
      <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ color: '#a1a1aa' }}>{lead.phone || '—'}</span>
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noreferrer" title="Abrir WhatsApp"
               style={{ textDecoration: 'none', background: 'rgba(16,185,129,0.15)', color: '#10b981', width: 24, height: 24, borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
              <MessageCircle size={12} color="#10b981" />
            </a>
          )}
        </div>
      </td>
      <td onClick={() => onOpen(lead)} style={{ padding: '14px 14px', color: '#52525b', whiteSpace: 'nowrap', fontSize: 12 }}>
        {lead.last_contact_at ? timeSince(lead.last_contact_at) : '—'}
      </td>
      <td onClick={() => onOpen(lead)} style={{ padding: '14px 14px', color: '#52525b', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.search_filename}>
        {lead.search_keyword || lead.search_filename || '—'}
      </td>
      <td onClick={() => onOpen(lead)} style={{ padding: '14px 14px', textAlign: 'right' }}>
        <span style={{ color: '#10b981', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span>Abrir</span>
          <ArrowRight size={12} />
        </span>
      </td>
    </tr>
  );
});

export default function ProspectTab() {
  const [summary, setSummary]     = useState(null);
  const [leads, setLeads]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('');       // '' = todos
  const [extraFilters, setExtraFilters] = useState({});       // vindos das sugestões
  const [nameFilter, setNameFilter]     = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [modalLead, setModalLead] = useState(null);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [selectingAll, setSelectingAll] = useState(false);

  // Estados do Modo Mutirão
  const [mutiraoActive, setMutiraoActive] = useState(false);
  const [mutiraoIndex, setMutiraoIndex] = useState(0);
  const [mutiraoLeads, setMutiraoLeads] = useState([]);
  const [mutiraoLoading, setMutiraoLoading] = useState(false);

  // Empresas ignoradas (apagadas — nunca mais importadas/sugeridas)
  const [ignored, setIgnored] = useState([]);
  const [showIgnored, setShowIgnored] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.getProspectSummary();
      if (res.success) setSummary(res.data);
    } catch { /* Supabase indisponível */ }
  }, []);

  // Debounce só no texto digitado; filtros por clique (status/sugestão) seguem na hora.
  const debouncedName = useDebouncedValue(nameFilter, 350);
  const activeFilters = useMemo(() => {
    const next = { ...extraFilters };
    if (statusFilter) next.prospect_status = statusFilter;
    if (debouncedName) next.name = debouncedName;
    return next;
  }, [extraFilters, statusFilter, debouncedName]);

  // `forceCount`: recontar o total mesmo fora da 1ª página — usado após
  // apagar/mover leads em lote, quando o total muda mas a página não.
  const loadLeads = useCallback(async (forceCount = false) => {
    setLoading(true);
    setError('');
    try {
      // COUNT(*) exato só na 1ª página; ao paginar reaproveita o total.
      const res = await api.getAllLeads(page, LIMIT, activeFilters, forceCount || page === 1);
      if (res.success) {
        setLeads(res.data.data || []);
        if (res.data.total != null) setTotal(res.data.total);
      }
    } catch {
      setError('Não foi possível carregar os leads. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [page, activeFilters]);

  const loadIgnored = useCallback(async () => {
    try {
      const res = await api.getIgnored();
      if (res.success) setIgnored(res.data);
    } catch { /* Supabase indisponível */ }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadIgnored(); }, [loadIgnored]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [statusFilter, extraFilters, debouncedName]);

  const refreshRef = useRefreshOnFocus(useCallback(() => Promise.all([
    loadSummary(), loadLeads(), loadIgnored(),
  ]), [loadSummary, loadLeads, loadIgnored]));

  async function restoreIgnored(item) {
    try {
      await api.restoreIgnored(item.id);
      setIgnored(prev => prev.filter(i => i.id !== item.id));
      flash(`"${item.name}" poderá aparecer em buscas futuras novamente`);
    } catch {
      flash('Erro ao restaurar empresa');
    }
  }

  function flash(msg) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3500);
  }

  // Estáveis para a memoização das linhas (identidade constante entre renders).
  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const openModal = useCallback((lead) => setModalLead(lead), []);
  const openTaskLead = useCallback((task) => {
    const compactLead = task?.lead || (task?.result_id ? { id: task.result_id, name: 'Carregando lead...' } : null);
    if (!compactLead?.id) return;
    setModalLead(compactLead);
    api.getLead?.(compactLead.id)
      .then(response => { if (response?.success && response.data) setModalLead(current => current?.id === compactLead.id ? { ...current, ...response.data } : current); })
      .catch(() => { /* mantém o resumo disponível */ });
  }, []);

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev);
      const pageSelected = leads.length > 0 && leads.every(lead => next.has(lead.id));
      leads.forEach(lead => pageSelected ? next.delete(lead.id) : next.add(lead.id));
      return next;
    });
  }

  async function selectAllFiltered() {
    setSelectingAll(true);
    setError('');
    try {
      const limit = Math.min(total, MAX_FILTER_SELECTION);
      const res = await api.getAllLeads(1, limit, activeFilters, false);
      const ids = (res.data.data || []).map(lead => lead.id).filter(id => id !== undefined && id !== null);
      setSelected(new Set(ids));
      flash(total > ids.length
        ? `${ids.length.toLocaleString('pt-BR')} primeiros leads do filtro selecionados (limite de segurança)`
        : `${ids.length.toLocaleString('pt-BR')} leads do filtro selecionados`);
    } catch {
      setError('Não foi possível selecionar todos os leads deste filtro.');
    } finally {
      setSelectingAll(false);
    }
  }

  async function bulkAction(status, label) {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      await runInChunks(ids, chunk => api.bulkStatus(chunk, status));
      flash(`${ids.length} leads movidos para "${label}"`);
      setSelected(new Set());
      loadLeads(true);
      loadSummary();
    } catch {
      flash('Erro ao atualizar leads');
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Apagar ${ids.length} leads definitivamente?`)) return;
    try {
      await runInChunks(ids, chunk => api.bulkDelete(chunk));
      flash(`${ids.length} leads apagados`);
      setSelected(new Set());
      loadLeads(true);
      loadSummary();
      loadIgnored();
    } catch {
      flash('Erro ao apagar leads');
    }
  }

  function onLeadUpdated(updated) {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
    setModalLead(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
    loadSummary();
  }

  function onLeadDeleted(id) {
    setLeads(prev => prev.filter(l => l.id !== id));
    setTotal(t => Math.max(0, t - 1));
    loadSummary();
    loadIgnored();
  }

  async function startMutirao() {
    setMutiraoLoading(true);
    try {
      const res = await api.getAllLeads(1, 100, { prospect_status: 'fila' });
      if (res.success && res.data.data.length > 0) {
        setMutiraoLeads(res.data.data);
        setMutiraoIndex(0);
        setMutiraoActive(true);
      } else {
        alert('Nenhum lead na fila de envio no momento. Adicione leads à fila primeiro!');
      }
    } catch (e) {
      alert('Erro ao carregar fila do mutirão');
    }
    setMutiraoLoading(false);
  }

  function applySuggestion(sug) {
    setStatusFilter('');
    setExtraFilters(sug.filters);
  }

  function clearFilters() {
    setStatusFilter('');
    setExtraFilters({});
    setNameFilter('');
  }

  const counts = summary?.statusCounts || {};
  const followUps = summary?.followUps || { count: 0, sample: [] };
  const dueTasks = summary?.dueTasks || { count: 0, sample: [] };
  const suggestions = (summary?.suggestions || []).filter(s => s.count > 0);
  const totalLeads = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasExtraFilters = Object.keys(extraFilters).length > 0;
  const pageAllSelected = leads.length > 0 && leads.every(lead => selected.has(lead.id));

  return (
    <div ref={refreshRef}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fafafa', marginBottom: 4 }}>Prospecção</h1>
        <p style={{ color: '#52525b', fontSize: 14 }}>Controle quem já recebeu mensagem, quem está na fila e quem respondeu</p>
      </div>

      {error && (
        <div role="alert" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
          <AlertTriangle size={14} color="#ef4444" /> <span>{error}</span>
          <button type="button" onClick={() => loadLeads(true)} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '5px 9px', cursor: 'pointer', fontSize: 11 }}>Tentar novamente</button>
        </div>
      )}

      {/* ——— Funil: cartões por status ——— */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <button onClick={clearFilters}
          style={{
            ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
            border: !statusFilter && !hasExtraFilters ? '1px solid #10b981' : card.border,
            background: !statusFilter && !hasExtraFilters ? 'rgba(16,185,129,0.08)' : card.background,
          }}>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#fafafa' }}>{totalLeads}</div>
          <div style={{ fontSize: 12, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <LayoutGrid size={13} color="#a1a1aa" />
            <span>Todos</span>
          </div>
        </button>
        {STATUS_OPTIONS.map(opt => {
          const active = statusFilter === opt.value;
          return (
            <button key={opt.value} onClick={() => { setExtraFilters({}); setStatusFilter(active ? '' : opt.value); }}
              style={{
                ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                border: active ? `1px solid ${opt.color}` : card.border,
                background: active ? `${opt.color}12` : card.background,
              }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: opt.color }}>{counts[opt.value] || 0}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <DynIcon name={opt.icon} size={13} color={opt.color} />
                <span>{opt.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ——— Agenda vencida ——— */}
      {dueTasks.count > 0 && (
        <section aria-labelledby="due-tasks-title" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)', padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 id="due-tasks-title" style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#ef4444" /> {dueTasks.count} {dueTasks.count === 1 ? 'tarefa vencida' : 'tarefas vencidas'}
              </h2>
              <p style={{ color: '#71717a', fontSize: 11, margin: '3px 0 0' }}>Abra a ficha para concluir ou reagendar a próxima ação.</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(dueTasks.sample || []).slice(0, 4).map(task => (
                <button type="button" key={task.id} onClick={() => openTaskLead(task)}
                  title={task.title}
                  style={{ background: '#09090b', border: '1px solid rgba(239,68,68,0.3)', color: '#e4e4e7', padding: '6px 9px', cursor: 'pointer', fontSize: 11, maxWidth: 220, textAlign: 'left' }}>
                  <strong style={{ color: '#fca5a5' }}>{task.lead?.name || 'Lead'}</strong> · {task.title}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ——— Alerta de follow-up ——— */}
      {followUps.count > 0 && (
        <div style={{
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 0,
          padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="#8b5cf6" />
            <span><strong>{followUps.count}</strong> {followUps.count === 1 ? 'lead recebeu' : 'leads receberam'} mensagem há 3+ dias e ainda {followUps.count === 1 ? 'está' : 'estão'} sem resposta. Que tal um follow-up?</span>
          </span>
          <button onClick={() => { setExtraFilters({}); setStatusFilter('enviado'); }}
            style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Ver enviados
          </button>
        </div>
      )}

      {/* ——— Sugestões inteligentes ——— */}
      {suggestions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>
          {suggestions.map(sug => (
            <div key={sug.type} style={{ ...card, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={14} color="#f59e0b" />
                  <span>{sug.count} {sug.title.toLowerCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: '#52525b', marginTop: 2 }}>{sug.hint}</div>
              </div>
              <button onClick={() => applySuggestion(sug)}
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '7px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                Ver leads
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ——— Barra de busca + filtro ativo ——— */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <input
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Buscar empresa por nome..."
            style={{ width: '100%', background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: '9px 14px', color: '#fafafa', fontSize: 13, outline: 'none' }}
          />
        </div>
        {hasExtraFilters && (
          <button onClick={clearFilters}
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <X size={12} />
            <span>Limpar filtro de sugestão</span>
          </button>
        )}
        <button onClick={startMutirao} disabled={mutiraoLoading}
          style={{
            background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', border: 'none',
            padding: '9px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
          {mutiraoLoading ? 'Carregando Fila...' : <><Zap size={14} /> Modo Mutirão</>}
        </button>
        <span aria-live="polite" style={{ fontSize: 13, color: /Erro/.test(actionMsg) ? '#fca5a5' : '#10b981' }}>{actionMsg}</span>
      </div>

      {/* ——— Barra de ações em massa ——— */}
      {selected.size > 0 && (
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 0,
          padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span className="mono" style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>{selected.size} selecionados:</span>
          {pageAllSelected && total > selected.size && (
            <button type="button" onClick={selectAllFiltered} disabled={selectingAll}
              style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.35)', padding: '6px 13px', cursor: selectingAll ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600 }}>
              {selectingAll ? 'Selecionando...' : `Selecionar ${Math.min(total, MAX_FILTER_SELECTION).toLocaleString('pt-BR')} deste filtro`}
            </button>
          )}
          <button onClick={() => bulkAction('fila', 'Na fila')}
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Pin size={12} color="#f59e0b" />
            <span>Enviar depois</span>
          </button>
          <button onClick={() => bulkAction('enviado', 'Mensagem enviada')}
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Send size={12} color="#a78bfa" />
            <span>Marcar enviada</span>
          </button>
          <button onClick={() => bulkAction('descartado', 'Descartado')}
            style={{ background: 'rgba(82,82,91,0.15)', color: '#a1a1aa', border: '1px solid #27272a', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <XCircle size={12} color="#a1a1aa" />
            <span>Descartar</span>
          </button>
          <button onClick={bulkDelete}
            style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={12} color="#ef4444" />
            <span>Apagar</span>
          </button>
        </div>
      )}

      {/* ——— Lista de leads ——— */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 14px', borderBottom: '1px solid #27272a', width: 36 }}>
                  <input type="checkbox" checked={pageAllSelected} onChange={toggleSelectAll} aria-label="Selecionar leads desta página" style={{ accentColor: '#10b981', cursor: 'pointer' }} />
                </th>
                {['Empresa', 'Status', 'Contato', 'Último contato', 'Origem', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '12px 14px', color: '#52525b', fontWeight: 500, borderBottom: '1px solid #27272a', fontSize: 12, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#52525b', fontFamily: 'var(--font-mono)' }}>Carregando leads...</td></tr>
              )}
              {!loading && leads.map(lead => (
                <ProspectRow
                  key={lead.id}
                  lead={lead}
                  isSelected={selected.has(lead.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={openModal}
                />
              ))}
              {!loading && !leads.length && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 50, color: '#52525b' }}>
                  {totalLeads === 0
                    ? 'Nenhum lead ainda. Use a aba Buscar Leads para capturar os primeiros!'
                    : 'Nenhum lead com esses filtros.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px 18px', borderRadius: 0, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            ← Anterior
          </button>
          <span style={{ color: '#52525b', fontSize: 13 }}>Página {page} de {totalPages} · <span className="mono">{total.toLocaleString('pt-BR')}</span> leads</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px 18px', borderRadius: 0, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Próxima →
          </button>
        </div>
      )}

      {/* ——— Empresas ignoradas (apagadas pelo usuário) ——— */}
      {ignored.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setShowIgnored(v => !v)}
            style={{ background: 'transparent', border: 'none', color: '#52525b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
            <XCircle size={13} color="#52525b" />
            <span><span className="mono">{ignored.length}</span> {ignored.length === 1 ? 'empresa ignorada' : 'empresas ignoradas'} — apagadas por você, nunca mais serão importadas nem sugeridas</span>
            <span style={{ fontSize: 10 }}>{showIgnored ? '▲' : '▼'}</span>
          </button>

          {showIgnored && (
            <div style={{ ...card, marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
              {ignored.map(item => (
                <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid #18181b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name || '(sem nome)'}</div>
                    <div className="mono" style={{ fontSize: 11, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[item.phone, item.address].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <button onClick={() => restoreIgnored(item)}
                    title="Permitir que esta empresa volte a aparecer em buscas futuras"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', padding: '5px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal da empresa */}
      {modalLead && (
        <LeadModal
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onUpdated={onLeadUpdated}
          onDeleted={onLeadDeleted}
        />
      )}

      {/* Modal do Modo Mutirão */}
      {mutiraoActive && mutiraoLeads[mutiraoIndex] && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20
          }}
        >
          <div
            style={{
              background: '#09090b', border: '1px solid #27272a', borderRadius: 0,
              width: '100%', maxWidth: 500, padding: 28, boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: 20
            }}
          >
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '3px 8px', borderRadius: 0, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Zap size={12} color="#10b981" />
                  <span>Modo Mutirão</span>
                </span>
                <div className="mono" style={{ fontSize: 12, color: '#52525b', marginTop: 4 }}>
                  Lead {mutiraoIndex + 1} de {mutiraoLeads.length} na fila
                </div>
              </div>
              <button onClick={() => { setMutiraoActive(false); loadLeads(true); loadSummary(); }} style={{ background: 'transparent', border: 'none', color: '#52525b', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Conteúdo do Lead Ativo */}
            {(() => {
              const lead = mutiraoLeads[mutiraoIndex];
              const waUrl = getWhatsAppUrl(lead.phone);
              return (
                <>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', marginBottom: 6 }}>{lead.name}</h3>
                    <p style={{ fontSize: 13, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={12} color="#a1a1aa" />
                      <span>{lead.category || 'Sem categoria'}</span>
                    </p>
                    {lead.address && <p style={{ fontSize: 12, color: '#52525b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={12} color="#52525b" /> <span>{lead.address}</span></p>}
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {waUrl ? (
                      <button onClick={() => window.open(waUrl, '_blank', 'noopener')}
                        style={{
                          background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff',
                          border: 'none', padding: '12px', borderRadius: 0, cursor: 'pointer',
                          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}>
                        <MessageCircle size={15} />
                        <span>Abrir WhatsApp</span>
                      </button>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 13, padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <AlertTriangle size={14} color="#ef4444" />
                        <span>Este lead não possui telefone cadastrado.</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      <button onClick={async () => {
                        try {
                          await api.updateLead(lead.id, { status: 'enviado' });
                          // Avança para o próximo ou finaliza
                          if (mutiraoIndex + 1 < mutiraoLeads.length) {
                            setMutiraoIndex(prev => prev + 1);
                          } else {
                            alert('Parabéns! Você concluiu toda a fila do mutirão!');
                            setMutiraoActive(false);
                            loadLeads(true);
                            loadSummary();
                          }
                        } catch (e) {
                          alert('Erro ao atualizar status');
                        }
                      }}
                        style={{
                          flex: 1, background: '#8b5cf6', color: '#fff', border: 'none',
                          padding: '11px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}>
                        <Send size={13} />
                        <span>Marcar como Enviado</span>
                      </button>

                      <button onClick={() => {
                        if (mutiraoIndex + 1 < mutiraoLeads.length) {
                          setMutiraoIndex(prev => prev + 1);
                        } else {
                          alert('Fim da fila do mutirão.');
                          setMutiraoActive(false);
                          loadLeads(true);
                          loadSummary();
                        }
                      }}
                        style={{
                          background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa',
                          padding: '11px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 13
                        }}>
                        Pular ➔
                      </button>
                    </div>
                  </div>

                  {/* Anotações no Mutirão */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#52525b', marginBottom: 6, textTransform: 'uppercase' }}>
                      Anotações rápidas
                    </label>
                    <textarea
                      placeholder="Anotações para este lead..."
                      value={lead.notes || ''}
                      onChange={(e) => {
                        const txt = e.target.value;
                        setMutiraoLeads(prev => prev.map((l, idx) => idx === mutiraoIndex ? { ...l, notes: txt } : l));
                      }}
                      onBlur={async () => {
                        try {
                          await api.updateLead(lead.id, { notes: lead.notes });
                        } catch (e) { /* ignora */ }
                      }}
                      rows={2}
                      style={{
                        width: '100%', background: '#18181b', border: '1px solid #27272a', borderRadius: 0,
                        padding: '8px 12px', color: '#fafafa', fontSize: 12, outline: 'none', resize: 'none', fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
