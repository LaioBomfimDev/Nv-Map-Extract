import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  MessageCircle,
  Upload,
} from './Icons';
import {
  ExtensionUpdateProvider,
  useExtensionUpdates,
  useOptionalExtensionUpdates,
} from '../providers/ExtensionUpdateProvider';
import { UPDATE_STATUS } from '../utils/extensionUpdates';

const EXTENSIONS_URL = 'chrome://extensions';
const SUPPORT_PHONE = '5571999575358';
const SUPPORT_TEXT = encodeURIComponent('Oi, preciso de ajuda para atualizar a extensão Friendly Miner.');
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

const buttonBase = {
  borderRadius: 0,
  padding: '11px 18px',
  fontSize: 14,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

function formatDate(date) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(timestamp) {
  if (!timestamp) return 'ainda não verificado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function formatBytes(value) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function formatChannel(channel) {
  return { stable: 'Estável', beta: 'Beta', preview: 'Prévia' }[channel] || channel || 'indisponível';
}

function SimpleStep({ number, title, text, icon: Icon }) {
  return (
    <div style={{ background: '#09090b', border: '1px solid #3f3f46', padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div aria-hidden="true" style={{ width: 34, height: 34, background: 'rgba(16,185,129,0.14)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
        {number}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Icon aria-hidden="true" size={15} color="#34d399" />
          <strong style={{ color: '#fafafa', fontSize: 14 }}>{title}</strong>
        </div>
        <p style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

function statusPresentation(status, extensionVersion, minimumVersion, hasCachedMetadata) {
  switch (status) {
    case UPDATE_STATUS.MISSING:
      return {
        icon: AlertTriangle,
        label: 'Extensão não detectada',
        color: '#fbbf24',
        background: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.45)',
        text: 'Instale ou ative a extensão no Chrome deste computador para minerar pelo Google Maps.',
      };
    case UPDATE_STATUS.CURRENT:
      return {
        icon: Check,
        label: 'Tudo atualizado',
        color: '#34d399',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.45)',
        text: 'A extensão instalada está na versão mais recente publicada.',
      };
    case UPDATE_STATUS.OUTDATED:
      return {
        icon: Download,
        label: 'Atualização disponível',
        color: '#34d399',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.45)',
        text: 'Existe uma versão mais nova. Atualize para receber correções e melhorias.',
      };
    case UPDATE_STATUS.INCOMPATIBLE:
      return {
        icon: AlertTriangle,
        label: 'Versão incompatível',
        color: '#f87171',
        background: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.48)',
        text: extensionVersion
          ? `A versão instalada não é mais compatível. Atualize para a versão ${minimumVersion} ou superior antes de iniciar uma nova mineração.`
          : 'A extensão foi detectada, mas não informou uma versão válida. Recarregue ou reinstale a extensão.',
      };
    case UPDATE_STATUS.METADATA_ERROR:
      return {
        icon: AlertTriangle,
        label: 'Catálogo indisponível',
        color: '#fbbf24',
        background: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.45)',
        text: hasCachedMetadata
          ? 'Não foi possível consultar o catálogo agora. As últimas informações válidas salvas neste navegador continuam visíveis.'
          : 'Não foi possível consultar as versões publicadas. Verifique sua conexão e tente novamente.',
      };
    case UPDATE_STATUS.CHECKING:
    default:
      return {
        icon: Clock,
        label: 'Verificando agora',
        color: '#67e8f9',
        background: 'rgba(6,182,212,0.1)',
        border: 'rgba(6,182,212,0.38)',
        text: 'Estamos consultando o catálogo e procurando a extensão neste navegador.',
      };
  }
}

function UpdatesTabContent({ updateState }) {
  const {
    status,
    isChecking,
    extension,
    latest,
    history,
    metadataError,
    metadataCachedAt,
    lastCheckedAt,
    checkNow,
    openExtensionsPage,
  } = updateState;
  const [copyState, setCopyState] = useState('idle');
  const [openState, setOpenState] = useState('idle');
  const [actionMessage, setActionMessage] = useState('');

  const presentation = useMemo(() => statusPresentation(
    status,
    extension.version,
    latest?.minimumSupportedVersion || '',
    Boolean(latest),
  ), [extension.version, latest, status]);
  const StatusIcon = presentation.icon;
  const hasDownload = Boolean(latest?.downloadUrl);
  const shouldDownloadUpdate = [UPDATE_STATUS.OUTDATED, UPDATE_STATUS.INCOMPATIBLE].includes(status);

  useEffect(() => {
    if (copyState !== 'copied') return undefined;
    const timer = setTimeout(() => setCopyState('idle'), 5000);
    return () => clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (window.location.hash !== '#updates-faq') return undefined;
    const timer = setTimeout(() => {
      const faq = document.getElementById('updates-faq');
      faq?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      faq?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function copyExtensionsAddress() {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_URL);
      setCopyState('copied');
      setActionMessage('Endereço copiado. Cole-o na barra de endereços do Chrome.');
    } catch (_) {
      setCopyState('failed');
      setActionMessage('Não foi possível copiar automaticamente. Digite chrome://extensions na barra do Chrome.');
    }
  }

  async function requestExtensionsPage() {
    setOpenState('opening');
    setActionMessage('Pedindo para a extensão abrir a página do Chrome…');
    const result = await openExtensionsPage();
    setOpenState(result.ok ? 'opened' : 'failed');
    setActionMessage(result.message);
  }

  function scrollToFaq() {
    document.getElementById('updates-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ ...card, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.06))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{ ...pillBase, background: presentation.background, border: `1px solid ${presentation.border}`, color: presentation.color, marginBottom: 14 }}
            >
              <StatusIcon aria-hidden="true" size={14} color={presentation.color} />
              {presentation.label}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', margin: '0 0 8px' }}>Central de atualizações</h2>
            <p style={{ color: '#b4b4bd', fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 760 }}>
              {presentation.text} Seus leads ficam salvos no painel; remover ou trocar a extensão não apaga os dados.
            </p>
          </div>

          <div style={{ minWidth: 270, background: '#09090b', border: '1px solid #3f3f46', padding: 16 }}>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 9, columnGap: 16, fontSize: 13, margin: 0 }}>
              <dt style={{ color: '#a1a1aa' }}>Instalada</dt>
              <dd className="mono" style={{ color: extension.installed ? '#e4e4e7' : '#fbbf24', fontWeight: 700, margin: 0 }}>{extension.version || 'não detectada'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Mais recente</dt>
              <dd className="mono" style={{ color: '#34d399', fontWeight: 700, margin: 0 }}>{latest?.version || 'indisponível'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Mínima compatível</dt>
              <dd className="mono" style={{ color: '#e4e4e7', fontWeight: 700, margin: 0 }}>{latest?.minimumSupportedVersion || 'indisponível'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Canal</dt>
              <dd style={{ color: '#e4e4e7', fontWeight: 700, margin: 0 }}>{formatChannel(latest?.channel)}</dd>
              <dt style={{ color: '#a1a1aa' }}>Chrome mínimo</dt>
              <dd className="mono" style={{ color: '#e4e4e7', fontWeight: 700, margin: 0 }}>{latest?.minimumChromeVersion || 'indisponível'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Lançamento</dt>
              <dd className="mono" style={{ color: '#b4b4bd', fontWeight: 700, margin: 0 }}>{formatDate(latest?.releasedAt) || '—'}</dd>
            </dl>
            <p className="mono" style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 1.5, margin: '14px 0 0', borderTop: '1px solid #27272a', paddingTop: 10 }}>
              Última verificação: {formatDateTime(lastCheckedAt)}
            </p>
          </div>
        </div>

        {status === UPDATE_STATUS.METADATA_ERROR && (
          <div role="alert" style={{ marginTop: 18, border: '1px solid rgba(245,158,11,0.42)', background: 'rgba(245,158,11,0.08)', color: '#fde68a', padding: 14, fontSize: 13, lineHeight: 1.55 }}>
            <strong>Falha ao consultar o catálogo.</strong> {metadataError}
            {metadataCachedAt && <span> Dados salvos em {formatDateTime(metadataCachedAt)}.</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          {hasDownload ? (
            <a
              href={latest.downloadUrl}
              download
              rel="noopener noreferrer"
              style={{ ...buttonBase, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', textDecoration: 'none', border: '1px solid #10b981' }}
            >
              <Download aria-hidden="true" size={16} />
              {shouldDownloadUpdate ? `Baixar atualização ${latest.version}` : `Baixar extensão ${latest.version}`}
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="O arquivo desta versão ainda não foi publicado."
              style={{ ...buttonBase, background: '#27272a', color: '#a1a1aa', border: '1px solid #52525b', cursor: 'not-allowed' }}
            >
              <Download aria-hidden="true" size={16} color="#a1a1aa" />
              Download ainda indisponível
            </button>
          )}

          <button
            type="button"
            onClick={requestExtensionsPage}
            disabled={openState === 'opening'}
            aria-busy={openState === 'opening'}
            style={{ ...buttonBase, background: 'rgba(39,39,42,0.7)', color: '#f4f4f5', border: '1px solid #52525b', cursor: openState === 'opening' ? 'wait' : 'pointer' }}
          >
            <ExternalLink aria-hidden="true" size={16} />
            {openState === 'opening' ? 'Abrindo…' : 'Abrir extensões'}
          </button>

          <button
            type="button"
            onClick={copyExtensionsAddress}
            style={{ ...buttonBase, background: 'rgba(39,39,42,0.7)', color: '#f4f4f5', border: '1px solid #52525b', cursor: 'pointer' }}
          >
            <FileText aria-hidden="true" size={16} />
            {copyState === 'copied' ? 'Endereço copiado' : 'Copiar endereço'}
          </button>

          <button
            type="button"
            onClick={checkNow}
            disabled={isChecking}
            aria-busy={isChecking}
            style={{ ...buttonBase, background: 'rgba(6,182,212,0.1)', color: '#a5f3fc', border: '1px solid rgba(6,182,212,0.45)', cursor: isChecking ? 'wait' : 'pointer' }}
          >
            <Clock aria-hidden="true" size={16} color="#a5f3fc" />
            {isChecking ? 'Verificando…' : 'Verificar novamente'}
          </button>

          <button
            type="button"
            onClick={scrollToFaq}
            style={{ ...buttonBase, background: 'transparent', color: '#a5f3fc', border: '1px solid rgba(6,182,212,0.35)', cursor: 'pointer' }}
          >
            <MessageCircle aria-hidden="true" size={16} color="#a5f3fc" />
            Preciso de ajuda
          </button>
        </div>

        <p style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
          Depois de baixar, extraia o ZIP. O Chrome carrega a pasta extraída que contém o arquivo <span className="mono">manifest.json</span>, não o ZIP.
          {latest?.sizeBytes ? ` Tamanho: ${formatBytes(latest.sizeBytes)}.` : ''}
        </p>
        {latest?.sha256 && (
          <p className="mono" title={latest.sha256} style={{ color: '#a1a1aa', fontSize: 11, overflowWrap: 'anywhere', margin: '6px 0 0' }}>
            SHA-256: {latest.sha256}
          </p>
        )}
        <p role="status" aria-live="polite" aria-atomic="true" style={{ color: openState === 'failed' || copyState === 'failed' ? '#fca5a5' : '#a7f3d0', fontSize: 12, minHeight: 18, lineHeight: 1.5, margin: '8px 0 0' }}>
          {actionMessage}
        </p>
      </div>

      <section aria-labelledby="update-guide-title" style={card}>
        <h3 id="update-guide-title" style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 6px' }}>Como atualizar sem se perder</h3>
        <p style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.55, margin: '0 0 18px' }}>
          Mantenha a mesma pasta da extensão: substitua os arquivos e use o botão de recarregar do Chrome.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <SimpleStep number="1" title="Baixar e extrair" icon={Download} text="Baixe a nova versão e extraia o ZIP antes de continuar." />
          <SimpleStep number="2" title="Substituir os arquivos" icon={FolderOpen} text="Copie os arquivos extraídos para a pasta antiga da extensão e confirme a substituição." />
          <SimpleStep number="3" title="Recarregar e verificar" icon={Upload} text="Abra chrome://extensions, recarregue a Friendly Miner, volte a esta aba e clique em Verificar novamente." />
        </div>
        <div style={{ marginTop: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)', padding: 14, color: '#bbf7d0', fontSize: 13, lineHeight: 1.55 }}>
          Seus leads continuam salvos no painel durante todo o processo.
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section aria-labelledby="safe-update-title" style={{ ...card, borderLeft: '3px solid #10b981' }}>
          <h3 id="safe-update-title" style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check aria-hidden="true" size={16} color="#34d399" />
            O que você não precisa fazer
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Não precisa criar outra conta.',
              'Não precisa importar os leads novamente.',
              'Não precisa apagar a extensão se souber onde está a pasta antiga.',
              'Não perde dados ao atualizar, porque os leads ficam no Supabase.',
            ].map(item => <li key={item} style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.5 }}>{item}</li>)}
          </ul>
        </section>

        <section aria-labelledby="clean-install-title" style={{ ...card, borderLeft: '3px solid #f59e0b' }}>
          <h3 id="clean-install-title" style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle aria-hidden="true" size={16} color="#fbbf24" />
            Instalação do zero
          </h3>
          <p style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            Use este caminho se não encontrar a pasta antiga ou se a extensão continuar com erro.
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Abra chrome://extensions e ative o Modo do desenvolvedor no canto superior direito.',
              'Remova a extensão antiga, se ela ainda estiver na lista.',
              'Extraia o novo ZIP em uma pasta limpa e permanente.',
              'Clique em Carregar sem compactação.',
              'Selecione a pasta que contém o arquivo manifest.json.',
              'Volte ao painel, mantenha esta aba aberta e clique em Verificar novamente.',
            ].map(item => <li key={item} style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.5 }}>{item}</li>)}
          </ol>
        </section>
      </div>

      <section id="updates-faq" tabIndex={-1} aria-labelledby="updates-faq-title" style={{ ...card, borderLeft: '3px solid #06b6d4', scrollMarginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: '1 1 360px' }}>
            <h3 id="updates-faq-title" style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageCircle aria-hidden="true" size={17} color="#67e8f9" />
              FAQ e suporte
            </h3>
            <p style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              As dúvidas comuns ficam visíveis para consulta. Se precisar, fale com o suporte pelo WhatsApp.
            </p>
          </div>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" style={{ ...buttonBase, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', textDecoration: 'none', border: '1px solid #10b981' }}>
            <MessageCircle aria-hidden="true" size={16} />
            WhatsApp 71 99957-5358
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {[
            {
              q: 'Cliquei em “Abrir extensões” e nada aconteceu',
              a: 'A extensão precisa estar ativa para abrir a tela interna do Chrome. Use “Copiar endereço” e cole chrome://extensions na barra do navegador.',
            },
            {
              q: 'Não sei qual pasta substituir',
              a: 'Abra chrome://extensions, procure a Friendly Miner e confira o caminho da extensão. Se não encontrar, siga a instalação do zero acima.',
            },
            {
              q: 'Meus leads somem se eu remover a extensão?',
              a: 'Não. Os leads ficam salvos no painel pelo Supabase. A extensão apenas minera e envia os dados.',
            },
            {
              q: 'Depois de atualizar ainda aparece a versão antiga',
              a: 'Recarregue a extensão em chrome://extensions e clique em “Verificar novamente”. Se continuar, fale com o suporte.',
            },
          ].map(item => (
            <article key={item.q} style={{ background: '#09090b', border: '1px solid #3f3f46', padding: 14 }}>
              <h4 style={{ color: '#fafafa', fontSize: 13, margin: '0 0 6px' }}>{item.q}</h4>
              <p style={{ color: '#b4b4bd', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="version-history-title" style={card}>
        <h3 id="version-history-title" style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText aria-hidden="true" size={16} color="#34d399" />
          Histórico de versões
        </h3>
        {history.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {history.map((item, index) => (
              <article key={`${item.version}-${index}`} style={{ background: '#09090b', border: '1px solid #3f3f46', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <h4 style={{ color: '#fafafa', fontSize: 14, margin: 0 }}>{item.title || `Versão ${item.version}`}</h4>
                    <div className="mono" style={{ color: '#a1a1aa', fontSize: 12, marginTop: 3 }}>v{item.version}</div>
                  </div>
                  <time className="mono" dateTime={item.releasedAt} style={{ color: '#a1a1aa', fontSize: 12 }}>{formatDate(item.releasedAt)}</time>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(item.changes || []).map(change => <li key={change} style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.45 }}>{change}</li>)}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            O histórico não está disponível neste momento. Use “Verificar novamente” para tentar carregar o catálogo.
          </p>
        )}
      </section>
    </div>
  );
}

function ConnectedUpdatesTab() {
  return <UpdatesTabContent updateState={useExtensionUpdates()} />;
}

export default function UpdatesTab() {
  const sharedState = useOptionalExtensionUpdates();
  if (sharedState) return <UpdatesTabContent updateState={sharedState} />;

  return (
    <ExtensionUpdateProvider>
      <ConnectedUpdatesTab />
    </ExtensionUpdateProvider>
  );
}
