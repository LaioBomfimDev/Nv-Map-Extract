import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { STATUS_OPTIONS, getStatusMeta, getWhatsAppUrl, leadScore, scoreBadge, timeSince } from '../statuses';
import { Phone, Mail, Globe, MapPin, Star, Tag, Share2, Instagram, Facebook, Linkedin, Twitter, Youtube, StickyNote, MessageCircle, Pin, Send, Calendar, Trash2, StarFilled, Map, X, DynIcon, Check, Clock, Activity, AlertTriangle, Target } from './Icons';

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

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function activityMeta(type) {
  const map = {
    message_sent: { label: 'Mensagem enviada', color: '#8b5cf6' },
    status_changed: { label: 'Etapa alterada', color: '#06b6d4' },
    note: { label: 'Anotação', color: '#a1a1aa' },
    call: { label: 'Ligação', color: '#f59e0b' },
    email: { label: 'E-mail', color: '#3b82f6' },
    meeting: { label: 'Reunião', color: '#22c55e' },
    task_completed: { label: 'Tarefa concluída', color: '#10b981' },
  };
  return map[type] || { label: 'Interação', color: '#10b981' };
}

function syntheticTimeline(lead, status, lastContact) {
  const items = [];
  if (lastContact) items.push({ id: 'last-contact', type: 'message_sent', summary: 'Último contato registrado', occurred_at: lastContact });
  if (status && status !== 'novo') {
    const meta = getStatusMeta(status);
    items.push({ id: 'current-status', type: 'status_changed', summary: `Etapa atual: ${meta.label}`, occurred_at: lead.updated_at || lastContact || lead.created_at });
  }
  if (lead.created_at) items.push({ id: 'created', type: 'imported', summary: 'Lead adicionado à base', occurred_at: lead.created_at });
  return items.sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));
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
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState('');
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionType, setInteractionType] = useState('note');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [operationError, setOperationError] = useState('');
  const touched = useRef({ status: false, notes: false });
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
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

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const refreshRelationship = useCallback(async (silent = false) => {
    if (leadId === undefined || leadId === null) return;
    if (!silent) setRelationshipLoading(true);
    setRelationshipError('');
    try {
      const [activityRes, taskRes] = await Promise.all([
        typeof api.getLeadActivities === 'function' ? api.getLeadActivities(leadId) : Promise.resolve({ success: true, data: [] }),
        typeof api.getLeadTasks === 'function' ? api.getLeadTasks(leadId) : Promise.resolve({ success: true, data: [] }),
      ]);
      if (activityRes?.success) setActivities(activityRes.data || []);
      if (taskRes?.success) setTasks(taskRes.data || []);
    } catch {
      setRelationshipError('O histórico não pôde ser atualizado agora. Os dados principais continuam disponíveis.');
    } finally {
      if (!silent) setRelationshipLoading(false);
    }
  }, [leadId]);

  useEffect(() => { refreshRelationship(); }, [refreshRelationship]);

  if (!lead) return null;

  const waUrl = getWhatsAppUrl(lead.phone);
  const emailHref = safeMailto(lead.email);
  const websiteHref = safeExternalUrl(lead.website);
  const score = leadScore(lead);
  const badge = scoreBadge(score);
  const meta = getStatusMeta(status);
  const taskApiAvailable = typeof api.createLeadTask === 'function';
  const activityApiAvailable = typeof api.createLeadActivity === 'function';
  const orderedTasks = [...tasks].sort((a, b) => {
    if ((a.status === 'completed') !== (b.status === 'completed')) return a.status === 'completed' ? 1 : -1;
    return new Date(a.due_at || '2999-12-31') - new Date(b.due_at || '2999-12-31');
  });
  const timeline = activities.length ? activities : syntheticTimeline(lead, status, lastContact);

  async function changeStatus(newStatus) {
    const prev = status;
    const prevLastContact = lastContact;
    const nextLastContact = newStatus === 'enviado' ? new Date().toISOString() : lastContact;
    touched.current.status = true;
    setOperationError('');
    setStatus(newStatus);
    if (newStatus === 'enviado') setLastContact(nextLastContact);
    try {
      await api.updateLead(lead.id, { status: newStatus });
      onUpdated?.({ ...lead, prospect_status: newStatus, last_contact_at: nextLastContact });
      setAskSent(false);
      refreshRelationship(true);
    } catch {
      setStatus(prev);
      setLastContact(prevLastContact);
      setOperationError('Não foi possível alterar a etapa. Tente novamente.');
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    setOperationError('');
    try {
      await api.updateLead(lead.id, { notes });
      onUpdated?.({ ...lead, prospect_status: status, notes });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
      refreshRelationship(true);
    } catch { setOperationError('Não foi possível salvar as anotações. O texto foi mantido para uma nova tentativa.'); }
    setSavingNotes(false);
  }

  async function deleteLead() {
    if (!window.confirm(`Apagar "${lead.name || 'este lead'}" definitivamente?`)) return;
    try {
      await api.bulkDelete([lead.id]);
      onDeleted?.(lead.id);
      onClose();
    } catch { setOperationError('Não foi possível apagar o lead. Tente novamente.'); }
  }

  async function createInteraction() {
    const summary = interactionSummary.trim();
    if (!summary) return;
    if (!activityApiAvailable) {
      setRelationshipError('O registro de interações ainda não está disponível neste banco.');
      return;
    }
    setSavingRelationship(true);
    setRelationshipError('');
    try {
      await api.createLeadActivity(lead.id, {
        type: interactionType,
        summary,
        channel: interactionType === 'note' ? null : interactionType,
      });
      setInteractionSummary('');
      await refreshRelationship(true);
    } catch {
      setRelationshipError('Não foi possível registrar a interação.');
    } finally {
      setSavingRelationship(false);
    }
  }

  async function createTask() {
    const title = taskTitle.trim();
    if (!title) return;
    if (!taskApiAvailable) {
      setRelationshipError('As tarefas ainda não estão disponíveis neste banco.');
      return;
    }
    setSavingRelationship(true);
    setRelationshipError('');
    try {
      await api.createLeadTask(lead.id, {
        title,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        priority: 'normal',
      });
      setTaskTitle('');
      setTaskDueAt('');
      await refreshRelationship(true);
    } catch {
      setRelationshipError('Não foi possível criar a próxima ação.');
    } finally {
      setSavingRelationship(false);
    }
  }

  async function toggleTask(task) {
    if (typeof api.updateLeadTask !== 'function') return;
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    setTasks(prev => prev.map(item => item.id === task.id ? { ...item, status: nextStatus } : item));
    try {
      await api.updateLeadTask(task.id, { status: nextStatus });
      refreshRelationship(true);
    } catch {
      setTasks(prev => prev.map(item => item.id === task.id ? task : item));
      setRelationshipError('Não foi possível atualizar a tarefa.');
    }
  }

  async function deleteTask(task) {
    if (typeof api.deleteLeadTask !== 'function') return;
    setTasks(prev => prev.filter(item => item.id !== task.id));
    try {
      await api.deleteLeadTask(task.id);
    } catch {
      setTasks(prev => [...prev, task]);
      setRelationshipError('Não foi possível apagar a tarefa.');
    }
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
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-dialog-title"
        aria-describedby="lead-dialog-description"
        style={{
          background: '#09090b', border: '1px solid #27272a', borderRadius: 0,
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>

        {/* Cabeçalho */}
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #18181b', position: 'sticky', top: 0, background: '#09090b', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h2 id="lead-dialog-title" style={{ fontSize: 19, fontWeight: 700, color: '#fafafa', marginBottom: 4, lineHeight: 1.3 }}>{lead.name}</h2>
              <span id="lead-dialog-description" className="sr-only">Ficha comercial, próximas ações e histórico do lead.</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {lead.category && <span style={{ fontSize: 12, color: '#a1a1aa' }}>{lead.category}</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: `${badge.color}18`, padding: '2px 8px', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <DynIcon name={badge.icon} size={11} color={badge.color} />
                  <span>{badge.label} · <span className="mono">{score}pts</span></span>
                </span>
              </div>
            </div>
            <button ref={closeButtonRef} onClick={onClose} aria-label="Fechar ficha do lead" style={{ background: 'transparent', border: 'none', color: '#52525b', fontSize: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
              <X size={18} color="#52525b" />
            </button>
          </div>

          {/* Seletor de status do funil */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(opt => {
              const active = status === opt.value;
              return (
                <button key={opt.value} onClick={() => changeStatus(opt.value)} aria-pressed={active} aria-label={`Alterar etapa para ${opt.label}`}
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

          <div aria-live="polite" aria-atomic="true">
            {operationError && (
              <div role="alert" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '9px 12px', margin: '4px 0 12px', fontSize: 12, display: 'flex', gap: 7, alignItems: 'center' }}>
                <AlertTriangle size={13} color="#ef4444" /> <span>{operationError}</span>
              </div>
            )}
          </div>

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

          {/* Próxima ação e histórico do relacionamento */}
          <div className="relationship-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <section aria-labelledby="lead-tasks-title" style={{ background: '#111113', border: '1px solid #27272a', padding: 13, minWidth: 0 }}>
              <h3 id="lead-tasks-title" style={{ color: '#fafafa', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Target size={13} color="#f59e0b" /> Próxima ação
              </h3>
              {taskApiAvailable ? (
                <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                  <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') createTask(); }}
                    aria-label="Título da próxima ação" placeholder="Ex: Ligar para confirmar reunião"
                    style={{ background: '#09090b', border: '1px solid #27272a', color: '#fafafa', padding: '8px 9px', fontSize: 12, width: '100%' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="datetime-local" value={taskDueAt} onChange={event => setTaskDueAt(event.target.value)}
                      aria-label="Data da próxima ação"
                      style={{ background: '#09090b', border: '1px solid #27272a', color: '#a1a1aa', padding: '7px 8px', fontSize: 11, minWidth: 0, flex: 1 }} />
                    <button type="button" onClick={createTask} disabled={savingRelationship || !taskTitle.trim()}
                      style={{ background: '#d97706', color: '#fff', border: 'none', padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: taskTitle.trim() ? 'pointer' : 'not-allowed', opacity: taskTitle.trim() ? 1 : 0.55 }}>
                      Criar
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#71717a', fontSize: 11, lineHeight: 1.45, margin: '9px 0 0' }}>Tarefas estarão disponíveis após aplicar a atualização do banco.</p>
              )}

              <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 170, overflowY: 'auto' }}>
                {orderedTasks.map(task => {
                  const completed = task.status === 'completed';
                  const overdue = !completed && task.due_at && new Date(task.due_at) < new Date();
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'start', gap: 7, borderTop: '1px solid #27272a', paddingTop: 7 }}>
                      <button type="button" onClick={() => toggleTask(task)} aria-label={completed ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
                        style={{ width: 20, height: 20, flexShrink: 0, background: completed ? '#10b981' : 'transparent', border: `1px solid ${completed ? '#10b981' : '#52525b'}`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {completed && <Check size={11} color="#fff" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: completed ? '#71717a' : '#e4e4e7', fontSize: 11, lineHeight: 1.35, textDecoration: completed ? 'line-through' : 'none' }}>{task.title}</div>
                        {task.due_at && <div style={{ color: overdue ? '#ef4444' : '#71717a', fontSize: 10, marginTop: 2, display: 'flex', gap: 4, alignItems: 'center' }}><Clock size={10} color="currentColor" /> {formatDateTime(task.due_at)}{overdue ? ' · atrasada' : ''}</div>}
                      </div>
                      <button type="button" onClick={() => deleteTask(task)} aria-label={`Apagar tarefa ${task.title}`} title="Apagar tarefa"
                        style={{ background: 'transparent', border: 'none', color: '#71717a', padding: 2, cursor: 'pointer' }}><Trash2 size={11} color="#71717a" /></button>
                    </div>
                  );
                })}
                {!relationshipLoading && orderedTasks.length === 0 && taskApiAvailable && <p style={{ color: '#52525b', fontSize: 11, margin: 0 }}>Nenhuma tarefa pendente.</p>}
              </div>
            </section>

            <section aria-labelledby="lead-timeline-title" style={{ background: '#111113', border: '1px solid #27272a', padding: 13, minWidth: 0 }}>
              <h3 id="lead-timeline-title" style={{ color: '#fafafa', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Activity size={13} color="#06b6d4" /> Histórico
              </h3>
              {activityApiAvailable && (
                <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 5, marginTop: 10 }}>
                  <select value={interactionType} onChange={event => setInteractionType(event.target.value)} aria-label="Tipo de interação"
                    style={{ background: '#09090b', border: '1px solid #27272a', color: '#a1a1aa', padding: '7px 6px', fontSize: 10 }}>
                    <option value="note">Nota</option><option value="call">Ligação</option><option value="email">E-mail</option><option value="meeting">Reunião</option>
                  </select>
                  <input value={interactionSummary} onChange={event => setInteractionSummary(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') createInteraction(); }}
                    aria-label="Resumo da interação" placeholder="Registrar interação..."
                    style={{ background: '#09090b', border: '1px solid #27272a', color: '#fafafa', padding: '7px 8px', fontSize: 11, minWidth: 0 }} />
                  <button type="button" onClick={createInteraction} disabled={savingRelationship || !interactionSummary.trim()} aria-label="Registrar interação"
                    style={{ background: '#0e7490', color: '#fff', border: 'none', padding: '7px 9px', fontSize: 11, fontWeight: 700, cursor: interactionSummary.trim() ? 'pointer' : 'not-allowed', opacity: interactionSummary.trim() ? 1 : 0.55 }}>+</button>
                </div>
              )}
              <div style={{ display: 'grid', gap: 7, marginTop: 10, maxHeight: 190, overflowY: 'auto' }}>
                {relationshipLoading && <p style={{ color: '#71717a', fontSize: 11, margin: 0 }}>Carregando histórico...</p>}
                {!relationshipLoading && timeline.slice(0, 12).map(item => {
                  const itemMeta = activityMeta(item.type);
                  return (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', gap: 7 }}>
                      <span style={{ width: 7, height: 7, background: itemMeta.color, marginTop: 4 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#d4d4d8', fontSize: 11, lineHeight: 1.35 }}>{item.summary || itemMeta.label}</div>
                        <div style={{ color: '#52525b', fontSize: 9, marginTop: 1 }}>{itemMeta.label} · {formatDateTime(item.occurred_at || item.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                {!relationshipLoading && timeline.length === 0 && <p style={{ color: '#52525b', fontSize: 11, margin: 0 }}>Ainda não há interações registradas.</p>}
              </div>
            </section>
          </div>

          {relationshipError && <div role="alert" style={{ color: '#fca5a5', fontSize: 11, margin: '-8px 0 14px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={11} color="#ef4444" /> {relationshipError}</div>}

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
              {notesSaved && <span role="status" style={{ fontSize: 12, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} color="#10b981" /> Salvo</span>}
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
