import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { recordAccessEvent } from '../api/superadmin';
import { isSuperAdminEmail } from '../utils/superadmin';
import { AlertTriangle, Eye, EyeOff, Lock, Shield } from './Icons';

// Tela dedicada para /superadm — login administrativo isolado do fluxo padrão.
export default function SuperAdminLogin({ onBackToPanel }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const configured = isSupabaseConfigured();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!configured || !supabase) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!isSuperAdminEmail(cleanEmail)) {
      recordAccessEvent({
        eventType: 'login_failed',
        email: cleanEmail || 'desconhecido@superadm',
        loginContext: 'superadm',
        provider: 'email',
        metadata: { reason: 'unauthorized_superadm_email' },
      });
      setError('Esta rota é exclusiva da conta Superadmin.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (authError) throw authError;

      const signedEmail = String(data?.user?.email || '').toLowerCase();
      if (!isSuperAdminEmail(signedEmail)) {
        await supabase.auth.signOut();
        setError('Conta sem permissão de Superadmin.');
        setLoading(false);
      }
      // Sucesso: o App detecta a sessão em /superadm e abre direto na aba Superadmin.
    } catch (err) {
      const rawMsg = String(err?.message || '');
      recordAccessEvent({
        eventType: 'login_failed',
        email: cleanEmail,
        loginContext: 'superadm',
        provider: 'email',
        metadata: { reason: rawMsg.slice(0, 140) },
      });
      setError(rawMsg === 'Invalid login credentials'
        ? 'Credenciais inválidas para o console Superadmin.'
        : (rawMsg || 'Falha na autenticação.'));
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, rgba(16,185,129,0.12), transparent 55%), #09090b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 430,
        background: '#111114',
        border: '1px solid #27272a',
        borderTop: '3px solid #10b981',
        padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.75)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span className="mono" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#10b981',
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            padding: '4px 10px',
          }}>
            <Shield size={13} color="#10b981" />
            CONSOLE /SUPERADM
          </span>
          <Lock size={16} color="#52525b" />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Acesso Administrativo
        </h1>
        <p style={{ fontSize: 13, color: '#a1a1aa', margin: '0 0 24px', lineHeight: 1.5 }}>
          Entre com sua conta Superadmin para auditar logs de acesso, contagem de scrapings e controle de usuários.
        </p>

        {!configured && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: 12,
            padding: 12,
            marginBottom: 18,
          }}>
            Supabase não configurado neste ambiente.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="superadm-email" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
              E-mail do Superadmin
            </label>
            <input
              id="superadm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dominio.com"
              autoComplete="username"
              disabled={loading || !configured}
              required
              style={{
                width: '100%',
                background: '#09090b',
                border: '1px solid #27272a',
                color: '#fafafa',
                padding: '11px 12px',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label htmlFor="superadm-password" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
              Senha administrativa
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="superadm-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading || !configured}
                required
                style={{
                  width: '100%',
                  background: '#09090b',
                  border: '1px solid #27272a',
                  color: '#fafafa',
                  padding: '11px 40px 11px 12px',
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#fecaca',
              fontSize: 13,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={15} color="#ef4444" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !configured}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: (loading || !configured) ? 'not-allowed' : 'pointer',
              opacity: (loading || !configured) ? 0.6 : 1,
              marginTop: 4,
            }}
          >
            {loading ? 'Validando acesso…' : 'Entrar no Console Superadmin'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: '#52525b' }}>Acesso monitorado em log</span>
          <button
            type="button"
            onClick={onBackToPanel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: 0,
              fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            Voltar ao painel normal
          </button>
        </div>
      </div>
    </div>
  );
}
