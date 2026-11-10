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
  Zap,
} from './Icons';
import {
  ExtensionUpdateProvider,
  useExtensionUpdates,
  useOptionalExtensionUpdates,
} from '../providers/ExtensionUpdateProvider';
import { UPDATE_STATUS } from '../utils/extensionUpdates';
import {
  canDirectFolderInstall,
  installOrUpdateExtensionInFolder,
} from '../utils/extensionInstaller';
import ChromeGuideMockup from './ChromeGuideMockup';

const EXTENSIONS_URL = 'chrome://extensions';
const SUPPORT_PHONE = '5571999575358';
const SUPPORT_TEXT = encodeURIComponent('Oi, preciso de ajuda para instalar/atualizar a extensão Friendly Miner.');
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

const STEP_LABELS = {
  picking: 'Selecione a pasta da extensão no navegador…',
  downloading: 'Baixando pacote oficial…',
  unzipping: 'Verificando SHA-256 e extraindo arquivos…',
  writing: 'Gravando arquivos limpos na pasta…',
  reloading: 'Recarregando extensão automaticamente…',
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

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch (_) {
    return false;
  }
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
        text: 'Prepare a pasta em 1 clique abaixo e carregue no Chrome para começar a minerar.',
      };
    case UPDATE_STATUS.CURRENT:
      return {
        icon: Check,
        label: 'Tudo atualizado',
        color: '#34d399',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.45)',
        text: 'A extensão está na versão mais recente publicada e conectada ao painel.',
      };
    case UPDATE_STATUS.OUTDATED:
      return {
        icon: Download,
        label: 'Atualização disponível',
        color: '#34d399',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.45)',
        text: 'Atualize com 1 clique mantendo a mesma pasta — seus leads continuam intactos.',
      };
    case UPDATE_STATUS.INCOMPATIBLE:
      return {
        icon: AlertTriangle,
        label: 'Atualização obrigatória',
        color: '#f87171',
        background: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.48)',
        text: extensionVersion
          ? `Atualize para a versão ${minimumVersion} ou superior antes de iniciar novas minerações.`
          : 'Recarregue ou atualize a pasta da extensão para continuar.',
      };
    case UPDATE_STATUS.METADATA_ERROR:
      return {
        icon: AlertTriangle,
        label: 'Catálogo indisponível',
        color: '#fbbf24',
        background: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.45)',
        text: hasCachedMetadata
          ? 'Mostrando a última versão salva em cache neste navegador.'
          : 'Não foi possível consultar as versões agora. Tente verificar novamente.',
      };
    case UPDATE_STATUS.CHECKING:
    default:
      return {
        icon: Clock,
        label: 'Verificando agora',
        color: '#67e8f9',
        background: 'rgba(6,182,212,0.1)',
        border: 'rgba(6,182,212,0.38)',
        text: 'Procurando a extensão instalada neste navegador…',
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
    reloadExtension,
  } = updateState;

  const [copyState, setCopyState] = useState('idle');
  const [openState, setOpenState] = useState('idle');
  const [directPhase, setDirectPhase] = useState('idle'); // idle | working | done_install | done_reload_auto | done_reload_manual | error
  const [lastSavedFolder, setLastSavedFolder] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionIsError, setActionIsError] = useState(false);

  const directSupported = canDirectFolderInstall();
  const presentation = useMemo(() => statusPresentation(
    status,
    extension.version,
    latest?.minimumSupportedVersion || '',
    Boolean(latest),
  ), [extension.version, latest, status]);
  const StatusIcon = presentation.icon;
  const hasDownload = Boolean(latest?.downloadUrl);
  const needsUpdate = [UPDATE_STATUS.OUTDATED, UPDATE_STATUS.INCOMPATIBLE].includes(status);

  useEffect(() => {
    if (copyState !== 'copied') return undefined;
    const timer = setTimeout(() => setCopyState('idle'), 4000);
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
    const ok = await copyTextSafe(EXTENSIONS_URL);
    setCopyState(ok ? 'copied' : 'failed');
    setActionIsError(!ok);
    setActionMessage(
      ok
        ? 'Endereço copiado! Cole chrome://extensions na barra do navegador.'
        : 'Copie manualmente: chrome://extensions',
    );
  }

  async function requestExtensionsPage() {
    setOpenState('opening');
    setActionIsError(false);
    setActionMessage('Abrindo chrome://extensions…');
    const result = await openExtensionsPage();
    setOpenState(result.ok ? 'opened' : 'failed');
    setActionIsError(!result.ok);
    setActionMessage(result.message);
  }

  async function handleDirectInstallOrUpdate() {
    if (!hasDownload || directPhase === 'working') return;
    setDirectPhase('working');
    setActionIsError(false);
    setActionMessage(STEP_LABELS.picking);

    try {
      const result = await installOrUpdateExtensionInFolder({
        downloadUrl: latest.downloadUrl,
        expectedSha256: latest.sha256,
        onStep: (step) => {
          setActionMessage(STEP_LABELS[step] || 'Processando…');
        },
      });

      if (result.cancelled) {
        setDirectPhase('idle');
        setActionMessage('');
        return;
      }

      setLastSavedFolder(result.folderName || '');

      if (extension.installed) {
        if (!result.hadPreviousManifest) {
          setDirectPhase('done_reload_manual');
          setActionIsError(false);
          setActionMessage(`Pasta "${result.folderName}" preparada com v${latest.version}, mas ela não tinha a versão anterior. Em chrome://extensions, remova a antiga (v${extension.version}) e carregue "${result.folderName}".`);
          if (openExtensionsPage) await openExtensionsPage().catch(() => {});
          return;
        }

        setActionMessage(STEP_LABELS.reloading);
        const reloadRes = extension.supportsReload && reloadExtension
          ? await reloadExtension()
          : { ok: false };

        if (reloadRes.ok) {
          setDirectPhase('done_reload_auto');
          setActionIsError(false);
          setActionMessage(`Extensão v${latest.version} gravada em "${result.folderName}" e recarregada!`);
        } else {
          setDirectPhase('done_reload_manual');
          setActionIsError(false);
          setActionMessage(`v${latest.version} gravada em "${result.folderName}"! Agora aperte ↻ Recarregar em chrome://extensions. Se continuar em v${extension.version}, o Chrome está carregado de outra pasta — veja em "Saiba mais" no Chrome ou remova a antiga e carregue "${result.folderName}".`);
          if (openExtensionsPage) await openExtensionsPage().catch(() => {});
        }
      } else {
        setDirectPhase('done_install');
        setActionIsError(false);
        setActionMessage(`Pasta "${result.folderName}" pronta (${result.fileCount} arquivos)! Agora carregue ela em chrome://extensions.`);
      }
    } catch (err) {
      setDirectPhase('error');
      setActionIsError(true);
      setActionMessage(err?.message || 'Não foi possível gravar na pasta. Use "Baixar .ZIP" como alternativa.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Card Principal */}
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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', margin: '0 0 8px' }}>
              Instalador & Atualizações
            </h2>
            <p style={{ color: '#b4b4bd', fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 680 }}>
              {presentation.text}
            </p>
          </div>

          <div style={{ minWidth: 255, background: '#09090b', border: '1px solid #3f3f46', padding: 15 }}>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 16, fontSize: 13, margin: 0 }}>
              <dt style={{ color: '#a1a1aa' }}>Sua versão</dt>
              <dd className="mono" style={{ color: extension.installed ? '#e4e4e7' : '#fbbf24', fontWeight: 700, margin: 0 }}>{extension.version || 'não detectada'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Disponível</dt>
              <dd className="mono" style={{ color: '#34d399', fontWeight: 700, margin: 0 }}>{latest?.version || 'indisponível'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Tamanho</dt>
              <dd className="mono" style={{ color: '#e4e4e7', fontWeight: 700, margin: 0 }}>{formatBytes(latest?.sizeBytes) || '—'}</dd>
              <dt style={{ color: '#a1a1aa' }}>Lançamento</dt>
              <dd className="mono" style={{ color: '#b4b4bd', fontWeight: 700, margin: 0 }}>{formatDate(latest?.releasedAt) || '—'}</dd>
            </dl>
            <p className="mono" style={{ color: '#71717a', fontSize: 11, margin: '12px 0 0', borderTop: '1px solid #27272a', paddingTop: 9 }}>
              {formatChannel(latest?.channel)} · Verificado: {formatDateTime(lastCheckedAt)}
            </p>
          </div>
        </div>

        {status === UPDATE_STATUS.METADATA_ERROR && (
          <div role="alert" style={{ marginTop: 16, border: '1px solid rgba(245,158,11,0.42)', background: 'rgba(245,158,11,0.08)', color: '#fde68a', padding: 12, fontSize: 13 }}>
            <strong>Falha ao consultar catálogo.</strong> {metadataError}
            {metadataCachedAt && <span> Último cache: {formatDateTime(metadataCachedAt)}.</span>}
          </div>
        )}

        {/* Ações principais — 1 Clique primeiro, ZIP clássico em segundo */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
          {hasDownload && directSupported && (
            <button
              type="button"
              onClick={handleDirectInstallOrUpdate}
              disabled={directPhase === 'working'}
              style={{
                ...buttonBase,
                background: 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fff',
                border: '1px solid #10b981',
                cursor: directPhase === 'working' ? 'wait' : 'pointer',
                opacity: directPhase === 'working' ? 0.75 : 1,
              }}
            >
              <Zap aria-hidden="true" size={16} />
              {directPhase === 'working'
                ? 'Aplicando na pasta…'
                : extension.installed
                  ? (needsUpdate ? `Atualizar em 1 clique (v${latest.version})` : `Regravar pasta (v${latest.version})`)
                  : `Preparar pasta em 1 clique (v${latest.version})`}
            </button>
          )}

          {hasDownload ? (
            <a
              href={latest.downloadUrl}
              download
              rel="noopener noreferrer"
              style={{
                ...buttonBase,
                background: directSupported ? 'rgba(39,39,42,0.75)' : 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fafafa',
                textDecoration: 'none',
                border: directSupported ? '1px solid #52525b' : '1px solid #10b981',
              }}
            >
              <Download aria-hidden="true" size={16} />
              {directSupported ? `Baixar .ZIP (${formatBytes(latest?.sizeBytes) || latest.version})` : `Baixar extensão v${latest.version}`}
            </a>
          ) : (
            <button type="button" disabled style={{ ...buttonBase, background: '#27272a', color: '#a1a1aa', border: '1px solid #52525b', cursor: 'not-allowed' }}>
              <Download aria-hidden="true" size={16} />
              Download indisponível
            </button>
          )}

          {extension.installed && (
            <button
              type="button"
              onClick={requestExtensionsPage}
              disabled={openState === 'opening'}
              style={{ ...buttonBase, background: 'rgba(39,39,42,0.75)', color: '#f4f4f5', border: '1px solid #52525b', cursor: 'pointer' }}
            >
              <ExternalLink aria-hidden="true" size={15} />
              Abrir chrome://extensions
            </button>
          )}

          <button
            type="button"
            onClick={copyExtensionsAddress}
            style={{ ...buttonBase, background: 'rgba(39,39,42,0.75)', color: '#f4f4f5', border: '1px solid #52525b', cursor: 'pointer' }}
          >
            <FileText aria-hidden="true" size={15} />
            {copyState === 'copied' ? 'Copiado!' : 'Copiar chrome://extensions'}
          </button>

          <button
            type="button"
            onClick={checkNow}
            disabled={isChecking}
            style={{ ...buttonBase, background: 'rgba(6,182,212,0.1)', color: '#a5f3fc', border: '1px solid rgba(6,182,212,0.45)', cursor: isChecking ? 'wait' : 'pointer' }}
          >
            <Clock aria-hidden="true" size={15} color="#a5f3fc" />
            {isChecking ? 'Verificando…' : 'Verificar'}
          </button>
        </div>

        <p style={{ color: '#a1a1aa', fontSize: 12, margin: '12px 0 0', lineHeight: 1.5 }}>
          No seletor de pastas do Windows só aparecem as subpastas (<span className="mono">js, icons, css</span>) — é normal; basta clicar em <strong>Selecionar pasta</strong>.
        </p>

        {actionMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 12,
              padding: '11px 14px',
              background: actionIsError ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
              border: `1px solid ${actionIsError ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`,
              color: actionIsError ? '#fecaca' : '#a7f3d0',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {actionMessage}
          </div>
        )}

        {lastSavedFolder && needsUpdate && directPhase !== 'working' && (
          <div style={{ marginTop: 10, padding: '11px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.38)', color: '#fde68a', fontSize: 12, lineHeight: 1.55 }}>
            <strong>Ainda mostra v{extension.version}?</strong> Isso acontece quando o Chrome carregou a extensão antiga de <strong>outra pasta</strong>.
            Em <span className="mono">chrome://extensions</span>, clique em <strong>Saiba mais</strong> para ver a pasta antiga — ou simplesmente clique em <strong>Remover</strong> nela e carregue a pasta <span className="mono">{lastSavedFolder}</span>.
          </div>
        )}
      </div>

      {/* Guia Visual Enxuto (2 cards curtos + mock visual do Chrome) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
        <section aria-labelledby="first-install-title" style={{ ...card, borderLeft: '3px solid #10b981', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 id="first-install-title" style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderOpen aria-hidden="true" size={16} color="#34d399" />
              Primeira instalação (2 passos)
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Sem WinRAR: clique em <strong>Preparar pasta em 1 clique</strong>, crie/escolha uma subpasta (ex: <span className="mono">FriendlyMiner</span>) e carregue no Chrome.
            </p>
          </div>
          <ChromeGuideMockup mode="install" />
          <p style={{ color: '#71717a', fontSize: 12, margin: 0 }}>
            Cole <span className="mono" style={{ color: '#e4e4e7' }}>chrome://extensions</span> na barra do Chrome, ligue <strong>Modo do desenvolvedor</strong> e arraste a pasta (ou use <em>Carregar sem compactação</em>).
          </p>
        </section>

        <section aria-labelledby="fast-update-title" style={{ ...card, borderLeft: '3px solid #06b6d4', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 id="fast-update-title" style={{ fontSize: 16, fontWeight: 800, color: '#fafafa', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap aria-hidden="true" size={16} color="#67e8f9" />
              Atualização rápida (sem perder nada)
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Clique em <strong>Atualizar em 1 clique</strong> e confirme a mesma pasta. O sistema atualiza os arquivos e recarrega a extensão sozinha (a partir da v2.1.2).
            </p>
          </div>
          <ChromeGuideMockup mode="update" />
          <p style={{ color: '#71717a', fontSize: 12, margin: 0 }}>
            Se você ainda estiver na v2.1.0/v2.1.1, só esta última vez aperte <strong>↻ Recarregar</strong> no Chrome depois de gravar a pasta.
          </p>
        </section>
      </div>

      {/* Suporte direto & FAQ compacto */}
      <section id="updates-faq" tabIndex={-1} aria-labelledby="updates-faq-title" style={{ ...card, scrollMarginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 id="updates-faq-title" style={{ fontSize: 15, fontWeight: 800, color: '#fafafa', margin: '0 0 4px' }}>
              Travou em algum passo?
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0 }}>
              Respostas rápidas ou suporte direto no WhatsApp.
            </p>
          </div>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" style={{ ...buttonBase, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', textDecoration: 'none', border: '1px solid #10b981' }}>
            <MessageCircle aria-hidden="true" size={15} />
            WhatsApp 71 99957-5358
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {[
            {
              q: 'O Chrome bloqueou a pasta Downloads/Documentos?',
              a: 'Por segurança o Chrome bloqueia a raiz. Crie uma subpasta dentro dela (ex: FriendlyMiner) e selecione a subpasta.',
            },
            {
              q: 'Meus leads somem se eu apagar a extensão?',
              a: 'Não! Tudo fica salvo na sua conta na nuvem (Supabase). Você pode reinstalar à vontade.',
            },
            {
              q: 'Qual navegador funciona melhor?',
              a: 'Google Chrome ou Microsoft Edge no computador. O recurso de 1 clique funciona nativamente neles.',
            },
            {
              q: 'Prefere o método antigo (.ZIP)?',
              a: 'Use o botão "Baixar .ZIP", extraia tudo e aponte o Chrome para a pasta que tem o arquivo manifest.json.',
            },
          ].map(item => (
            <article key={item.q} style={{ background: '#09090b', border: '1px solid #27272a', padding: 14 }}>
              <h4 style={{ color: '#fafafa', fontSize: 13, margin: '0 0 5px' }}>{item.q}</h4>
              <p style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Histórico de versões compacto */}
      {history.length > 0 && (
        <section aria-labelledby="version-history-title" style={card}>
          <h3 id="version-history-title" style={{ fontSize: 14, fontWeight: 700, color: '#fafafa', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText aria-hidden="true" size={15} color="#34d399" />
            Histórico de versões
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((item, index) => (
              <article key={`${item.version}-${index}`} style={{ background: '#09090b', border: '1px solid #27272a', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ color: '#fafafa', fontSize: 13 }}>{item.title || `Versão ${item.version}`}</strong>
                    <span className="mono" style={{ color: '#34d399', fontSize: 11 }}>v{item.version}</span>
                  </div>
                  <time className="mono" dateTime={item.releasedAt} style={{ color: '#71717a', fontSize: 11 }}>{formatDate(item.releasedAt)}</time>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(item.changes || []).map(change => <li key={change} style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 1.45 }}>{change}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
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
