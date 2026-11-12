import React, { useEffect, useState } from 'react';
import { changeOwnPassword, updateMyDisplayName } from '../api/superadmin';
import { AlertTriangle, CheckCircle, Eye, EyeOff, KeyRound, Shield, User, X } from './Icons';

// Modal "Minha Conta / Alterar Senha" acessível para qualquer usuário autenticado.
export default function AccountModal({
  open,
  onClose,
  session,
  profile,
  recoveryMode = false,
  onProfileUpdated,
}) {
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const email = session?.user?.email || profile?.email || '';
  const providers = session?.user?.app_metadata?.providers || [];
  const hasEmailProvider = providers.includes('email');
  const requireCurrent = hasEmailProvider && !recoveryMode;

  useEffect(() => {
    if (!open) return;
    setFullName(profile?.full_name || session?.user?.user_metadata?.full_name || '');
    setNameMsg('');
    setPwError('');
    setPwSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [open, profile, session]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSaveName(e) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg('');
    try {
      const updated = await updateMyDisplayName(fullName);
      onProfileUpdated?.(updated);
      setNameMsg('Nome atualizado.');
    } catch (err) {
      setNameMsg(err?.message || 'Erro ao atualizar nome.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword.length < 6) {
      setPwError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('A confirmação da nova senha não confere.');
      return;
    }

    setSavingPassword(true);
    try {
      await changeOwnPassword({
        email,
        currentPassword,
        newPassword,
        requireCurrent,
      });
      setPwSuccess('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err?.message || 'Não foi possível alterar a senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#09090b',
    border: '1px solid #27272a',
    color: '#fafafa',
    padding: '10px 12px',
    fontSize: 13,
  };

  const isSuperAdmin = profile?.role === 'superadmin';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#18181b',
          border: '1px solid #27272a',
          padding: 24,
          boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={18} color="#10b981" />
            <h2 id="account-modal-title" style={{ fontSize: 17, fontWeight: 700, color: '#fafafa', margin: 0 }}>
              {recoveryMode ? 'Definir Nova Senha' : 'Minha Conta & Segurança'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal da conta"
            style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', padding: 5, cursor: 'pointer', display: 'inline-flex' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Resumo da conta */}
        <div style={{ background: '#09090b', border: '1px solid #27272a', padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conta conectada</div>
              <div className="mono" style={{ fontSize: 13, color: '#fafafa', marginTop: 2 }}>{email}</div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              color: isSuperAdmin ? '#10b981' : '#a1a1aa',
              background: isSuperAdmin ? 'rgba(16,185,129,0.12)' : 'rgba(161,161,170,0.12)',
              border: `1px solid ${isSuperAdmin ? 'rgba(16,185,129,0.35)' : '#27272a'}`,
            }}>
              {isSuperAdmin && <Shield size={12} color="#10b981" />}
              {isSuperAdmin ? 'SUPERADMIN' : 'USUÁRIO'}
            </span>
          </div>
        </div>

        {/* Editar nome */}
        {!recoveryMode && (
          <form onSubmit={handleSaveName} style={{ marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid #27272a' }}>
            <label htmlFor="account-fullname" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
              Nome de identificação
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="account-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="submit"
                disabled={savingName}
                style={{
                  background: '#27272a',
                  color: '#fafafa',
                  border: '1px solid #3f3f46',
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: savingName ? 'not-allowed' : 'pointer',
                }}
              >
                {savingName ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
            {nameMsg && <p style={{ fontSize: 12, color: '#10b981', marginTop: 6 }}>{nameMsg}</p>}
          </form>
        )}

        {/* Alterar senha */}
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fafafa', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <KeyRound size={15} color="#10b981" />
              {requireCurrent ? 'Alterar minha senha' : 'Definir / alterar senha de acesso'}
            </span>
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => !prev)}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPasswords ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {requireCurrent && (
            <div>
              <label htmlFor="account-current-pw" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>
                Senha atual
              </label>
              <input
                id="account-current-pw"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Digite sua senha atual"
                style={inputStyle}
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="account-new-pw" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>
              Nova senha (mínimo 6 caracteres)
            </label>
            <input
              id="account-new-pw"
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Nova senha"
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label htmlFor="account-confirm-pw" style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>
              Confirmar nova senha
            </label>
            <input
              id="account-confirm-pw"
              type={showPasswords ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              style={inputStyle}
              required
            />
          </div>

          {pwError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fecaca', padding: '9px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color="#ef4444" />
              <span>{pwError}</span>
            </div>
          )}

          {pwSuccess && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: '#a7f3d0', padding: '9px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} color="#10b981" />
              <span>{pwSuccess}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: savingPassword ? 'not-allowed' : 'pointer',
              opacity: savingPassword ? 0.6 : 1,
              marginTop: 4,
            }}
          >
            {savingPassword ? 'Atualizando senha…' : 'Atualizar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
