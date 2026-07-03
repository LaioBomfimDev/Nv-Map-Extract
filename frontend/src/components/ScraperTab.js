import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

const card = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 24,
};

const inputStyle = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 10,
  padding: '11px 14px',
  color: '#f1f5f9',
  fontSize: 14,
  outline: 'none',
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

function Spinner({ size = 16 }) {
  return <span style={{ display: 'inline-block', width: size, height: size, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ ...card, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      </div>
    </div>
  );
}

export default function ScraperTab() {
  const [keyword, setKeyword]             = useState('');
  const [city, setCity]                   = useState('');
  const [collectEmails, setCollectEmails] = useState(true);
  const [showBrowser, setShowBrowser]     = useState(false);
  const [starting, setStarting]           = useState(false);
  const [stopping, setStopping]           = useState(false);
  const [errorMsg, setErrorMsg]           = useState('');
  const [status, setStatus]               = useState(null);
  const pollRef  = useRef(null);
  const logsRef  = useRef(null);

  const isActive = status?.isActive;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.getScraperStatus();
      if (res.success) setStatus(res.data);
    } catch { /* backend fora do ar — mantém último status */ }
  }, []);

  // Polling do status enquanto a busca roda (e uma vez ao montar)
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(fetchStatus, 1500);
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [isActive, fetchStatus]);

  // Auto-scroll do painel de logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [status?.logs]);

  async function handleStart() {
    setErrorMsg('');
    if (!keyword.trim() || !city.trim()) {
      setErrorMsg('Preencha a palavra-chave e a cidade.');
      return;
    }
    setStarting(true);
    try {
      const res = await api.startScraper({ keyword: keyword.trim(), city: city.trim(), collectEmails, showBrowser });
      if (!res.success) setErrorMsg(res.message || 'Erro ao iniciar a busca.');
      await fetchStatus();
    } catch (e) {
      setErrorMsg('Servidor indisponível. Verifique se o backend está rodando.');
    }
    setStarting(false);
  }

  async function handleStop() {
    setStopping(true);
    try {
      await api.stopScraper();
      await fetchStatus();
    } catch { /* ignora */ }
    setStopping(false);
  }

  const statusColor = status?.status === 'error' ? '#ef4444'
    : isActive ? '#3b82f6'
    : status?.status === 'done' ? '#22c55e'
    : '#64748b';

  const statusLabel = status?.status === 'error' ? 'Erro'
    : status?.status === 'stopping' ? 'Parando...'
    : isActive ? 'Rodando'
    : status?.status === 'done' ? 'Finalizado'
    : 'Inativo';

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Buscar Leads</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Extraia leads do Google Maps diretamente do Dashboard — sem extensão</p>
      </div>

      <div className="responsive-grid-scraper" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ——— Formulário de busca ——— */}
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            🎯 Nova Extração
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Palavra-chave</label>
            <input
              style={inputStyle}
              placeholder="Ex: Dentistas, Cafeterias, Academias..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              disabled={isActive}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Cidade / Região</label>
            <input
              style={inputStyle}
              placeholder="Ex: São Paulo, Campinas, Zona Sul SP..."
              value={city}
              onChange={e => setCity(e.target.value)}
              disabled={isActive}
              onKeyDown={e => { if (e.key === 'Enter' && !isActive) handleStart(); }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer', color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" checked={collectEmails} onChange={e => setCollectEmails(e.target.checked)} disabled={isActive} style={{ accentColor: '#3b82f6', width: 16, height: 16 }} />
            <span>📧 Coleta profunda <span style={{ color: '#64748b' }}>(e-mails e redes sociais)</span></span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, cursor: 'pointer', color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" checked={showBrowser} onChange={e => setShowBrowser(e.target.checked)} disabled={isActive} style={{ accentColor: '#3b82f6', width: 16, height: 16 }} />
            <span>🖥️ Mostrar navegador <span style={{ color: '#64748b' }}>(ver extração em tempo real)</span></span>
          </label>

          {errorMsg && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>
              {errorMsg}
            </div>
          )}

          {!isActive ? (
            <button
              onClick={handleStart}
              disabled={starting}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                color: '#fff', border: 'none', padding: '13px 20px', borderRadius: 12,
                cursor: starting ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: starting ? 0.7 : 1, transition: 'all 0.2s',
              }}>
              {starting ? <><Spinner /> Iniciando...</> : '🚀 Iniciar Extração'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={stopping || status?.status === 'stopping'}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg,#ef4444,#f97316)',
                color: '#fff', border: 'none', padding: '13px 20px', borderRadius: 12,
                cursor: stopping ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: stopping ? 0.7 : 1, transition: 'all 0.2s',
              }}>
              {stopping || status?.status === 'stopping' ? <><Spinner /> Parando...</> : '⏹ Parar Busca'}
            </button>
          )}
        </div>

        {/* ——— Painel de monitoramento ——— */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status geral */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: statusColor,
                boxShadow: isActive ? `0 0 8px ${statusColor}` : 'none',
                animation: isActive ? 'pulse 1.2s ease-in-out infinite' : 'none',
              }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{statusLabel}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{status?.phase || 'Aguardando início de uma busca'}</div>
              </div>
            </div>
            {isActive && <Spinner size={20} />}
            {status?.keyword && (
              <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
                Busca: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{status.keyword} em {status.city}</span>
              </div>
            )}
          </div>

          {/* Cartões de métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <StatCard icon="👥" label="Leads encontrados" value={status?.leadsFound ?? 0} color="#3b82f6" />
            <StatCard icon="📧" label="E-mails capturados" value={status?.emailsFound ?? 0} color="#22c55e" />
            <StatCard icon="⏳" label="Sites na fila" value={status?.pendingEmails ?? 0} color="#f59e0b" />
          </div>

          {/* Últimos leads em tempo real */}
          {(status?.recentLeads?.length > 0) && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #334155', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
                ⚡ Últimos leads capturados
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {status.recentLeads.map((l, i) => (
                  <div key={l.placeID || i} style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b44', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.address || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, fontSize: 11 }}>
                      {l.phone && <span style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', padding: '3px 8px', borderRadius: 6 }}>📞 {l.phone}</span>}
                      {l.email && <span style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', padding: '3px 8px', borderRadius: 6 }}>📧</span>}
                      {l.website && <span style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', padding: '3px 8px', borderRadius: 6 }}>🌐</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Painel de logs */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #334155', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
              📋 Log de atividades
            </div>
            <div ref={logsRef} style={{ maxHeight: 220, overflowY: 'auto', padding: '12px 20px', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.8 }}>
              {(status?.logs?.length > 0) ? status.logs.map((log, i) => (
                <div key={i} style={{ color: '#94a3b8' }}>
                  <span style={{ color: '#475569' }}>{new Date(log.time).toLocaleTimeString('pt-BR')}</span>
                  {' '}{log.message}
                </div>
              )) : (
                <div style={{ color: '#475569', padding: '20px 0', textAlign: 'center' }}>
                  Nenhuma atividade ainda. Inicie uma extração para acompanhar o progresso aqui.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
