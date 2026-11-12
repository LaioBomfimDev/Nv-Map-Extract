// ============================================================================
// Vercel Serverless Function — Registro de logs de acesso (com IP real).
// Captura eventos autenticados (via JWT) e tentativas falhas (login_failed).
// ============================================================================

const AUTHENTICATED_EVENTS = new Set([
  'login_success',
  'logout',
  'password_changed',
  'blocked_login_attempt',
  'profile_updated',
]);

function getConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { supabaseUrl, serviceRoleKey };
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim().slice(0, 120);
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().slice(0, 120);
  return String(req.socket?.remoteAddress || '').slice(0, 120);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (_) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const { supabaseUrl, serviceRoleKey } = getConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    // Sem service_role configurada, o frontend usa a RPC record_access_event como fallback.
    return res.status(200).json({ ok: false, skipped: true, reason: 'not_configured' });
  }

  const body = parseBody(req);
  const eventType = String(body.eventType || '').trim();
  const loginContext = String(body.loginContext || 'panel').trim().slice(0, 40) || 'panel';
  const provider = String(body.provider || 'email').trim().slice(0, 40) || 'email';
  const path = String(body.path || '').trim().slice(0, 200);
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const ipAddress = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || body.userAgent || '').slice(0, 400);

  let userId = null;
  let email = '';

  if (eventType === 'login_failed') {
    email = String(body.email || '').trim().toLowerCase().slice(0, 180);
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido para log de falha.' });
    }
  } else if (AUTHENTICATED_EVENTS.has(eventType)) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Token ausente.' });
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    const user = await userRes.json();
    userId = user?.id || null;
    email = String(user?.email || '').toLowerCase();
    if (!userId || !email) {
      return res.status(401).json({ ok: false, error: 'Usuário inválido.' });
    }
  } else {
    return res.status(400).json({ ok: false, error: 'Evento inválido.' });
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/access_logs`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      email,
      event_type: eventType,
      login_context: loginContext,
      provider,
      ip_address: ipAddress,
      user_agent: userAgent,
      path,
      metadata,
    }),
  });

  if (!insertRes.ok) {
    return res.status(200).json({ ok: false, skipped: true, status: insertRes.status });
  }

  if (userId) {
    const patch = {
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (eventType === 'login_success') {
      patch.last_login_at = patch.last_seen_at;
    }
    await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true });
};
