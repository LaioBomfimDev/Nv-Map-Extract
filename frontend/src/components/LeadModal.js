import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { STATUS_OPTIONS, getStatusMeta, getWhatsAppUrl, leadScore, scoreBadge, timeSince } from '../statuses';

// Modal com a ficha completa da empresa: contatos, status do funil,
// anotações e ações rápidas (WhatsApp, salvar pra depois, apagar).
export default function LeadModal({ lead, onClose, onUpdated, onDeleted }) {
  const [status, setStatus]       = useState(lead?.prospect_status || 'novo');
  const [notes, setNotes]         = useState(lead?.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [askSent, setAskSent]     = useState(false);
  const [lastContact, setLastContact] = useState(lead?.last_contact_at || null);

  useEffect(() => {
    setStatus(lead?.prospect_status || 'novo');
    setNotes(lead?.notes || '');
    setLastContact(lead?.last_contact_at || null);
    setAskSent(false);
    setNotesSaved(false);
  }, [lead]);

  const escHandler = useCallback((e) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, [escHandler]);

  if (!lead) return null;

  const waUrl = getWhatsAppUrl(lead.phone);
  const score = leadScore(lead);
  const badge = scoreBadge(score);
  const meta = getStatusMeta(status);

  async function changeStatus(newStatus) {
    const prev = status;
    setStatus(newStatus);
    if (newStatus === 'enviado') setLastContact(new Date().toISOString());
    try {
      await api.updateLead(lead.id, { status: newStatus });
      onUpdated?.({ ...lead, prospect_status: newStatus, notes, last_contact_at: newStatus === 'enviado' ? new Date().toISOString() : lastContact });
      setAskSent(false);
    } catch {
      setStatus(prev);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.updateLead(lead.id, { notes });
      onUpdated?.({ ...lead, prospect_status: status, notes });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch { /* mantém texto para nova tentativa */ }
    setSavingNotes(false);
  }

  async function deleteLead() {
    if (!window.confirm(`Apagar "${lead.name}" definitivamente?`)) return;
    try {
      await api.bulkDelete([lead.id]);
      onDeleted?.(lead.id);
      onClose();
    } catch { /* ignora */ }
  }

  function openWhatsApp() {
    window.open(waUrl, '_blank', 'noopener');
    if (status !== 'enviado') setAskSent(true);
  }

  const socials = [
    { key: 'instagram', icon: '📸', label: 'Instagram', url: lead.instagram },
    { key: 'facebook',  icon: '👥', label: 'Facebook',  url: lead.facebook },
    { key: 'linkedin',  icon: '👔', label: 'LinkedIn',  url: lead.linkedin },
    { key: 'twitter',   icon: '🐦', label: 'Twitter/X', url: lead.twitter },
    { key: 'youtube',   icon: '🎥', label: 'YouTube',   url: lead.youtube },
  ].filter(s => s.url);

  const infoRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #1e293b', fontSize: 13 };
  const infoLabel = { color: '#64748b', width: 92, flexShrink: 0, fontSize: 12 };
  const linkStyle = { color: '#3b82f6', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.75)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 20,
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>

        {/* Cabeçalho */}
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, background: '#0f172a', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#f1f5f9', marginBottom: 4, lineHeight: 1.3 }}>{lead.name}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {lead.category && <span style={{ fontSize: 12, color: '#94a3b8' }}>{lead.category}</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: `${badge.color}18`, padding: '2px 8px', borderRadius: 20 }}>
                  {badge.emoji} {badge.label} · {score}pts
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
          </div>

          {/* Seletor de status do funil */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(opt => {
              const active = status === opt.value;
              return (
                <button key={opt.value} onClick={() => changeStatus(opt.value)}
                  style={{
                    background: active ? `${opt.color}25` : 'transparent',
                    color: active ? opt.color : '#64748b',
                    border: active ? `1px solid ${opt.color}55` : '1px solid #334155',
                    borderRadius: 20, padding: '4px 11px', fontSize: 12, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {opt.emoji} {opt.label}
                </button>
              );
            })}
          </div>

          {lastContact && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              📆 Última mensagem: <span style={{ color: '#94a3b8' }}>{timeSince(lastContact)}</span>
            </div>
          )}
        </div>

        {/* Corpo */}
        <div style={{ padding: '14px 26px 22px' }}>

          {/* Ações rápidas */}
          <div style={{ display: 'flex', gap: 10, margin: '10px 0 16px', flexWrap: 'wrap' }}>
            {waUrl && (
              <button onClick={openWhatsApp}
                style={{
                  flex: 1, minWidth: 160, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                  border: 'none', padding: '11px 16px', borderRadius: 12, cursor: 'pointer',
                  fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                💬 Abrir WhatsApp
              </button>
            )}
            {status === 'novo' && (
              <button onClick={() => changeStatus('fila')}
                style={{
                  flex: 1, minWidth: 160, background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.35)', padding: '11px 16px', borderRadius: 12,
                  cursor: 'pointer', fontSize: 14, fontWeight: 600,
                }}>
                📌 Salvar pra depois
              </button>
            )}
          </div>

          {/* Confirmação manual pós-WhatsApp */}
          {askSent && (
            <div style={{
              background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12,
              padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: '#c4b5fd' }}>Enviou a mensagem pra eles?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => changeStatus('enviado')}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  📤 Sim, marcar enviada
                </button>
                <button onClick={() => setAskSent(false)}
                  style={{ background: 'transparent', color: '#64748b', border: '1px solid #334155', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                  Ainda não
                </button>
              </div>
            </div>
          )}

          {/* Informações principais */}
          <div style={{ marginBottom: 18 }}>
            <div style={infoRow}>
              <span style={infoLabel}>📞 Telefone</span>
              <span style={{ color: '#e2e8f0' }}>{lead.phone || '—'}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>✉️ E-mail</span>
              {lead.email
                ? <a href={`mailto:${lead.email.split(',')[0].trim()}`} style={linkStyle} title={lead.email}>{lead.email}</a>
                : <span style={{ color: '#475569' }}>—</span>}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>🌐 Site</span>
              {lead.website
                ? <a href={lead.website} target="_blank" rel="noreferrer" style={linkStyle} title={lead.website}>{lead.website}</a>
                : <span style={{ color: '#475569' }}>—</span>}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>📍 Endereço</span>
              <span style={{ color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.address}>{lead.address || '—'}</span>
              {lead.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + lead.address)}`}
                   target="_blank" rel="noreferrer" title="Abrir no Google Maps"
                   style={{ textDecoration: 'none', fontSize: 13, flexShrink: 0 }}>🗺️</a>
              )}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>⭐ Avaliação</span>
              {lead.rating > 0
                ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>★ {Number(lead.rating).toFixed(1)} <span style={{ color: '#64748b', fontWeight: 400, fontSize: 12 }}>({lead.reviews_count || 0} avaliações)</span></span>
                : <span style={{ color: '#475569' }}>—</span>}
            </div>
            <div style={{ ...infoRow, borderBottom: socials.length ? infoRow.borderBottom : 'none' }}>
              <span style={infoLabel}>🏷️ Origem</span>
              <span style={{ color: '#94a3b8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.search_filename || lead.search_keyword || `Busca #${lead.search_id}`}
              </span>
            </div>
            {socials.length > 0 && (
              <div style={{ ...infoRow, borderBottom: 'none' }}>
                <span style={infoLabel}>📱 Redes</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {socials.map(s => (
                    <a key={s.key} href={s.url.split(',')[0].trim()} target="_blank" rel="noreferrer"
                       style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>
                      {s.icon} {s.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Anotações */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              📝 Anotações
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Falei com a dona, pediu pra chamar semana que vem..."
              rows={3}
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                padding: '10px 13px', color: '#f1f5f9', fontSize: 13, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
              {notesSaved && <span style={{ fontSize: 12, color: '#22c55e' }}>✅ Salvo!</span>}
              <button onClick={saveNotes} disabled={savingNotes}
                style={{
                  background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)',
                  padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  opacity: savingNotes ? 0.6 : 1,
                }}>
                {savingNotes ? 'Salvando...' : 'Salvar anotações'}
              </button>
            </div>
          </div>

          {/* Rodapé: apagar */}
          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#475569' }}>
              Status atual: {meta.emoji} {meta.label}
            </span>
            <button onClick={deleteLead}
              style={{ background: 'transparent', color: '#ef4444', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              🗑️ Apagar lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
