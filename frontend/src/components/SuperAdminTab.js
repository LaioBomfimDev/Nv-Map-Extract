import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { superadminApi } from '../api/superadmin';
import {
  EVENT_META,
  SUPERADMIN_EMAIL,
  formatDateTimeBR,
  formatDayBR,
  formatUserAgent,
  isMissingMigrationError,
  isSuperAdminEmail,
} from '../utils/superadmin';
import {
  Activity,
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle,
  Download,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
  UserPlus,
  Users,
} from './Icons';

const cardStyle = {
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 0,
  padding: 20,
};

const inputStyle = {
  background: '#09090b',
  border: '1px solid #27272a',
  color: '#fafafa',
  padding: '9px 12px',
  fontSize: 13,
  borderRadius: 0,
};

function ActionBtn({ children, onClick, disabled = false, danger = false, accent = false, title, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: accent ? 'rgba(16,185,129,0.14)' : danger ? 'rgba(239,68,68,0.12)' : 'transparent',
        border: `1px solid ${accent ? 'rgba(16,185,129,0.4)' : danger ? 'rgba(239,68,68,0.35)' : '#27272a'}`,
        color: accent ? '#10b981' : danger ? '#fca5a5' : '#d4d4d8',
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {children}
    </button>
  );
}

function exportLogsCsv(rows) {
  const cols = ['created_at', 'event_type', 'email', 'full_name', 'login_context', 'provider', 'ip_address', 'user_agent', 'path'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(','), ...rows.map((row) => cols.map((c) => esc(row[c])).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `access_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SuperAdminTab() {
  const [subTab, setSubTab] = useState('users');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState({ configured: true, available: true });

  const [overview, setOverview] = useState(null);
  const [dailyRows, setDailyRows] = useState([]);
  const [logs, setLogs] = useState([]);

  // Filtros
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [minDayScrapings, setMinDayScrapings] = useState('0');
  const [logEventFilter, setLogEventFilter] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // Feedback e modais operacionais
  const [actionMsg, setActionMsg] = useState({ type: '', text: '' });
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState('');

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError('');
      setMigrationMissing(false);

      const [ov, daily, logList, svc] = await Promise.all([
        superadminApi.getOverview(days),
        superadminApi.getDailyScrapings(days, selectedUserId || null),
        superadminApi.getAccessLogs({
          limit: 200,
          userId: selectedUserId || null,
          eventType: logEventFilter,
          search: logSearch,
        }),
        superadminApi.getServiceStatus(),
      ]);

      setOverview(ov);
      setDailyRows(Array.isArray(daily) ? daily : []);
      setLogs(Array.isArray(logList) ? logList : []);
      setServiceStatus(svc);
    } catch (err) {
      if (isMissingMigrationError(err)) {
        setMigrationMissing(true);
      } else {
        setError(err?.message || 'Erro ao carregar dados administrativos.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, selectedUserId, logEventFilter, logSearch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const users = useMemo(() => overview?.users || [], [overview]);
  const summary = useMemo(() => overview?.summary || {}, [overview]);
  const dailySeries = useMemo(() => overview?.dailySeries || [], [overview]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userStatusFilter === 'active' && !u.is_active) return false;
      if (userStatusFilter === 'blocked' && u.is_active) return false;
      if (!q) return true;
      return String(u.email || '').toLowerCase().includes(q)
        || String(u.full_name || '').toLowerCase().includes(q);
    });
  }, [users, userSearch, userStatusFilter]);

  const filteredDailyRows = useMemo(() => {
    const min = Number(minDayScrapings) || 0;
    return dailyRows.filter((row) => Number(row.scrapings_count || 0) >= min);
  }, [dailyRows, minDayScrapings]);

  const maxChartScrapings = useMemo(() => {
    return dailySeries.reduce((acc, item) => Math.max(acc, Number(item.scrapings || 0)), 0) || 1;
  }, [dailySeries]);

  function notify(type, text) {
    setActionMsg({ type, text });
    setTimeout(() => {
      setActionMsg((curr) => (curr.text === text ? { type: '', text: '' } : curr));
    }, 6000);
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await superadminApi.createUser({
        email: newEmail.trim().toLowerCase(),
        fullName: newName.trim(),
        password: newPassword,
      });
      setShowCreateUser(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      notify('success', 'Usuário criado com sucesso.');
      await loadAll({ silent: true });
    } catch (err) {
      notify('error', err?.message || 'Falha ao criar usuário.');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      await superadminApi.resetUserPassword({
        userId: resetTarget.id,
        newPassword: resetPwValue,
      });
      setResetTarget(null);
      setResetPwValue('');
      notify('success', `Senha redefinida para ${resetTarget.email}.`);
      await loadAll({ silent: true });
    } catch (err) {
      notify('error', err?.message || 'Erro ao redefinir senha.');
    } finally {
      setResetBusy(false);
    }
  }

  async function handleToggleUser(user) {
    const nextActive = !user.is_active;
    let reason = '';
    if (!nextActive) {
      const answer = window.prompt(`Motivo opcional para bloquear ${user.email}:`, '');
      if (answer === null) return;
      reason = answer;
    }

    setBusyUserId(user.id);
    try {
      await superadminApi.toggleUserActive({
        userId: user.id,
        isActive: nextActive,
        reason,
      });
      notify('success', nextActive ? `Conta ${user.email} reativada.` : `Conta ${user.email} bloqueada.`);
      await loadAll({ silent: true });
    } catch (err) {
      notify('error', err?.message || 'Erro ao atualizar status da conta.');
    } finally {
      setBusyUserId('');
    }
  }

  async function handleDeleteUser(user) {
    const confirmed = window.confirm(
      `Excluir definitivamente a conta ${user.email}? Todos os leads e buscas vinculados serão removidos.`
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    try {
      await superadminApi.deleteUser({ userId: user.id });
      notify('success', `Conta ${user.email} excluída.`);
      if (selectedUserId === user.id) setSelectedUserId('');
      await loadAll({ silent: true });
    } catch (err) {
      notify('error', err?.message || 'Erro ao excluir usuário.');
    } finally {
      setBusyUserId('');
    }
  }

  if (migrationMissing) {
    return (
      <div style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <AlertTriangle size={20} color="#f59e0b" />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', margin: 0 }}>
            Falta executar a migration do Superadmin no Supabase
          </h2>
        </div>
        <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          Abra o <strong>SQL Editor</strong> no painel do Supabase e execute o arquivo{' '}
          <code className="mono" style={{ color: '#10b981' }}>supabase/migration_superadmin.sql</code>.
          Ele cria as tabelas <code className="mono">user_profiles</code> e <code className="mono">access_logs</code>,
          libera o acesso exclusivo para <code className="mono">{SUPERADMIN_EMAIL}</code> e ativa as contagens de scraping.
        </p>
        <ActionBtn accent onClick={() => loadAll()}>
          <RefreshCw size={14} /> Verificar novamente
        </ActionBtn>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Cabeçalho Superadmin */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Shield size={18} color="#10b981" />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fafafa', margin: 0 }}>
              Painel Superadmin
            </h2>
            <span className="mono" style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              {SUPERADMIN_EMAIL}
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>
            Auditoria de acessos, volume diário de scrapings por conta e gestão de usuários.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            aria-label="Período de análise"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={inputStyle}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>

          <ActionBtn onClick={() => loadAll({ silent: true })} disabled={refreshing}>
            <RefreshCw size={14} /> {refreshing ? 'Atualizando…' : 'Atualizar'}
          </ActionBtn>

          <ActionBtn accent onClick={() => setShowCreateUser((prev) => !prev)}>
            <UserPlus size={14} /> Novo usuário
          </ActionBtn>
        </div>
      </div>

      {/* Aviso SERVICE_ROLE_KEY */}
      {(!serviceStatus.configured || !serviceStatus.available) && (
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.35)',
          color: '#fde68a',
          padding: '12px 16px',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          <strong>Modo somente leitura para Auth Admin:</strong> para criar contas, redefinir senhas de terceiros ou excluir usuários pelo painel,
          configure <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code> nas Environment Variables da Vercel (e faça redeploy).
          Consultas de scrapings, logs e bloqueio de perfil continuam funcionando normalmente.
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca', padding: '12px 16px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {actionMsg.text && (
        <div role="status" style={{
          background: actionMsg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          border: `1px solid ${actionMsg.type === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`,
          color: actionMsg.type === 'error' ? '#fecaca' : '#a7f3d0',
          padding: '12px 16px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {actionMsg.type === 'error' ? <AlertTriangle size={15} color="#ef4444" /> : <CheckCircle size={15} color="#10b981" />}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Formulário criar usuário */}
      {showCreateUser && (
        <form onSubmit={handleCreateUser} style={{ ...cardStyle, borderLeft: '3px solid #10b981' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={16} color="#10b981" /> Criar nova conta de usuário
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@cliente.com"
              style={inputStyle}
              required
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome (opcional)"
              style={inputStyle}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Senha inicial (mín. 6 caracteres)"
              style={inputStyle}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <ActionBtn type="submit" accent disabled={creating}>
              {creating ? 'Criando…' : 'Criar conta confirmada'}
            </ActionBtn>
            <ActionBtn onClick={() => setShowCreateUser(false)}>Cancelar</ActionBtn>
          </div>
        </form>
      )}

      {/* Modal inline de redefinição de senha */}
      {resetTarget && (
        <form onSubmit={handleResetPassword} style={{ ...cardStyle, borderLeft: '3px solid #06b6d4' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={16} color="#06b6d4" /> Redefinir senha de {resetTarget.email}
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="password"
              value={resetPwValue}
              onChange={(e) => setResetPwValue(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)"
              style={{ ...inputStyle, minWidth: 260 }}
              required
            />
            <button
              type="submit"
              disabled={resetBusy}
              style={{ background: '#06b6d4', color: '#09090b', border: 'none', padding: '0 16px', fontSize: 13, fontWeight: 700, cursor: resetBusy ? 'not-allowed' : 'pointer' }}
            >
              {resetBusy ? 'Salvando…' : 'Salvar nova senha'}
            </button>
            <ActionBtn onClick={() => { setResetTarget(null); setResetPwValue(''); }}>Cancelar</ActionBtn>
          </div>
        </form>
      )}

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <div style={{ ...cardStyle, borderLeft: '3px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 12 }}>
            <span>Contas cadastradas</span>
            <Users size={16} color="#10b981" />
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', margin: '6px 0 4px' }}>
            {summary.totalUsers ?? 0}
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {summary.activeUsers ?? 0} ativas · {summary.blockedUsers ?? 0} bloqueadas
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '3px solid #06b6d4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 12 }}>
            <span>Scrapings hoje (BRT)</span>
            <Activity size={16} color="#06b6d4" />
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', margin: '6px 0 4px' }}>
            {summary.scrapingsToday ?? 0}
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {summary.scrapingsPeriod ?? 0} nos últimos {days} dias
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '3px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 12 }}>
            <span>Scrapings totais</span>
            <Calendar size={16} color="#8b5cf6" />
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', margin: '6px 0 4px' }}>
            {summary.scrapingsTotal ?? 0}
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {(summary.leadsTotal ?? 0).toLocaleString('pt-BR')} leads acumulados
          </div>
        </div>

        <div style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 12 }}>
            <span>Logins hoje / Alertas</span>
            <Shield size={16} color="#f59e0b" />
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', margin: '6px 0 4px' }}>
            {summary.loginsToday ?? 0}
          </div>
          <div style={{ fontSize: 12, color: (summary.failedLogins24h || 0) > 0 ? '#fca5a5' : '#71717a' }}>
            {summary.failedLogins24h ?? 0} falhas/bloqueios nas últimas 24h
          </div>
        </div>
      </div>

      {/* Sub-navegação */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #27272a', paddingBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'users', label: `Usuários & Scrapings (${users.length})` },
            { id: 'daily', label: 'Scrapings por Dia' },
            { id: 'logs', label: `Logs de Acesso (${logs.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              style={{
                background: subTab === item.id ? 'rgba(16,185,129,0.15)' : '#18181b',
                color: subTab === item.id ? '#10b981' : '#a1a1aa',
                border: `1px solid ${subTab === item.id ? 'rgba(16,185,129,0.35)' : '#27272a'}`,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {selectedUserId && (
          <ActionBtn onClick={() => setSelectedUserId('')}>
            Limpar filtro de usuário ({users.find((u) => u.id === selectedUserId)?.email || 'selecionado'})
          </ActionBtn>
        )}
      </div>

      {loading && !overview ? (
        <p style={{ color: '#71717a', padding: '32px 0', textAlign: 'center' }} className="mono">
          Carregando auditoria administrativa…
        </p>
      ) : null}

      {/* SUB-ABA 1: USUÁRIOS & SCRAPINGS */}
      {!loading && subTab === 'users' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search size={14} color="#71717a" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por e-mail ou nome…"
                style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
              />
            </div>
            <select
              aria-label="Filtrar status dos usuários"
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">Todas as contas</option>
              <option value="active">Somente ativas</option>
              <option value="blocked">Somente bloqueadas</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #27272a', color: '#71717a', textAlign: 'left', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Usuário</th>
                  <th style={{ padding: '10px 8px' }}>Hoje</th>
                  <th style={{ padding: '10px 8px' }}>Pico em 1 Dia</th>
                  <th style={{ padding: '10px 8px' }}>7d / {days}d / Total</th>
                  <th style={{ padding: '10px 8px' }}>Leads</th>
                  <th style={{ padding: '10px 8px' }}>Último Scraping</th>
                  <th style={{ padding: '10px 8px' }}>Último Login</th>
                  <th style={{ padding: '10px 8px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isMainAdmin = isSuperAdminEmail(u.email);
                  const todayCount = Number(u.scrapings_today || 0);
                  const peakCount = Number(u.max_scrapings_in_day || 0);
                  const isBusy = busyUserId === u.id;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #27272a', opacity: u.is_active ? 1 : 0.72 }}>
                      <td style={{ padding: '12px 8px', minWidth: 210 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ color: '#fafafa', fontWeight: 600 }}>
                            {u.full_name || u.email.split('@')[0]}
                          </span>
                          {isMainAdmin && (
                            <span className="mono" style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                              SUPERADM
                            </span>
                          )}
                          {!u.is_active && (
                            <span className="mono" style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                              BLOQUEADO
                            </span>
                          )}
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>{u.email}</div>
                        {u.blocked_reason && !u.is_active && (
                          <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>Motivo: {u.blocked_reason}</div>
                        )}
                      </td>

                      <td className="mono" style={{ padding: '12px 8px', fontWeight: 700, fontSize: 15, color: todayCount >= 20 ? '#f59e0b' : todayCount > 0 ? '#10b981' : '#52525b' }}>
                        {todayCount}
                      </td>

                      <td style={{ padding: '12px 8px' }}>
                        <div className="mono" style={{ fontWeight: 700, color: peakCount >= 20 ? '#f59e0b' : '#fafafa' }}>
                          {peakCount}
                        </div>
                        <div style={{ fontSize: 11, color: '#71717a' }}>
                          {u.peak_scraping_day ? formatDayBR(u.peak_scraping_day) : 'sem registros'}
                        </div>
                      </td>

                      <td className="mono" style={{ padding: '12px 8px', color: '#e4e4e7' }}>
                        <div>{u.scrapings_7d || 0} / {u.scrapings_period || 0} / <strong>{u.scrapings_total || 0}</strong></div>
                        <div style={{ fontSize: 11, color: '#71717a' }}>
                          {u.spreadsheets_total || 0} planilhas · {u.failed_jobs_total || 0} falhas
                        </div>
                      </td>

                      <td className="mono" style={{ padding: '12px 8px', color: '#e4e4e7' }}>
                        <div>{(u.leads_total || 0).toLocaleString('pt-BR')}</div>
                        <div style={{ fontSize: 11, color: '#71717a' }}>+{u.leads_today || 0} hoje</div>
                      </td>

                      <td style={{ padding: '12px 8px', fontSize: 12, color: '#a1a1aa' }}>
                        {formatDateTimeBR(u.last_scraping_at)}
                      </td>

                      <td style={{ padding: '12px 8px', fontSize: 12, color: '#a1a1aa' }}>
                        <div>{formatDateTimeBR(u.last_login_at)}</div>
                        <div style={{ fontSize: 11, color: '#71717a' }}>{u.logins_total || 0} logins</div>
                      </td>

                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <ActionBtn
                            onClick={() => { setSelectedUserId(u.id); setSubTab('daily'); }}
                            title="Ver scrapings dia a dia deste usuário"
                          >
                            Por dia
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => { setSelectedUserId(u.id); setSubTab('logs'); }}
                            title="Ver logs de acesso deste usuário"
                          >
                            Logs
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => { setResetTarget(u); setResetPwValue(''); }}
                            title="Redefinir senha deste usuário"
                          >
                            <KeyRound size={12} /> Senha
                          </ActionBtn>
                          {!isMainAdmin && (
                            <>
                              <ActionBtn
                                danger={u.is_active}
                                accent={!u.is_active}
                                disabled={isBusy}
                                onClick={() => handleToggleUser(u)}
                              >
                                {u.is_active ? <><Ban size={12} /> Bloquear</> : <><Unlock size={12} /> Ativar</>}
                              </ActionBtn>
                              <ActionBtn
                                danger
                                disabled={isBusy}
                                onClick={() => handleDeleteUser(u)}
                                title="Excluir conta"
                              >
                                <Trash2 size={12} />
                              </ActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                      Nenhum usuário encontrado para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-ABA 2: SCRAPINGS POR DIA */}
      {!loading && subTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Gráfico diário agregado */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 14px' }}>
              Volume diário de scrapings (últimos {days} dias)
            </h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, overflowX: 'auto', paddingBottom: 8 }}>
              {dailySeries.map((pt) => {
                const count = Number(pt.scrapings || 0);
                const h = count === 0 ? 3 : Math.max(10, Math.round((count / maxChartScrapings) * 110));
                return (
                  <div
                    key={pt.day}
                    title={`${formatDayBR(pt.day)}: ${count} scrapings · ${pt.leads || 0} leads · ${pt.activeUsers || 0} usuários`}
                    style={{ flex: '1 0 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                  >
                    <span className="mono" style={{ fontSize: 10, color: count > 0 ? '#fafafa' : '#52525b' }}>{count || ''}</span>
                    <div style={{
                      width: '100%',
                      maxWidth: 26,
                      height: h,
                      background: count >= 30 ? '#f59e0b' : count > 0 ? '#10b981' : '#27272a',
                    }} />
                    <span className="mono" style={{ fontSize: 9, color: '#71717a' }}>{pt.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela dia x usuário */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                aria-label="Filtrar usuário por dia"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Todos os usuários</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>

              <select
                aria-label="Mínimo de scrapings no dia"
                value={minDayScrapings}
                onChange={(e) => setMinDayScrapings(e.target.value)}
                style={inputStyle}
              >
                <option value="0">Qualquer quantidade</option>
                <option value="5">5+ scrapings no dia</option>
                <option value="15">15+ scrapings no dia</option>
                <option value="30">30+ scrapings no dia</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #27272a', color: '#71717a', textAlign: 'left', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 8px' }}>Dia (BRT)</th>
                    <th style={{ padding: '10px 8px' }}>Usuário</th>
                    <th style={{ padding: '10px 8px' }}>Scrapings no dia</th>
                    <th style={{ padding: '10px 8px' }}>Planilhas</th>
                    <th style={{ padding: '10px 8px' }}>Leads capturados</th>
                    <th style={{ padding: '10px 8px' }}>Última atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyRows.map((row, idx) => (
                    <tr key={`${row.day}-${row.user_id}-${idx}`} style={{ borderBottom: '1px solid #27272a' }}>
                      <td className="mono" style={{ padding: '10px 8px', color: '#fafafa' }}>{row.day_label || formatDayBR(row.day)}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ color: '#fafafa', fontWeight: 600 }}>{row.full_name || row.email}</div>
                        {row.full_name && <div className="mono" style={{ fontSize: 11, color: '#71717a' }}>{row.email}</div>}
                      </td>
                      <td className="mono" style={{
                        padding: '10px 8px',
                        fontWeight: 700,
                        fontSize: 15,
                        color: Number(row.scrapings_count) >= 30 ? '#f59e0b' : Number(row.scrapings_count) > 0 ? '#10b981' : '#71717a',
                      }}>
                        {row.scrapings_count}
                      </td>
                      <td className="mono" style={{ padding: '10px 8px', color: '#a1a1aa' }}>{row.spreadsheets_count || 0}</td>
                      <td className="mono" style={{ padding: '10px 8px', color: '#e4e4e7' }}>{(row.leads_captured || 0).toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '10px 8px', fontSize: 12, color: '#a1a1aa' }}>{formatDateTimeBR(row.last_activity_at)}</td>
                    </tr>
                  ))}
                  {filteredDailyRows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                        Nenhuma execução de scraping encontrada neste período/filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 3: LOGS DE ACESSO */}
      {!loading && subTab === 'logs' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={14} color="#71717a" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Buscar por e-mail, IP ou contexto…"
                style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
              />
            </div>

            <select
              aria-label="Filtrar logs por usuário"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Todos os usuários</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>

            <select
              aria-label="Filtrar logs por evento"
              value={logEventFilter}
              onChange={(e) => setLogEventFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">Todos os eventos</option>
              {Object.entries(EVENT_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>

            <ActionBtn onClick={() => exportLogsCsv(logs)} disabled={logs.length === 0}>
              <Download size={13} /> Exportar CSV
            </ActionBtn>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #27272a', color: '#71717a', textAlign: 'left', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Data / Hora</th>
                  <th style={{ padding: '10px 8px' }}>Evento</th>
                  <th style={{ padding: '10px 8px' }}>Conta</th>
                  <th style={{ padding: '10px 8px' }}>Origem</th>
                  <th style={{ padding: '10px 8px' }}>IP</th>
                  <th style={{ padding: '10px 8px' }}>Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = EVENT_META[log.event_type] || { label: log.event_type, color: '#a1a1aa', bg: 'rgba(161,161,170,0.12)' };
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #27272a' }}>
                      <td className="mono" style={{ padding: '10px 8px', fontSize: 12, color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                        {formatDateTimeBR(log.created_at)}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span className="mono" style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', color: meta.color, background: meta.bg }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div className="mono" style={{ color: '#fafafa', fontSize: 12 }}>{log.email || '—'}</div>
                        {log.full_name && <div style={{ fontSize: 11, color: '#71717a' }}>{log.full_name}</div>}
                      </td>
                      <td className="mono" style={{ padding: '10px 8px', fontSize: 12, color: '#a1a1aa' }}>
                        {log.login_context || 'panel'} · {log.provider || 'email'}
                      </td>
                      <td className="mono" style={{ padding: '10px 8px', fontSize: 12, color: '#71717a' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td title={log.user_agent || ''} style={{ padding: '10px 8px', fontSize: 12, color: '#a1a1aa' }}>
                        {formatUserAgent(log.user_agent)}
                      </td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#71717a' }}>
                      Nenhum log de acesso registrado com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
