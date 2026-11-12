import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { recordAccessEvent } from '../api/superadmin';
import { Eye, EyeOff } from './Icons';

// Tela / Modal de entrada — login por email/senha + opção Google + recuperação de senha.
export default function LoginScreen({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!onClose) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  async function loginSenha(e) {
    e.preventDefault();
    if (!configured || !supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (authError) throw authError;
      // Sucesso: o onAuthStateChange no App registra o acesso e carrega o painel.
    } catch (err) {
      const rawMsg = String(err?.message || '');
      recordAccessEvent({
        eventType: 'login_failed',
        email: cleanEmail,
        loginContext: 'panel',
        provider: 'email',
        metadata: { reason: rawMsg.slice(0, 140) },
      });

      if (/banned/i.test(rawMsg)) {
        setError('Esta conta foi desativada pelo administrador.');
      } else if (rawMsg === 'Invalid login credentials') {
        setError('Email ou senha incorretos.');
      } else {
        setError(rawMsg || 'Falha ao entrar.');
      }
      setLoading(false);
    }
  }

  async function enviarRecuperacao(e) {
    e.preventDefault();
    if (!configured || !supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Informe o e-mail da conta.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setInfo('Se o e-mail existir, enviamos um link para redefinir sua senha.');
    } catch (err) {
      setError(err?.message || 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setLoading(false);
    }
  }

  async function loginGoogle() {
    if (!configured || !supabase) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message || 'Falha ao iniciar o login com Google.');
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#09090b',
    border: '1px solid #27272a',
    color: '#fafafa',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    marginBottom: 12,
  };

  const wrapperStyle = onClose
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }
    : {
        minHeight: '100vh',
        background: '#09090b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      };

  return (
    <div style={wrapperStyle} onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}>
      <div
        role={onClose ? 'dialog' : undefined}
        aria-modal={onClose ? 'true' : undefined}
        aria-labelledby="login-dialog-title"
        style={{
          position: 'relative',
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: 10,
          padding: '36px 32px',
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar login"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid #27272a',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}

        <img
          src="/logo-miner.jpg"
          alt="Friendly Miner"
          style={{
            width: 52,
            height: 52,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid #27272a',
            marginBottom: 18,
          }}
        />
        <h2 id="login-dialog-title" style={{ fontSize: 21, fontWeight: 700, color: '#fafafa', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {recoveryMode ? 'Recuperar senha' : 'Acessar Friendly Miner'}
        </h2>
        <p style={{ fontSize: 13, color: '#a1a1aa', margin: '0 0 24px' }}>
          {recoveryMode
            ? 'Enviaremos um link de redefinição para seu e-mail'
            : 'Entre para gerenciar seus leads na nuvem'}
        </p>

        {!configured && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12, padding: 12, marginBottom: 20, textAlign: 'left', borderRadius: 6 }}>
            Supabase não configurado. Defina <code>REACT_APP_SUPABASE_URL</code> e
            <code> REACT_APP_SUPABASE_ANON_KEY</code> nas variáveis de ambiente.
          </div>
        )}

        {!recoveryMode && (
          <>
            <button
              onClick={loginGoogle}
              disabled={loading || !configured}
              type="button"
              style={{
                width: '100%',
                background: '#fafafa',
                color: '#09090b',
                border: 'none',
                padding: '11px 16px',
                borderRadius: 6,
                cursor: (loading || !configured) ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: (loading || !configured) ? 0.6 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {loading ? 'Redirecionando...' : 'Entrar com Google'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#27272a' }} />
              <span style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ou email</span>
              <div style={{ flex: 1, height: 1, background: '#27272a' }} />
            </div>
          </>
        )}

        <form onSubmit={recoveryMode ? enviarRecuperacao : loginSenha}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="username"
            style={inputStyle}
            disabled={loading || !configured}
            required
          />
          {!recoveryMode && (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="sua senha"
                autoComplete="current-password"
                style={{ ...inputStyle, marginBottom: 0, paddingRight: 40 }}
                disabled={loading || !configured}
                required
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
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !configured}
            style={{
              width: '100%',
              background: '#18181b',
              color: '#fafafa',
              border: '1px solid #27272a',
              padding: '10px 16px',
              borderRadius: 6,
              cursor: (loading || !configured) ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              opacity: (loading || !configured) ? 0.6 : 1,
            }}
          >
            {loading
              ? (recoveryMode ? 'Enviando...' : 'Entrando...')
              : (recoveryMode ? 'Enviar link de recuperação' : 'Entrar com Email')}
          </button>
        </form>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => { setRecoveryMode((prev) => !prev); setError(''); setInfo(''); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {recoveryMode ? 'Voltar para o login' : 'Esqueci minha senha'}
          </button>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 14 }}>{error}</p>}
        {info && <p style={{ color: '#10b981', fontSize: 13, marginTop: 14 }}>{info}</p>}

        <p style={{ color: '#71717a', fontSize: 11, marginTop: 18, lineHeight: 1.5 }}>
          Sua extensão conecta automaticamente assim que você entra aqui.
        </p>
      </div>
    </div>
  );
}
