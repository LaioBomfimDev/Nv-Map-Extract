import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { STATUS_OPTIONS, getStatusMeta, getWhatsAppUrl, leadScore, scoreBadge, timeSince } from '../statuses';
import { Phone, Mail, Globe, MapPin, Star, Tag, Share2, Instagram, Facebook, Linkedin, Twitter, Youtube, StickyNote, MessageCircle, Pin, Send, Calendar, Trash2, StarFilled, Map, X, DynIcon } from './Icons';

function firstValue(value) {
  return String(value ?? '').split(',')[0].trim();
}

function safeExternalUrl(value) {
  const raw = firstValue(value);
  if (!raw) return '';
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeMailto(value) {
  const email = firstValue(value);
  if (!/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(email)) return '';
  return `mailto:${email}`;
}

// Modal com a ficha completa da empresa: contatos, status do funil,
// anotações e ações rápidas (WhatsApp, salvar pra depois, apagar).
export default function LeadModal({ lead, onClose, onUpdated, onDeleted }) {
  const [status, setStatus]       = useState(lead?.prospect_status || 'novo');
  const [notes, setNotes]         = useState(lead?.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [askSent, setAskSent]     = useState(false);
  const [lastContact, setLastContact] = useState(lead?.last_contact_at || null);
  const touched = useRef({ status: false, notes: false });
  const leadId = lead?.id;
  const leadStatus = lead?.prospect_status;
  const leadNotes = lead?.notes;
  const leadLastContact = lead?.last_contact_at;

  useEffect(() => {
    touched.current = { status: false, notes: false };
    setStatus(lead?.prospect_status || 'novo');
    setNotes(lead?.notes || '');
    setLastContact(lead?.last_contact_at || null);
    setAskSent(false);
    setNotesSaved(false);
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (leadId === undefined || leadId === null) return;
    if (!touched.current.status) {
      setStatus(leadStatus || 'novo');
      setLastContact(leadLastContact || null);
    }
    if (!touched.current.notes) {
      setNotes(leadNotes || '');
    }
  }, [leadId, leadStatus, leadNotes, leadLastContact]);

  const escHandler = useCallback((e) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, [escHandler]);

  if (!lead) return null;

  const waUrl = getWhatsAppUrl(lead.phone);
  const emailHref = safeMailto(lead.email);
  const websiteHref = safeExternalUrl(lead.website);
  const score = leadScore(lead);
  const badge = scoreBadge(score);
  const meta = getStatusMeta(status);

  async function changeStatus(newStatus) {
    const prev = status;
    const prevLastContact = lastContact;
    const nextLastContact = newStatus === 'enviado' ? new Date().toISOString() : lastContact;
    touched.current.status = true;
    setStatus(newStatus);
    if (newStatus === 'enviado') setLastContact(nextLastContact);
    try {
      await api.updateLead(lead.id, { status: newStatus });
      onUpdated?.({ ...lead, prospect_status: newStatus, last_contact_at: nextLastContact });
      setAskSent(false);
    } catch {
      setStatus(prev);
      setLastContact(prevLastContact);
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
    if (!window.confirm(`Apagar "${lead.name || 'este lead'}" definitivamente?`)) return;
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
    { key: 'instagram', icon: <Instagram size={12} />, label: 'Instagram', url: lead.instagram },
    { key: 'facebook',  icon: <Facebook size={12} />,  label: 'Facebook',  url: lead.facebook },
    { key: 'linkedin',  icon: <Linkedin size={12} />,  label: 'LinkedIn',  url: lead.linkedin },
    { key: 'twitter',   icon: <Twitter size={12} />,   label: 'Twitter/X', url: lead.twitter },
    { key: 'youtube',   icon: <Youtube size={12} />,   label: 'YouTube',   url: lead.youtube },
  ].map(s => ({ ...s, href: safeExternalUrl(s.url) })).filter(s => s.href);

  const infoRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #18181b', fontSize: 13 };
  const infoLabel = { color: '#52525b', width: 92, flexShrink: 0, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 };
  const linkStyle = { color: '#10b981', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#09090b', border: '1px solid #27272a', borderRadius: 0,
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>

        {/* Cabeçalho */}
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #18181b', position: 'sticky', top: 0, background: '#09090b', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#fafafa', marginBottom: 4, lineHeight: 1.3 }}>{lead.name}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {lead.category && <span style={{ fontSize: 12, color: '#a1a1aa' }}>{lead.category}</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: `${badge.color}18`, padding: '2px 8px', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <DynIcon name={badge.icon} size={11} color={badge.color} />
                  <span>{badge.label} · <span className="mono">{score}pts</span></span>
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#52525b', fontSize: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
              <X size={18} color="#52525b" />
            </button>
          </div>

          {/* Seletor de status do funil */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(opt => {
              const active = status === opt.value;
              return (
                <button key={opt.value} onClick={() => changeStatus(opt.value)}
                  style={{
                    background: active ? `${opt.color}25` : 'transparent',
                    color: active ? opt.color : '#52525b',
                    border: active ? `1px solid ${opt.color}55` : '1px solid #27272a',
                    borderRadius: 0, padding: '4px 11px', fontSize: 12, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                  <DynIcon name={opt.icon} size={12} color={active ? opt.color : '#52525b'} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {lastContact && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#52525b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={12} color="#52525b" />
              <span>Última mensagem: <span style={{ color: '#a1a1aa' }}>{timeSince(lastContact)}</span></span>
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
                  flex: 1, minWidth: 160, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff',
                  border: 'none', padding: '11px 16px', borderRadius: 0, cursor: 'pointer',
                  fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                <MessageCircle size={15} />
                <span>Abrir WhatsApp</span>
              </button>
            )}
            {status === 'novo' && (
              <button onClick={() => changeStatus('fila')}
                style={{
                  flex: 1, minWidth: 160, background: 'rgba(16,185,129,0.15)', color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.35)', padding: '11px 16px', borderRadius: 0,
                  cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                <Pin size={14} color="#10b981" />
                <span>Salvar pra depois</span>
              </button>
            )}
          </div>

          {/* Confirmação manual pós-WhatsApp */}
          {askSent && (
            <div style={{
              background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 0,
              padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: '#c4b5fd' }}>Enviou a mensagem pra eles?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => changeStatus('enviado')}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Send size={12} />
                  <span>Sim, marcar enviada</span>
                </button>
                <button onClick={() => setAskSent(false)}
                  style={{ background: 'transparent', color: '#52525b', border: '1px solid #27272a', padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12 }}>
                  Ainda não
                </button>
              </div>
            </div>
          )}

          {/* Informações principais */}
          <div style={{ marginBottom: 18 }}>
            <div style={infoRow}>
              <span style={infoLabel}>
                <Phone size={13} color="#52525b" />
                <span>Telefone</span>
              </span>
              <span className="mono" style={{ color: '#e4e4e7' }}>{lead.phone || '—'}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>
                <Mail size={13} color="#52525b" />
                <span>E-mail</span>
              </span>
              {emailHref
                ? <a href={emailHref} style={linkStyle} title={lead.email}>{lead.email}</a>
                : <span style={{ color: '#52525b' }}>—</span>}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>
                <Globe size={13} color="#52525b" />
                <span>Site</span>
              </span>
              {websiteHref ? (
                <a href={websiteHref} target="_blank" rel="noreferrer" style={linkStyle} title={lead.website}>{lead.website}</a>
              ) : (
                <span style={{ color: lead.website ? '#a1a1aa' : '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.website || '—'}
                </span>
              )}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>
                <MapPin size={13} color="#52525b" />
                <span>Endereço</span>
              </span>
              <span style={{ color: '#a1a1aa', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.address}>{lead.address || '—'}</span>
              {lead.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + lead.address)}`}
                   target="_blank" rel="noreferrer" title="Abrir no Google Maps"
                   style={{ textDecoration: 'none', fontSize: 13, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                     <Map size={12} color="#10b981" />
                </a>
              )}
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>
                <Star size={13} color="#52525b" />
                <span>Avaliação</span>
              </span>
              {lead.rating > 0
                ? <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <StarFilled size={13} color="#f59e0b" />
                    <span className="mono">{Number(lead.rating).toFixed(1)}</span>
                    <span style={{ color: '#52525b', fontWeight: 400, fontSize: 12 }}>({lead.reviews_count || 0} avaliações)</span>
                  </span>
                : <span style={{ color: '#52525b' }}>—</span>}
            </div>
            <div style={{ ...infoRow, borderBottom: socials.length ? infoRow.borderBottom : 'none' }}>
              <span style={infoLabel}>
                <Tag size={13} color="#52525b" />
                <span>Origem</span>
              </span>
              <span style={{ color: '#a1a1aa', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.search_filename || lead.search_keyword || `Busca #${lead.search_id}`}
              </span>
            </div>
            {socials.length > 0 && (
              <div style={{ ...infoRow, borderBottom: 'none' }}>
                <span style={infoLabel}>
                  <Share2 size={13} color="#52525b" />
                  <span>Redes</span>
                </span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {socials.map(s => (
                    <a key={s.key} href={s.href} target="_blank" rel="noreferrer"
                       style={{ fontSize: 12, color: '#10b981', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {s.icon} <span>{s.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Anotações */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <StickyNote size={13} color="#a1a1aa" />
              <span>Anotações</span>
            </label>
            <textarea
              value={notes}
              onChange={e => { touched.current.notes = true; setNotes(e.target.value); }}
              placeholder="Ex: Falei com a dona, pediu pra chamar semana que vem..."
              rows={3}
              style={{
                width: '100%', background: '#18181b', border: '1px solid #27272a', borderRadius: 0,
                padding: '10px 13px', color: '#fafafa', fontSize: 13, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
              {notesSaved && <span style={{ fontSize: 12, color: '#10b981' }}>✅ Salvo!</span>}
              <button onClick={saveNotes} disabled={savingNotes}
                style={{
                  background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
                  padding: '7px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  opacity: savingNotes ? 0.6 : 1,
                }}>
                {savingNotes ? 'Salvando...' : 'Salvar anotações'}
              </button>
            </div>
          </div>

          {/* Rodapé: apagar */}
          <div style={{ borderTop: '1px solid #18181b', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#52525b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <DynIcon name={meta.icon} size={11} color={meta.color} />
              <span>Status atual: {meta.label}</span>
            </span>
            <button onClick={deleteLead}
              style={{ background: 'transparent', color: '#ef4444', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12} color="#ef4444" />
              <span>Apagar lead</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
