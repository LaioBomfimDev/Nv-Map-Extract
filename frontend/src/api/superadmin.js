import { supabase } from '../supabaseClient';
import { isMissingMigrationError, isSuperAdminEmail } from '../utils/superadmin';

async function getAccessToken() {
  if (!supabase) return '';
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
}

async function callServerlessSuperadmin(payload) {
  const token = await getAccessToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const res = await fetch('/api/superadmin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (res.status === 404 && !json) {
    const err = new Error('Endpoint /api/superadmin indisponível neste ambiente local. Use o deploy da Vercel ou vercel dev.');
    err.code = 'SERVERLESS_UNAVAILABLE';
    throw err;
  }

  if (!res.ok || !json?.ok) {
    const err = new Error(json?.error || `Erro HTTP ${res.status} na operação administrativa.`);
    err.code = json?.code || '';
    throw err;
  }

  return json;
}

export async function getMyProfile(session = null) {
  if (!supabase) return { data: null, migrationReady: false };

  const { data, error } = await supabase.rpc('get_my_profile');
  if (!error && data) {
    return { data, migrationReady: true };
  }

  if (isMissingMigrationError(error)) {
    const email = session?.user?.email || '';
    return {
      migrationReady: false,
      data: {
        id: session?.user?.id || '',
        email,
        full_name: session?.user?.user_metadata?.full_name || '',
        role: isSuperAdminEmail(email) ? 'superadmin' : 'user',
        is_active: true,
        blocked_reason: '',
      },
    };
  }

  throw error;
}

export async function updateMyDisplayName(fullName) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const cleanName = String(fullName || '').trim().slice(0, 120);

  await supabase.auth.updateUser({ data: { full_name: cleanName } });

  const { data, error } = await supabase.rpc('update_my_profile', { p_full_name: cleanName });
  if (error && !isMissingMigrationError(error)) throw error;
  return data || { full_name: cleanName };
}

export async function changeOwnPassword({ email, currentPassword, newPassword, requireCurrent = false }) {
  if (!supabase) throw new Error('Supabase não configurado.');
  if (String(newPassword || '').length < 6) {
    throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
  }

  if (requireCurrent) {
    if (!currentPassword) {
      throw new Error('Informe sua senha atual para confirmar a alteração.');
    }
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: currentPassword,
    });
    if (verifyError) {
      throw new Error('A senha atual está incorreta.');
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  await recordAccessEvent({
    eventType: 'password_changed',
    loginContext: 'panel',
    provider: 'email',
  });

  return { ok: true };
}

export async function recordAccessEvent({
  eventType,
  email = '',
  loginContext = 'panel',
  provider = 'email',
  path = typeof window !== 'undefined' ? window.location.pathname : '',
  metadata = {},
} = {}) {
  if (!supabase || !eventType) return { ok: false };

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const token = eventType === 'login_failed' ? '' : await getAccessToken();

  // Tenta primeiro a função serverless (captura IP real e também grava login_failed).
  try {
    const res = await fetch('/api/access-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        eventType,
        email,
        loginContext,
        provider,
        path,
        userAgent,
        metadata,
      }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.ok) return { ok: true };
    }
  } catch (_) {
    // Fallback para RPC direta abaixo.
  }

  if (eventType === 'login_failed' || !token) return { ok: false };

  try {
    const { error } = await supabase.rpc('record_access_event', {
      p_event_type: eventType,
      p_login_context: loginContext,
      p_provider: provider,
      p_path: path,
      p_user_agent: userAgent,
      p_metadata: metadata,
    });
    return { ok: !error };
  } catch (_) {
    return { ok: false };
  }
}

export const superadminApi = {
  getServiceStatus: async () => {
    try {
      const res = await fetch('/api/superadmin', { method: 'GET' });
      if (!res.ok) return { configured: false, available: false };
      const json = await res.json();
      return { configured: Boolean(json?.configured), available: true };
    } catch (_) {
      return { configured: false, available: false };
    }
  },

  getOverview: async (days = 30) => {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('admin_get_overview', { p_days: days });
    if (error) throw error;
    return data;
  },

  getDailyScrapings: async (days = 14, userId = null) => {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('admin_get_daily_scrapings', {
      p_days: days,
      p_user_id: userId || null,
    });
    if (error) throw error;
    return data || [];
  },

  getAccessLogs: async ({ limit = 150, userId = null, eventType = '', search = '' } = {}) => {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('admin_get_access_logs', {
      p_limit: limit,
      p_user_id: userId || null,
      p_event_type: eventType || null,
      p_search: search || null,
    });
    if (error) throw error;
    return data || [];
  },

  createUser: ({ email, password, fullName }) =>
    callServerlessSuperadmin({ action: 'createUser', email, password, fullName }),

  resetUserPassword: ({ userId, newPassword }) =>
    callServerlessSuperadmin({ action: 'resetPassword', userId, newPassword }),

  updateUserName: ({ userId, fullName }) =>
    callServerlessSuperadmin({ action: 'updateUserName', userId, fullName }),

  deleteUser: ({ userId }) =>
    callServerlessSuperadmin({ action: 'deleteUser', userId }),

  toggleUserActive: async ({ userId, isActive, reason = '' }) => {
    try {
      return await callServerlessSuperadmin({ action: 'toggleActive', userId, isActive, reason });
    } catch (err) {
      // Se a service_role ainda não estiver configurada, permite bloquear/liberar via RPC no user_profiles.
      if (['MISSING_SERVICE_ROLE', 'SERVERLESS_UNAVAILABLE'].includes(err?.code)) {
        const { data, error } = await supabase.rpc('admin_toggle_user_status', {
          p_target_user_id: userId,
          p_is_active: isActive,
          p_reason: reason,
        });
        if (error) throw error;
        return { ok: true, profile: data, localProfileOnly: true };
      }
      throw err;
    }
  },
};
