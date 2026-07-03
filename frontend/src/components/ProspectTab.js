import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getStatusMeta, getWhatsAppUrl, timeSince } from '../statuses';

const card = { background: '#1e293b', border: '1px solid #334155', borderRadius: 16 };
const LIMIT = 50;

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

  // Estados do Modo Mutirão
  const [mutiraoActive, setMutiraoActive] = useState(false);
  const [mutiraoIndex, setMutiraoIndex] = useState(0);
  const [mutiraoLeads, setMutiraoLeads] = useState([]);
  const [mutiraoLoading, setMutiraoLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.getProspectSummary();
      if (res.success) setSummary(res.data);
    } catch { /* backend indisponível */ }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { ...extraFilters };
      if (statusFilter) filters.prospect_status = statusFilter;
      if (nameFilter) filters.name = nameFilter;
      const res = await api.getAllLeads(page, LIMIT, filters);
      if (res.success) {
        setLeads(res.data.data || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* backend indisponível */ }
    setLoading(false);
  }, [page, statusFilter, extraFilters, nameFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [statusFilter, extraFilters, nameFilter]);

  function flash(msg) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3500);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === leads.length ? new Set() : new Set(leads.map(l => l.id)));
  }

  async function bulkAction(status, label) {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      await api.bulkStatus(ids, status);
      flash(`✅ ${ids.length} leads movidos para "${label}"`);
      setSelected(new Set());
      loadLeads();
      loadSummary();
    } catch {
      flash('❌ Erro ao atualizar leads');
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Apagar ${ids.length} leads definitivamente?`)) return;
    try {
      await api.bulkDelete(ids);
      flash(`🗑️ ${ids.length} leads apagados`);
      setSelected(new Set());
      loadLeads();
      loadSummary();
    } catch {
      flash('❌ Erro ao apagar leads');
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
  const suggestions = (summary?.suggestions || []).filter(s => s.count > 0);
  const totalLeads = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasExtraFilters = Object.keys(extraFilters).length > 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Prospecção</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Controle quem já recebeu mensagem, quem está na fila e quem respondeu</p>
      </div>

      {/* ——— Funil: cartões por status ——— */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <button onClick={clearFilters}
          style={{
            ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
            border: !statusFilter && !hasExtraFilters ? '1px solid #3b82f6' : card.border,
            background: !statusFilter && !hasExtraFilters ? 'rgba(59,130,246,0.08)' : card.background,
          }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{totalLeads}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>🗂️ Todos</div>
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
              <div style={{ fontSize: 20, fontWeight: 700, color: opt.color }}>{counts[opt.value] || 0}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{opt.emoji} {opt.label}</div>
            </button>
          );
        })}
      </div>

      {/* ——— Alerta de follow-up ——— */}
      {followUps.count > 0 && (
        <div style={{
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 14,
          padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#c4b5fd' }}>
            ⏰ <strong>{followUps.count}</strong> {followUps.count === 1 ? 'lead recebeu' : 'leads receberam'} mensagem há 3+ dias e ainda {followUps.count === 1 ? 'está' : 'estão'} sem resposta. Que tal um follow-up?
          </span>
          <button onClick={() => { setExtraFilters({}); setStatusFilter('enviado'); }}
            style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
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
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>💡 {sug.count} {sug.title.toLowerCase()}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sug.hint}</div>
              </div>
              <button onClick={() => applySuggestion(sug)}
                style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                Ver leads
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ——— Barra de busca + filtro ativo ——— */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          placeholder="🔎 Buscar empresa por nome..."
          style={{ flex: 1, minWidth: 220, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '9px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
        />
        {hasExtraFilters && (
          <button onClick={clearFilters}
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12 }}>
            ✕ Limpar filtro de sugestão
          </button>
        )}
        <button onClick={startMutirao} disabled={mutiraoLoading}
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none',
            padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
          {mutiraoLoading ? 'Carregando Fila...' : '⚡ Modo Mutirão'}
        </button>
        {actionMsg && <span style={{ fontSize: 13, color: '#22c55e' }}>{actionMsg}</span>}
      </div>

      {/* ——— Barra de ações em massa ——— */}
      {selected.size > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12,
          padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>{selected.size} selecionados:</span>
          <button onClick={() => bulkAction('fila', 'Na fila')}
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            📌 Enviar depois
          </button>
          <button onClick={() => bulkAction('enviado', 'Mensagem enviada')}
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            📤 Marcar enviada
          </button>
          <button onClick={() => bulkAction('descartado', 'Descartado')}
            style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid #334155', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
            ❌ Descartar
          </button>
          <button onClick={bulkDelete}
            style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>
            🗑️ Apagar
          </button>
        </div>
      )}

      {/* ——— Lista de leads ——— */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 14px', borderBottom: '1px solid #334155', width: 36 }}>
                  <input type="checkbox" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleSelectAll} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
                </th>
                {['Empresa', 'Status', 'Contato', 'Último contato', 'Origem', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '12px 14px', color: '#64748b', fontWeight: 500, borderBottom: '1px solid #334155', fontSize: 12, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando leads...</td></tr>
              )}
              {!loading && leads.map(lead => {
                const meta = getStatusMeta(lead.prospect_status);
                const waUrl = getWhatsAppUrl(lead.phone);
                return (
                  <tr key={lead.id}
                      style={{ transition: 'background 0.15s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
                    </td>
                    <td onClick={() => setModalLead(lead)} style={{ padding: '10px 14px', maxWidth: 220 }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.name}>
                        {lead.name}
                        {lead.notes && <span title="Tem anotações" style={{ marginLeft: 6 }}>📝</span>}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.category || '—'}</div>
                    </td>
                    <td onClick={() => setModalLead(lead)} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}18`, padding: '3px 10px', borderRadius: 20 }}>
                        {meta.emoji} {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#94a3b8' }}>{lead.phone || '—'}</span>
                        {waUrl && (
                          <a href={waUrl} target="_blank" rel="noreferrer" title="Abrir WhatsApp"
                             style={{ textDecoration: 'none', background: 'rgba(34,197,94,0.15)', width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                            💬
                          </a>
                        )}
                      </div>
                    </td>
                    <td onClick={() => setModalLead(lead)} style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {lead.last_contact_at ? timeSince(lead.last_contact_at) : '—'}
                    </td>
                    <td onClick={() => setModalLead(lead)} style={{ padding: '10px 14px', color: '#64748b', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.search_filename}>
                      {lead.search_keyword || lead.search_filename || '—'}
                    </td>
                    <td onClick={() => setModalLead(lead)} style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{ color: '#3b82f6', fontSize: 12, fontWeight: 500 }}>Abrir →</span>
                    </td>
                  </tr>
                );
              })}
              {!loading && !leads.length && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                  {totalLeads === 0
                    ? 'Nenhum lead ainda. Use a aba 🔍 Buscar Leads para capturar os primeiros!'
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
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 18px', borderRadius: 8, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            ← Anterior
          </button>
          <span style={{ color: '#64748b', fontSize: 13 }}>Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} leads</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 18px', borderRadius: 8, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Próxima →
          </button>
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
            position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20
          }}
        >
          <div
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 24,
              width: '100%', maxWidth: 500, padding: 28, boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: 20
            }}
          >
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase' }}>
                  ⚡ Modo Mutirão
                </span>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Lead {mutiraoIndex + 1} de {mutiraoLeads.length} na fila
                </div>
              </div>
              <button onClick={() => { setMutiraoActive(false); loadLeads(); loadSummary(); }} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {/* Conteúdo do Lead Ativo */}
            {(() => {
              const lead = mutiraoLeads[mutiraoIndex];
              const waUrl = getWhatsAppUrl(lead.phone);
              return (
                <>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{lead.name}</h3>
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>🏷️ {lead.category || 'Sem categoria'}</p>
                    {lead.address && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>📍 {lead.address}</p>}
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {waUrl ? (
                      <button onClick={() => window.open(waUrl, '_blank', 'noopener')}
                        style={{
                          background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                          border: 'none', padding: '12px', borderRadius: 12, cursor: 'pointer',
                          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}>
                        💬 Abrir WhatsApp
                      </button>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 13, padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 10 }}>
                        ⚠️ Este lead não possui telefone cadastrado.
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
                            loadLeads();
                            loadSummary();
                          }
                        } catch (e) {
                          alert('Erro ao atualizar status');
                        }
                      }}
                        style={{
                          flex: 1, background: '#8b5cf6', color: '#fff', border: 'none',
                          padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600
                        }}>
                        📤 Marcar como Enviado
                      </button>

                      <button onClick={() => {
                        if (mutiraoIndex + 1 < mutiraoLeads.length) {
                          setMutiraoIndex(prev => prev + 1);
                        } else {
                          alert('Fim da fila do mutirão reached.');
                          setMutiraoActive(false);
                          loadLeads();
                          loadSummary();
                        }
                      }}
                        style={{
                          background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                          padding: '11px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13
                        }}>
                        Pular ➔
                      </button>
                    </div>
                  </div>

                  {/* Anotações no Mutirão */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
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
                        width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                        padding: '8px 12px', color: '#f1f5f9', fontSize: 12, outline: 'none', resize: 'none', fontFamily: 'inherit'
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
