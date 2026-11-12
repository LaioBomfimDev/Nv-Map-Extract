// ============================================================================
// Vercel Serverless Function — Administração de contas com SERVICE_ROLE_KEY.
// Autentica o chamador via JWT do Supabase e exige laiobomfimdev@gmail.com
// ativo com role = 'superadmin'. Nunca expõe a service_role no frontend.
// ============================================================================

const SUPERADMIN_EMAIL = 'laiobomfimdev@gmail.com';

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

async function supabaseAdminRequest(supabaseUrl, serviceRoleKey, path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data, raw: text };
}

async function verifySuperadminCaller(req, supabaseUrl, serviceRoleKey) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, error: 'Token de autenticação ausente.' };

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userRes.ok) {
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
  }

  const user = await userRes.json();
  const email = String(user?.email || '').toLowerCase();
  if (!user?.id || email !== SUPERADMIN_EMAIL) {
    return { ok: false, status: 403, error: 'Acesso restrito ao superadmin.' };
  }

  const profileRes = await supabaseAdminRequest(
    supabaseUrl,
    serviceRoleKey,
    `/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role,is_active`
  );
  if (profileRes.ok && Array.isArray(profileRes.data) && profileRes.data[0]) {
    const profile = profileRes.data[0];
    if (profile.is_active === false || profile.role !== 'superadmin') {
      return { ok: false, status: 403, error: 'Perfil sem permissão administrativa ativa.' };
    }
  }

  return { ok: true, user };
}

async function insertAuditLog(supabaseUrl, serviceRoleKey, req, entry) {
  try {
    await supabaseAdminRequest(supabaseUrl, serviceRoleKey, '/rest/v1/access_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: entry.userId || null,
        email: String(entry.email || '').toLowerCase(),
        event_type: entry.eventType,
        login_context: 'superadm',
        provider: 'system',
        ip_address: getClientIp(req),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 400),
        path: '/superadm',
        metadata: entry.metadata || {},
      }),
    });
  } catch (_) {
    // Log de auditoria nunca deve derrubar a resposta administrativa se a tabela ainda não existir.
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { supabaseUrl, serviceRoleKey } = getConfig();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(supabaseUrl && serviceRoleKey),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      ok: false,
      code: 'MISSING_SERVICE_ROLE',
      error: 'Configure SUPABASE_SERVICE_ROLE_KEY nas Environment Variables da Vercel.',
    });
  }

  const authCheck = await verifySuperadminCaller(req, supabaseUrl, serviceRoleKey);
  if (!authCheck.ok) {
    return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
  }

  const body = parseBody(req);
  const action = String(body.action || '').trim();

  if (action === 'createUser') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim().slice(0, 120);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Informe um e-mail válido.' });
    }
    if (email === SUPERADMIN_EMAIL) {
      return res.status(400).json({ ok: false, error: 'A conta superadmin principal já está reservada.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'A senha inicial deve ter no mínimo 6 caracteres.' });
    }

    const created = await supabaseAdminRequest(supabaseUrl, serviceRoleKey, '/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });

    if (!created.ok || !created.data?.id) {
      const msg = created.data?.msg || created.data?.message || created.data?.error_description || 'Não foi possível criar o usuário.';
      return res.status(created.status || 400).json({ ok: false, error: msg });
    }

    const newUserId = created.data.id;
    await supabaseAdminRequest(supabaseUrl, serviceRoleKey, '/rest/v1/user_profiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: newUserId,
        email,
        full_name: fullName,
        role: 'user',
        is_active: true,
        updated_at: new Date().toISOString(),
      }),
    });

    await insertAuditLog(supabaseUrl, serviceRoleKey, req, {
      userId: newUserId,
      email,
      eventType: 'admin_user_created',
      metadata: { actor: authCheck.user.email, full_name: fullName },
    });

    return res.status(200).json({ ok: true, user: { id: newUserId, email, full_name: fullName } });
  }

  const userId = String(body.userId || '').trim();
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'userId é obrigatório.' });
  }

  const targetRes = await supabaseAdminRequest(
    supabaseUrl,
    serviceRoleKey,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`
  );
  if (!targetRes.ok || !targetRes.data?.id) {
    return res.status(404).json({ ok: false, error: 'Usuário não encontrado no Supabase Auth.' });
  }
  const targetEmail = String(targetRes.data.email || '').toLowerCase();

  if (action === 'resetPassword') {
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    const updated = await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ password: newPassword }),
      }
    );
    if (!updated.ok) {
      const msg = updated.data?.msg || updated.data?.message || 'Erro ao redefinir a senha.';
      return res.status(updated.status || 400).json({ ok: false, error: msg });
    }

    await insertAuditLog(supabaseUrl, serviceRoleKey, req, {
      userId,
      email: targetEmail,
      eventType: 'admin_password_reset',
      metadata: { actor: authCheck.user.email },
    });

    return res.status(200).json({ ok: true });
  }

  if (action === 'toggleActive') {
    if (targetEmail === SUPERADMIN_EMAIL) {
      return res.status(400).json({ ok: false, error: 'Não é permitido bloquear o superadmin principal.' });
    }

    const isActive = Boolean(body.isActive);
    const reason = isActive ? '' : String(body.reason || '').trim().slice(0, 240);

    const banRes = await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ ban_duration: isActive ? 'none' : '876000h' }),
      }
    );
    if (!banRes.ok) {
      const msg = banRes.data?.msg || banRes.data?.message || 'Erro ao atualizar status no Auth.';
      return res.status(banRes.status || 400).json({ ok: false, error: msg });
    }

    await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          is_active: isActive,
          blocked_reason: reason,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    await insertAuditLog(supabaseUrl, serviceRoleKey, req, {
      userId,
      email: targetEmail,
      eventType: 'admin_user_updated',
      metadata: { actor: authCheck.user.email, is_active: isActive, blocked_reason: reason },
    });

    return res.status(200).json({ ok: true, is_active: isActive });
  }

  if (action === 'updateUserName') {
    const fullName = String(body.fullName || '').trim().slice(0, 120);
    const metaRes = await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          user_metadata: { ...(targetRes.data.user_metadata || {}), full_name: fullName },
        }),
      }
    );
    if (!metaRes.ok) {
      return res.status(metaRes.status || 400).json({ ok: false, error: 'Erro ao atualizar nome do usuário.' });
    }

    await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ full_name: fullName, updated_at: new Date().toISOString() }),
      }
    );

    await insertAuditLog(supabaseUrl, serviceRoleKey, req, {
      userId,
      email: targetEmail,
      eventType: 'admin_user_updated',
      metadata: { actor: authCheck.user.email, full_name: fullName },
    });

    return res.status(200).json({ ok: true, full_name: fullName });
  }

  if (action === 'deleteUser') {
    if (targetEmail === SUPERADMIN_EMAIL) {
      return res.status(400).json({ ok: false, error: 'Não é permitido excluir o superadmin principal.' });
    }

    await insertAuditLog(supabaseUrl, serviceRoleKey, req, {
      userId,
      email: targetEmail,
      eventType: 'admin_user_deleted',
      metadata: { actor: authCheck.user.email },
    });

    const delRes = await supabaseAdminRequest(
      supabaseUrl,
      serviceRoleKey,
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    if (!delRes.ok) {
      const msg = delRes.data?.msg || delRes.data?.message || 'Erro ao excluir usuário.';
      return res.status(delRes.status || 400).json({ ok: false, error: msg });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: 'Ação administrativa inválida.' });
};
