import React, { useState } from 'react';
import { X } from './Icons';
import { getApiBase, getStoredApiUrl, setApiUrl, isMixedContent, api } from '../api';

// Modal para configurar a URL do backend em runtime.
// Salva em localStorage (chave FM_API_URL) e testa a conexão via /health.
export default function ApiConfigModal({ onClose }) {
  const [value, setValue]   = useState(getStoredApiUrl() || getApiBase());
  const [status, setStatus] = useState(null); // { type: 'ok'|'err'|'testing', msg }

  const mixed = isMixedContent(value);

  async function handleTest() {
    setStatus({ type: 'testing', msg: 'Testando conexão...' });
    try {
      await api.ping(value);
      setStatus({ type: 'ok', msg: '✅ Conexão OK — backend respondeu.' });
    } catch (e) {
      setStatus({ type: 'err', msg: `❌ Falhou: ${e.message}. Verifique a URL, se o backend está no ar e o CORS/HTTPS.` });
    }
  }

  function handleSave() {
    setApiUrl(value);
    // Recarrega para que todos os componentes releiam a nova base.
    window.location.reload();
  }

  function handleReset() {
    setApiUrl('');
    window.location.reload();
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, width: '100%', maxWidth: 520, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', margin: 0 }}>Configuração da API</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex' }} title="Fechar">
            <X size={18} color="#a1a1aa" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#a1a1aa', margin: '0 0 16px', lineHeight: 1.5 }}>
          Endereço do backend. No <strong>celular</strong>, use um túnel <strong>HTTPS</strong> (ngrok/localtunnel).
          O IP local (<code style={{ color: '#10b981' }}>http://192.168.x.x:5000/api</code>) só funciona em rede local via HTTP.
        </p>

        <label style={{ fontSize: 12, color: '#71717a', display: 'block', marginBottom: 6 }}>URL do backend</label>
        <input
          value={value}
          onChange={e => { setValue(e.target.value); setStatus(null); }}
          placeholder="https://seu-tunel.ngrok-free.app/api"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#fafafa', padding: '10px 12px', borderRadius: 0, fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
        />

        {mixed && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '8px 10px', lineHeight: 1.5 }}>
            ⚠️ Esta página está em HTTPS e a URL usa HTTP. O navegador vai <strong>bloquear</strong> essas chamadas (mixed content). Use uma URL <strong>https://</strong> (túnel).
          </div>
        )}

        {status && (
          <div style={{ marginTop: 10, fontSize: 12, color: status.type === 'ok' ? '#10b981' : status.type === 'err' ? '#ef4444' : '#a1a1aa', lineHeight: 1.5 }}>
            {status.msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={handleTest}
            style={{ background: 'transparent', color: '#a1a1aa', border: '1px solid #27272a', padding: '9px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            Testar conexão
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleReset}
            style={{ background: 'transparent', color: '#71717a', border: 'none', padding: '9px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 13 }}
            title="Voltar ao padrão do build"
          >
            Limpar
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 0, cursor: value.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: value.trim() ? 1 : 0.6 }}
          >
            Salvar e recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
