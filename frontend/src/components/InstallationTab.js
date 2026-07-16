import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Download, ExternalLink, FileText, FolderOpen, Upload } from './Icons';
import { useExtensionUpdates } from '../providers/ExtensionUpdateProvider';

const EXTENSIONS_URL = 'chrome://extensions';
const card = { background: '#18181b', border: '1px solid #27272a', padding: 24 };
const button = { padding: '11px 18px', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

function formatBytes(value) {
  if (!value) return '';
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function Step({ number, title, children, icon: Icon }) {
  return (
    <li style={{ listStyle: 'none', background: '#09090b', border: '1px solid #3f3f46', padding: 18, display: 'flex', gap: 14 }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(16,185,129,.14)', color: '#34d399', fontWeight: 800 }}>{number}</span>
      <div>
        <h3 style={{ color: '#fafafa', fontSize: 14, margin: '1px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}><Icon aria-hidden="true" size={15} color="#34d399" />{title}</h3>
        <div style={{ color: '#b4b4bd', fontSize: 13, lineHeight: 1.6 }}>{children}</div>
      </div>
    </li>
  );
}

export default function InstallationTab() {
  const { extension, latest, isChecking, checkNow, openExtensionsPage } = useExtensionUpdates();
  const [copyState, setCopyState] = useState('idle');
  const [openState, setOpenState] = useState('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (copyState !== 'copied') return undefined;
    const timer = setTimeout(() => setCopyState('idle'), 5000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_URL);
      setCopyState('copied');
      setMessage('Endereço copiado. Cole-o na barra de endereços do Chrome.');
    } catch (_) {
      setCopyState('failed');
      setMessage('Digite chrome://extensions na barra de endereços do Chrome.');
    }
  }

  async function openExtensions() {
    setOpenState('opening');
    setMessage('Pedindo para a extensão abrir a página do Chrome…');
    const result = await openExtensionsPage();
    setOpenState(result.ok ? 'opened' : 'failed');
    setMessage(result.message);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={{ ...card, background: 'linear-gradient(135deg, rgba(16,185,129,.12), rgba(6,182,212,.06))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 430px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px', background: extension.installed ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)', border: `1px solid ${extension.installed ? 'rgba(16,185,129,.45)' : 'rgba(245,158,11,.45)'}`, color: extension.installed ? '#34d399' : '#fbbf24', fontSize: 12, fontWeight: 700 }}>
              {extension.installed ? <Check size={14} /> : <AlertTriangle size={14} />}
              {extension.installed ? `Extensão detectada — v${extension.version || '?'}` : 'Extensão ainda não detectada'}
            </span>
            <h2 style={{ color: '#fafafa', fontSize: 24, margin: '14px 0 8px' }}>Instalar a Friendly Miner no Chrome</h2>
            <p style={{ color: '#b4b4bd', fontSize: 14, lineHeight: 1.65, margin: 0 }}>Baixe o arquivo, extraia o ZIP e carregue a pasta que contém <span className="mono">manifest.json</span>. O Chrome não instala o ZIP diretamente.</p>
          </div>
          <div style={{ minWidth: 250, background: '#09090b', border: '1px solid #3f3f46', padding: 16 }}>
            <div style={{ color: '#a1a1aa', fontSize: 12 }}>Versão disponível</div>
            <strong className="mono" style={{ color: '#34d399', fontSize: 18 }}>{latest?.version || 'indisponível'}</strong>
            {latest?.sizeBytes && <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 9 }}>Tamanho: {formatBytes(latest.sizeBytes)}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
          {latest?.downloadUrl ? <a href={latest.downloadUrl} download rel="noopener noreferrer" style={{ ...button, background: '#10b981', border: '1px solid #10b981', color: '#fff', textDecoration: 'none' }}><Download size={16} /> Baixar extensão {latest.version}</a> : <button type="button" disabled style={{ ...button, background: '#27272a', border: '1px solid #52525b', color: '#a1a1aa' }}>Download indisponível</button>}
          <button type="button" onClick={openExtensions} disabled={openState === 'opening'} style={{ ...button, background: '#27272a', border: '1px solid #52525b', color: '#fafafa', cursor: 'pointer' }}><ExternalLink size={16} /> {openState === 'opening' ? 'Abrindo…' : 'Abrir extensões'}</button>
          <button type="button" onClick={copyAddress} style={{ ...button, background: '#27272a', border: '1px solid #52525b', color: '#fafafa', cursor: 'pointer' }}><FileText size={16} /> {copyState === 'copied' ? 'Endereço copiado' : 'Copiar endereço'}</button>
        </div>
        <p role="status" aria-live="polite" style={{ color: openState === 'failed' || copyState === 'failed' ? '#fca5a5' : '#a7f3d0', minHeight: 18, fontSize: 12, margin: '10px 0 0' }}>{message}</p>
        {latest?.sha256 && <p className="mono" style={{ color: '#a1a1aa', fontSize: 11, overflowWrap: 'anywhere', margin: '4px 0 0' }}>SHA-256: {latest.sha256}</p>}
      </section>

      <section aria-labelledby="installation-steps" style={card}>
        <h2 id="installation-steps" style={{ color: '#fafafa', fontSize: 18, margin: '0 0 6px' }}>Passo a passo no chrome://extensions</h2>
        <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' }}>Faça os passos na ordem e guarde a pasta extraída em um local permanente.</p>
        <ol style={{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Step number="1" title="Baixe o ZIP" icon={Download}>Clique em “Baixar extensão” e aguarde o download terminar.</Step>
          <Step number="2" title="Extraia os arquivos" icon={FolderOpen}>Escolha “Extrair tudo”. Abra a pasta extraída e confirme que <span className="mono">manifest.json</span> está dentro dela.</Step>
          <Step number="3" title="Abra as extensões" icon={ExternalLink}>Cole <span className="mono">chrome://extensions</span> na barra de endereços do Chrome e pressione Enter.</Step>
          <Step number="4" title="Ative o modo do desenvolvedor" icon={Upload}>Ligue “Modo do desenvolvedor”, no canto superior direito da página.</Step>
          <Step number="5" title="Carregue sem compactação" icon={FolderOpen}>Clique em “Carregar sem compactação” e selecione a pasta que contém <span className="mono">manifest.json</span>. Não selecione o ZIP.</Step>
          <Step number="6" title="Confirme a instalação" icon={Check}>A Friendly Miner deve aparecer na lista. Volte ao painel e clique em “Verificar instalação”.</Step>
        </ol>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <button type="button" onClick={checkNow} disabled={isChecking} style={{ ...button, background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.45)', color: '#a5f3fc', cursor: isChecking ? 'wait' : 'pointer' }}><Clock size={16} /> {isChecking ? 'Verificando…' : 'Verificar instalação'}</button>
        </div>
      </section>

      <section aria-labelledby="manual-update-steps" style={{ ...card, borderLeft: '3px solid #06b6d4' }}>
        <h2 id="manual-update-steps" style={{ color: '#fafafa', fontSize: 18, margin: '0 0 6px' }}>Como atualizar sem se perder</h2>
        <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' }}>Mantenha a mesma pasta da extensão: substitua os arquivos e use o botão de recarregar do Chrome.</p>
        <ol style={{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Step number="1" title="Baixar e extrair" icon={Download}>Baixe a nova versão e extraia o ZIP antes de continuar.</Step>
          <Step number="2" title="Substituir os arquivos" icon={FolderOpen}>Copie os arquivos extraídos para a pasta antiga da extensão e confirme a substituição.</Step>
          <Step number="3" title="Recarregar e verificar" icon={Check}>Abra <span className="mono">chrome://extensions</span>, recarregue a Friendly Miner, volte ao painel e clique em “Verificar instalação”.</Step>
        </ol>
        <div role="note" style={{ marginTop: 16, padding: '13px 15px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.28)', color: '#bbf7d0', fontSize: 13 }}>Seus leads continuam salvos no painel durante todo o processo.</div>
      </section>
    </div>
  );
}
