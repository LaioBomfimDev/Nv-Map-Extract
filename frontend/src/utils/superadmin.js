export const SUPERADMIN_EMAIL = 'laiobomfimdev@gmail.com';

export function isSuperAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === SUPERADMIN_EMAIL;
}

export function isSuperAdminSession(session, profile = null) {
  const email = session?.user?.email;
  if (!isSuperAdminEmail(email)) return false;
  if (!profile) return true;
  return profile.role === 'superadmin' && profile.is_active !== false;
}

export function normalizePathname(pathname) {
  const raw = String(pathname || '/').trim();
  if (!raw || raw === '/') return '/';
  const collapsed = raw.replace(/\/+$/, '');
  return collapsed || '/';
}

export function isSuperAdmRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const normalized = normalizePathname(pathname);
  return normalized === '/superadm' || normalized.startsWith('/superadm/');
}

export function isMissingMigrationError(error) {
  const code = String(error?.code || '');
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true;
  const msg = String(error?.message || '');
  return /could not find the function|does not exist|schema cache/i.test(msg);
}

export function formatDateTimeBR(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch (_) {
    return date.toLocaleString('pt-BR');
  }
}

export function formatDayBR(value) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = String(value).split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch (_) {
    return date.toLocaleDateString('pt-BR');
  }
}

export function formatUserAgent(ua) {
  const raw = String(ua || '').trim();
  if (!raw) return '—';

  let browser = 'Navegador';
  if (/Edg\//i.test(raw)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(raw)) browser = 'Opera';
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = 'Chrome';
  else if (/Firefox\//i.test(raw)) browser = 'Firefox';
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = 'Safari';

  let os = 'Desktop';
  if (/Android/i.test(raw)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(raw)) os = 'iOS';
  else if (/Windows/i.test(raw)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(raw)) os = 'macOS';
  else if (/Linux/i.test(raw)) os = 'Linux';

  return `${browser} · ${os}`;
}

export const EVENT_META = {
  login_success: { label: 'Login OK', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  login_failed: { label: 'Falha no login', color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  logout: { label: 'Logout', color: '#a1a1aa', bg: 'rgba(161,161,170,0.12)' },
  password_changed: { label: 'Senha alterada', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  blocked_login_attempt: { label: 'Acesso bloqueado', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
  profile_updated: { label: 'Perfil atualizado', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  admin_user_created: { label: 'Conta criada (ADM)', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  admin_user_updated: { label: 'Conta alterada (ADM)', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
  admin_password_reset: { label: 'Senha redefinida (ADM)', color: '#06b6d4', bg: 'rgba(6,182,212,0.14)' },
  admin_user_deleted: { label: 'Conta removida (ADM)', color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
};
