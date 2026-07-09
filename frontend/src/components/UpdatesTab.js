import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, Download, ExternalLink, FileText, FolderOpen, MessageCircle, Upload } from './Icons';

const EXTENSIONS_URL = 'chrome://extensions';
const SUPPORT_PHONE = '5571999575358';
const SUPPORT_TEXT = encodeURIComponent('Oi, preciso de ajuda para atualizar a extensao Friendly Miner.');
const SUPPORT_URL = `https://wa.me/${SUPPORT_PHONE}?text=${SUPPORT_TEXT}`;

const card = {
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 0,
  padding: 24,
};

const pillBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px',
  borderRadius: 0,
  fontSize: 12,
  fontWeight: 700,
};

function compareVersions(a, b) {
  const pa = String(a || '0').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('pt-BR');
}

function SimpleStep({ number, title, text, icon: Icon }) {
  return (
    <div style={{ background: '#09090b', border: '1px solid #27272a', padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 34, height: 34, background: 'rgba(16,185,129,0.14)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
        {number}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Icon size={15} color="#10b981" />
          <strong style={{ color: '#fafafa', fontSize: 14 }}>{title}</strong>
        </div>
        <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

export default function UpdatesTab() {
  const [updates, setUpdates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [extensionsHint, setExtensionsHint] = useState('');
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [extension, setExtension] = useState({ installed: false, version: '' });

  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.PUBLIC_URL || ''}/updates.json?ts=${Date.now()}`)
      .then(r => {
        if (!r.ok) throw new Error('Nao foi possivel carregar o historico de atualizacoes.');
        return r.json();
      })
      .then(data => { if (!cancelled) setUpdates(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Erro ao carregar atualizacoes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function readFromDom() {
      const installed = document.documentElement.getAttribute('data-fm-extension') === '1';
      const version = document.documentElement.getAttribute('data-fm-extension-version') || '';
      setExtension(prev => {
        if (prev.installed === installed && prev.version === version) return prev;
        return { installed, version };
      });
    }

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.__fm !== 'extension' || data.action !== 'status') return;
      setExtension({ installed: Boolean(data.installed), version: data.version || '' });
    }

    let tries = 0;
    const timer = setInterval(() => {
      readFromDom();
      window.postMessage({ __fm: 'site', action: 'getExtensionStatus' }, '*');
      tries += 1;
      if (tries >= 20) clearInterval(timer);
    }, 500);

    readFromDom();
    window.addEventListener('message', onMessage);
    window.postMessage({ __fm: 'site', action: 'getExtensionStatus' }, '*');

    return () => {
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const latest = updates?.latest || {};
  const history = updates?.history || [];
  const latestVersion = latest.version || '';
  const updateAvailable = extension.installed && latestVersion && compareVersions(latestVersion, extension.version) > 0;
  const isCurrent = extension.installed && latestVersion && compareVersions(latestVersion, extension.version) <= 0;
  const hasDownload = Boolean(latest.downloadUrl);

  const status = useMemo(() => {
    if (!extension.installed) {
      return {
        icon: AlertTriangle,
        label: 'Extensao nao detectada',
        color: '#f59e0b',
        background: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.3)',
        text: 'Instale a extensao no Chrome deste computador para minerar pelo Google Maps.',
      };
    }
    if (updateAvailable) {
      return {
        icon: Download,
        label: 'Atualizacao disponivel',
        color: latest.required ? '#ef4444' : '#10b981',
        background: latest.required ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.12)',
        border: latest.required ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)',
        text: latest.required
          ? 'Esta versao ficou antiga demais. Atualize para evitar falhas.'
          : 'Existe uma versao mais nova. Voce pode atualizar agora ou deixar para depois.',
      };
    }
    if (isCurrent) {
      return {
        icon: Check,
        label: 'Tudo atualizado',
        color: '#10b981',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.3)',
        text: 'Sua extensao esta na ultima versao publicada.',
      };
    }
    return {
      icon: Clock,
      label: 'Verificando versao',
      color: '#a1a1aa',
      background: 'rgba(161,161,170,0.08)',
      border: '#27272a',
      text: 'Abra ou recarregue o painel com a extensao ativa para detectar a versao instalada.',
    };
  }, [extension.installed, isCurrent, latest.required, updateAvailable]);

  const StatusIcon = status.icon;

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function openExtensionsPage() {
    window.postMessage({ __fm: 'site', action: 'openExtensionsPage' }, '*');
    try {
      window.open(`${EXTENSIONS_URL}/`, '_blank', 'noopener');
    } catch (_) {}

    const didCopy = await copyText(EXTENSIONS_URL);
    setCopied(didCopy);
    setExtensionsHint(didCopy
      ? 'Se nao abrir automaticamente, cole chrome://extensions na barra do Chrome.'
      : 'Se nao abrir automaticamente, digite chrome://extensions na barra do Chrome.');
    setTimeout(() => {
      setCopied(false);
      setExtensionsHint('');
    }, 6000);
  }

  function scrollToFaq() {
    document.getElementById('updates-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return <p style={{ color: '#52525b', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Carregando atualizacoes...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5', display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={16} color="#ef4444" />
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div style={{ ...card, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.06))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ ...pillBase, background: status.background, border: `1px solid ${status.border}`, color: status.color, marginBottom: 14 }}>
              <StatusIcon size={14} color={status.color} />
              {status.label}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', margin: '0 0 8px' }}>Atualizacoes da extensao</h2>
            <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 760 }}>
              {status.text} Os seus leads ficam salvos no painel, entao remover ou trocar a extensao nao apaga seus dados.
            </p>
          </div>

          <div style={{ minWidth: 240, background: '#09090b', border: '1px solid #27272a', padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 16, fontSize: 13 }}>
              <span style={{ color: '#52525b' }}>Instalada</span>
              <strong className="mono" style={{ color: extension.installed ? '#e4e4e7' : '#f59e0b' }}>{extension.version || 'nao detectada'}</strong>
              <span style={{ color: '#52525b' }}>Mais recente</span>
              <strong className="mono" style={{ color: '#10b981' }}>{latestVersion || 'indefinida'}</strong>
              <span style={{ color: '#52525b' }}>Lancamento</span>
              <strong className="mono" style={{ color: '#a1a1aa' }}>{formatDate(latest.releasedAt) || '-'}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          {hasDownload ? (
            <a
              href={latest.downloadUrl}
              download
              style={{
                background: 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fff',
                textDecoration: 'none',
                border: 'none',
                padding: '11px 18px',
                borderRadius: 0,
                fontSize: 14,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Download size={16} />
              {updateAvailable ? '1. Baixar atualizacao' : '1. Baixar extensao'}
            </a>
          ) : (
            <button
              type="button"
              disabled
              style={{
                background: '#27272a',
                color: '#71717a',
                border: '1px solid #3f3f46',
                padding: '11px 18px',
                borderRadius: 0,
                fontSize: 14,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'not-allowed',
              }}
            >
              <Download size={16} color="#71717a" />
              Download sera liberado aqui
            </button>
          )}

          <button
            type="button"
            onClick={openExtensionsPage}
            style={{
              background: 'rgba(39,39,42,0.55)',
              color: '#e4e4e7',
              border: '1px solid #27272a',
              padding: '11px 18px',
              borderRadius: 0,
              fontSize: 14,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <ExternalLink size={16} />
            {copied ? 'Endereco copiado' : '2. Abrir extensoes'}
          </button>

          <button
            type="button"
            onClick={scrollToFaq}
            style={{
              background: 'rgba(6,182,212,0.1)',
              color: '#67e8f9',
              border: '1px solid rgba(6,182,212,0.28)',
              padding: '11px 18px',
              borderRadius: 0,
              fontSize: 14,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <MessageCircle size={16} color="#67e8f9" />
            Preciso de ajuda
          </button>
        </div>
        <p style={{ color: '#71717a', fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
          Depois de baixar, extraia o zip antes de abrir o Chrome. O Chrome carrega a pasta extraida, nao o arquivo zip.
        </p>
        {extensionsHint && (
          <p style={{ color: '#a7f3d0', fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>
            {extensionsHint}
          </p>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 6px' }}>Como atualizar sem se perder</h3>
        <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: '0 0 18px' }}>
          O jeito mais simples e manter a mesma pasta da extensao. Assim voce so troca os arquivos e aperta recarregar.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <SimpleStep
            number="1"
            title="Baixar"
            icon={Download}
            text="Baixe a nova versao pelo botao verde desta pagina."
          />
          <SimpleStep
            number="2"
            title="Extrair por cima"
            icon={FolderOpen}
            text="Abra o zip e substitua os arquivos dentro da pasta antiga da extensao."
          />
          <SimpleStep
            number="3"
            title="Recarregar"
            icon={Upload}
            text="Cole chrome://extensions no Chrome e clique no botao de recarregar da Friendly Miner."
          />
        </div>

        <div style={{ marginTop: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', padding: 14, color: '#a7f3d0', fontSize: 13, lineHeight: 1.55 }}>
          Pronto. Volte para esta aba e confira se a versao instalada mudou. Os leads continuam salvos no painel.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{ ...card, borderLeft: '3px solid #10b981' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} color="#10b981" />
            O que voce nao precisa fazer
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Nao precisa criar outra conta.',
              'Nao precisa importar leads de novo.',
              'Nao precisa apagar a extensao se souber onde esta a pasta antiga.',
              'Nao perde dados ao atualizar, porque os leads ficam no Supabase.',
            ].map((item, i) => (
              <li key={i} style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={{ ...card, borderLeft: '3px solid #f59e0b' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#f59e0b" />
            Nao achei a pasta antiga
          </h3>
          <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            Use este caminho so quando nao souber onde a extensao antiga esta salva.
          </p>
          <button
            type="button"
            onClick={() => setShowResetHelp(v => !v)}
            style={{
              background: 'rgba(245,158,11,0.12)',
              color: '#fbbf24',
              border: '1px solid rgba(245,158,11,0.3)',
              padding: '9px 13px',
              borderRadius: 0,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {showResetHelp ? 'Esconder instalacao do zero' : 'Ver instalacao do zero'}
          </button>
          {showResetHelp && (
            <ol style={{ margin: '14px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Remova a extensao antiga em chrome://extensions.',
                'Extraia o novo zip em uma pasta limpa.',
                'Clique em Carregar sem compactacao.',
                'Selecione a pasta nova da extensao.',
                'Abra o painel novamente e faca login se pedir.',
              ].map((item, i) => (
                <li key={i} style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.5 }}>{item}</li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div id="updates-faq" style={{ ...card, borderLeft: '3px solid #06b6d4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: '1 1 360px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageCircle size={17} color="#67e8f9" />
              FAQ e suporte
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              Se nao conseguir atualizar, pode chamar no WhatsApp. O suporte esta sempre ativo.
            </p>
          </div>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'linear-gradient(135deg,#10b981,#059669)',
              color: '#fff',
              textDecoration: 'none',
              border: 'none',
              padding: '11px 16px',
              borderRadius: 0,
              fontSize: 14,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <MessageCircle size={16} />
            WhatsApp 71 99957-5358
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {[
            {
              q: 'Cliquei em Abrir extensoes e nada aconteceu',
              a: 'O Chrome pode bloquear paginas internas abertas por sites. O botao tambem copia chrome://extensions; cole esse texto na barra do Chrome.',
            },
            {
              q: 'Nao sei qual pasta substituir',
              a: 'Abra chrome://extensions, procure a Friendly Miner e veja o caminho da extensao. Se nao achar, use a instalacao do zero desta pagina.',
            },
            {
              q: 'Meus leads somem se eu remover a extensao?',
              a: 'Nao. Os leads ficam salvos no painel pelo Supabase. A extensao so minera e envia os dados.',
            },
            {
              q: 'Depois de atualizar ainda aparece versao antiga',
              a: 'Clique em recarregar na extensao e atualize esta pagina. Se continuar, chame o suporte no WhatsApp.',
            },
          ].map((item, i) => (
            <div key={i} style={{ background: '#09090b', border: '1px solid #27272a', padding: 14 }}>
              <strong style={{ display: 'block', color: '#fafafa', fontSize: 13, marginBottom: 6 }}>{item.q}</strong>
              <p style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} color="#10b981" />
          Historico de versoes
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {history.map((item, index) => (
            <div key={`${item.version}-${index}`} style={{ background: '#09090b', border: '1px solid #27272a', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <strong style={{ color: '#fafafa', fontSize: 14 }}>{item.title || `Versao ${item.version}`}</strong>
                  <div className="mono" style={{ color: '#52525b', fontSize: 12, marginTop: 3 }}>v{item.version}</div>
                </div>
                <span className="mono" style={{ color: '#71717a', fontSize: 12 }}>{formatDate(item.releasedAt)}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(item.changes || []).map((change, i) => (
                  <li key={i} style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.45 }}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
