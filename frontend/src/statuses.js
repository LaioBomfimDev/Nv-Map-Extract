// Funil de prospecção compartilhado por toda a aplicação
// icon: nome do componente em Icons.js para renderização via <DynIcon name={icon} />
export const STATUS_OPTIONS = [
  { value: 'novo',       label: 'Novo',             icon: 'CircleDot',     color: '#10b981' },
  { value: 'fila',       label: 'Na fila',          icon: 'Pin',           color: '#f59e0b' },
  { value: 'enviado',    label: 'Mensagem enviada', icon: 'Send',          color: '#8b5cf6' },
  { value: 'respondeu',  label: 'Respondeu',        icon: 'MessageCircle', color: '#22c55e' },
  { value: 'fechado',    label: 'Cliente fechado',  icon: 'Trophy',        color: '#eab308' },
  { value: 'descartado', label: 'Descartado',       icon: 'XCircle',       color: '#ef4444' },
];

export const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

export function getStatusMeta(value) {
  return STATUS_MAP[value] || STATUS_MAP.novo;
}

export function getWhatsAppUrl(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length < 8) return null;
  const withDDI = clean.startsWith('55') ? clean : '55' + clean;
  return `https://wa.me/${withDDI}`;
}

// Score simples de qualidade do lead (0 a 100)
export function leadScore(lead) {
  let score = 0;
  if (lead.phone) score += 35;
  if (lead.email) score += 25;
  if (lead.website) score += 15;
  if (lead.instagram || lead.facebook || lead.linkedin) score += 10;
  if (lead.rating >= 4) score += 10;
  if (lead.reviews_count >= 10) score += 5;
  return score;
}

export function scoreBadge(score) {
  if (score >= 70) return { label: 'Lead quente', icon: 'Flame',     color: '#ef4444' };
  if (score >= 45) return { label: 'Lead morno',  icon: 'Sun',       color: '#f59e0b' };
  return                  { label: 'Lead frio',   icon: 'Snowflake', color: '#52525b' };
}

export function timeSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}
