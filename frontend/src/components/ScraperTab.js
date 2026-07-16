import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useExtensionUpdates } from '../providers/ExtensionUpdateProvider';
import { createRequestId } from '../utils/extensionUpdates';
import { Activity, AlertTriangle, Check, Clock, Sparkles, Zap, Phone, Globe, Instagram, Search, Rocket, Monitor, Target } from './Icons';

// A mineração roda na EXTENSÃO (no PC do usuário, IP dele — grátis, sem bloqueio).
// Aqui o usuário dispara a busca: a extensão abre uma janelinha do Maps, minera
// automaticamente e envia os leads pro dashboard, sem precisar sair do site.
const card = { background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 24 };

const captured = [
  { icon: Phone, label: 'Telefone' },
  { icon: Globe, label: 'Site' },
  { icon: Instagram, label: '@ Instagram e redes' },
  { icon: Target, label: 'Nome, endereço, categoria, nota' },
];

const STAGE_LABELS = {
  queued: 'Aguardando a extensão', starting: 'Abrindo o Google Maps', capturing: 'Capturando leads',
  enriching: 'Enriquecendo contatos', sending: 'Enviando ao painel', completed: 'Concluída', failed: 'Falhou',
};

export default function ScraperTab({ onGoTo }) {
  const { extension, isChecking, isBlocking, checkNow, latest } = useExtensionUpdates();
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [msg, setMsg] = useState('');
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const pendingRef = useRef(null);
  const progressWriteRef = useRef(0);

  const loadJobs = useCallback(async () => {
    if (!api.getMiningJobs) return;
    try {
      const response = await api.getMiningJobs('', 8);
      setRecentJobs(response?.data || []);
    } catch (_) { /* histórico é complementar */ }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    function onMessage(event) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.__fm !== 'extension') return;

      if (data.action === 'startSearchAck' && data.requestId && pendingRef.current?.requestId === data.requestId) {
        clearTimeout(pendingRef.current.timeout);
        const current = pendingRef.current;
        pendingRef.current = null;
        setStarting(false);
        if (data.ok) {
          setJob(previous => ({ ...(previous || {}), id: data.jobId || current.jobId, stage: 'starting', error: '' }));
          setMsg('A extensão confirmou a busca. Acompanhe o progresso abaixo.');
          api.updateMiningJob?.(data.jobId || current.jobId, { status: 'running', metadata: { stage: 'starting' } }).catch(() => {});
        } else {
          const error = data.error || 'A extensão não conseguiu abrir o Google Maps.';
          setJob(previous => ({ ...(previous || {}), stage: 'failed', error }));
          setMsg(error);
          api.updateMiningJob?.(current.jobId, { status: 'failed', errorMessage: error, metadata: { stage: 'failed' } }).catch(() => {});
        }
        return;
      }

      if (data.action === 'searchProgress' && data.data) {
        const progress = data.data;
        setJob(previous => {
          if (previous?.id && progress.jobId && previous.id !== progress.jobId) return previous;
          return { ...(previous || {}), id: progress.jobId || previous?.id, ...progress };
        });
        const now = Date.now();
        if (api.updateMiningJob && now - progressWriteRef.current > 1200) {
          progressWriteRef.current = now;
          api.updateMiningJob(progress.jobId, {
            status: progress.stage === 'failed' ? 'failed' : 'running',
            capturedCount: progress.captured || 0, enrichedCount: progress.enriched || 0,
            insertedCount: progress.sent || 0, errorMessage: progress.error || '', metadata: { stage: progress.stage },
          }).catch(() => {});
        }
        return;
      }

      if (data.action === 'searchDone') {
        const result = data.data || {};
        const stage = data.ok ? 'completed' : 'failed';
        setJob(previous => ({ ...(previous || {}), id: result.jobId || previous?.id, ...result, stage }));
        setStarting(false);
        setMsg(data.ok ? `Mineração concluída: ${result.sent || result.captured || 0} leads enviados.` : (result.error || 'A mineração terminou com erro. Você pode tentar novamente.'));
        api.updateMiningJob?.(result.jobId, {
          status: stage, capturedCount: result.captured || 0, insertedCount: result.sent || 0,
          errorMessage: result.error || '', metadata: { stage },
        }).catch(() => {}).finally(loadJobs);
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (pendingRef.current) clearTimeout(pendingRef.current.timeout);
    };
  }, [loadJobs]);

  async function minerar(e) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw || starting || isBlocking) return;
    const cleanCity = city.trim();
    const query = cleanCity ? `${kw} em ${cleanCity}` : kw;
    setStarting(true);
    setMsg('Registrando e enviando a busca para a extensão…');
    try {
      const clientJobId = createRequestId('mining-job');
      const created = api.startMiningJob
        ? await api.startMiningJob({ clientJobId, keyword: kw, city: cleanCity, source: 'dashboard', metadata: { query } })
        : null;
      const jobId = created?.data?.id || clientJobId;
      const requestId = createRequestId('search');
      setJob({ id: jobId, keyword: kw, city: cleanCity, query, stage: 'queued', captured: 0, sent: 0, error: '' });
      const timeout = setTimeout(() => {
        if (pendingRef.current?.requestId !== requestId) return;
        pendingRef.current = null;
        setStarting(false);
        const error = 'A extensão não respondeu. Verifique se está ativa e tente novamente.';
        setJob(previous => ({ ...(previous || {}), stage: 'failed', error }));
        setMsg(error);
        api.updateMiningJob?.(jobId, { status: 'failed', errorMessage: error, metadata: { stage: 'failed' } }).catch(() => {});
      }, 8000);
      pendingRef.current = { requestId, jobId, timeout };
      window.postMessage({ __fm: 'site', action: 'startSearch', requestId, jobId, query, keyword: kw, city: cleanCity }, window.location.origin);
    } catch (error) {
      setStarting(false);
      setMsg(error.message || 'Não foi possível iniciar a mineração.');
    }
  }

  const inputStyle = {
    flex: 1, minWidth: 180, background: '#09090b', border: '1px solid #27272a', color: '#fafafa',
    padding: '11px 12px', borderRadius: 0, fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero + formulário */}
      <div style={{ ...card, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.06))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.15)', flexShrink: 0 }}>
            <Sparkles size={24} color="#10b981" />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fafafa', margin: '0 0 4px' }}>Buscar Leads</h2>
            <p style={{ fontSize: 14, color: '#a1a1aa', margin: 0 }}>
              Digite o que procura. A extensão minera no Maps e traz os leads pra cá — automático.
            </p>
          </div>
        </div>

        {extension.installed && !isBlocking ? (
          <form onSubmit={minerar} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input style={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="Ex: dentistas, restaurantes, academias..." />
            <input style={{ ...inputStyle, flex: '0 1 220px' }} value={city} onChange={e => setCity(e.target.value)}
              placeholder="Cidade (ex: São Paulo)" />
            <button type="submit" disabled={!keyword.trim() || starting}
              style={{
                background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none',
                padding: '11px 22px', borderRadius: 0, cursor: keyword.trim() && !starting ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: keyword.trim() && !starting ? 1 : 0.6,
              }}>
              <Rocket size={16} /> {starting ? 'Iniciando…' : 'Minerar'}
            </button>
          </form>
        ) : (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', padding: 16, color: '#fca5a5', fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: '#fecaca' }}>{isBlocking ? 'Atualização necessária.' : (isChecking ? 'Verificando extensão…' : 'Extensão não detectada.')}</strong>{' '}
            {isBlocking
              ? `Atualize para v${latest?.version || 'mais recente'} antes de iniciar novas minerações. Seus leads continuam acessíveis.`
              : 'Para minerar, instale a Friendly Miner no Chrome do computador e mantenha o painel aberto.'}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {!isBlocking && <button type="button" onClick={checkNow} style={{ background: 'transparent', color: '#fecaca', border: '1px solid rgba(239,68,68,.4)', padding: '7px 11px', cursor: 'pointer' }}>Verificar novamente</button>}
              <button type="button" onClick={() => onGoTo?.('updates')} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '7px 11px', cursor: 'pointer' }}>Abrir Atualizações</button>
            </div>
          </div>
        )}

        {msg && (
          <div role="status" aria-live="polite" style={{ marginTop: 16, background: job?.stage === 'failed' ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${job?.stage === 'failed' ? 'rgba(239,68,68,.3)' : 'rgba(16,185,129,0.3)'}`, padding: 14, color: job?.stage === 'failed' ? '#fecaca' : '#6ee7b7', fontSize: 13, lineHeight: 1.5 }}>
            {msg}
          </div>
        )}

        {job && (
          <div style={{ marginTop: 16, background: '#09090b', border: '1px solid #27272a', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#e4e4e7', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                {job.stage === 'completed' ? <Check size={15} color="#10b981" /> : job.stage === 'failed' ? <AlertTriangle size={15} color="#ef4444" /> : <Activity size={15} color="#06b6d4" />}
                <strong>{STAGE_LABELS[job.stage] || job.stage}</strong> · {job.query}
              </span>
              <span className="mono" style={{ color: '#a1a1aa', fontSize: 12 }}>{job.captured || 0} capturados · {job.sent || 0} enviados</span>
            </div>
            {!['completed', 'failed'].includes(job.stage) && <div style={{ height: 4, background: '#27272a', marginTop: 12 }}><div style={{ height: '100%', width: `${Math.max(10, ['queued','starting','capturing','enriching','sending'].indexOf(job.stage) * 22)}%`, maxWidth: '95%', background: 'linear-gradient(90deg,#10b981,#06b6d4)', transition: 'width .3s' }} /></div>}
            {job.stage === 'failed' && <button type="button" onClick={minerar} style={{ marginTop: 10, background: 'transparent', border: '1px solid rgba(239,68,68,.4)', color: '#fecaca', padding: '7px 11px', cursor: 'pointer' }}>Tentar novamente</button>}
          </div>
        )}
      </div>

      {recentJobs.length > 0 && <div style={card}>
        <h3 style={{ fontSize: 15, color: '#fafafa', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 7 }}><Clock size={15} color="#06b6d4" /> Minerações recentes</h3>
        <div style={{ display: 'grid', gap: 8 }}>{recentJobs.map(item => { const recentStage = item.metadata?.stage || item.status; return <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #27272a', paddingTop: 8, color: '#a1a1aa', fontSize: 12 }}><span>{item.metadata?.query || [item.keyword, item.city].filter(Boolean).join(' em ')}</span><span>{STAGE_LABELS[recentStage] || recentStage} · {item.inserted_count || 0} enviados</span></div>; })}</div>
      </div>}

      {/* Como funciona */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
        {[
          { icon: Search, title: '1. Você digita', text: 'A busca que quer (ramo + cidade) e clica em Minerar.' },
          { icon: Monitor, title: '2. Abre o Maps', text: 'A extensão abre uma janelinha do Google Maps já pesquisando.' },
          { icon: Zap, title: '3. Extrai sozinha', text: 'Rola a lista, captura tudo e enriquece com telefone, site e redes.' },
          { icon: Rocket, title: '4. Chega aqui', text: 'Envia pro seu Dashboard automaticamente e fecha a janela.' },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.1)', marginBottom: 14 }}>
              <s.icon size={20} color="#10b981" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', margin: '0 0 6px' }}>{s.title}</h3>
            <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}>{s.text}</p>
          </div>
        ))}
      </div>

      {/* O que é capturado */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', margin: '0 0 14px' }}>O que é capturado</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {captured.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#09090b', border: '1px solid #27272a', padding: '8px 14px' }}>
              <c.icon size={15} color="#10b981" />
              <span style={{ fontSize: 13, color: '#e4e4e7' }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
