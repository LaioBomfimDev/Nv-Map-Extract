import React, { useState, useRef } from 'react';
import Dashboard from './components/Dashboard';
import SearchList from './components/SearchList';
import ResultsTable from './components/ResultsTable';
import { api } from './api';

const NAV = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'searches',  label: '📁 Importações' },
];

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

export default function App() {
  const [tab, setTab]               = useState('dashboard');
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadMsg, setUploadMsg]   = useState('');
  const fileRef = useRef();

  function handleSelectSearch(s) {
    setSelectedSearch(s);
    setTab('results');
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const res = await api.uploadFile(file);
      if (res.success) {
        setUploadMsg(`✅ Importado: ${res.data?.records || 0} registros`);
        setTab('dashboard');
      } else {
        setUploadMsg('❌ ' + (res.message || 'Erro ao importar'));
      }
    } catch {
      setUploadMsg('❌ Servidor indisponível');
    }
    setUploading(false);
    e.target.value = '';
    setTimeout(() => setUploadMsg(''), 5000);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🗺️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>Maps Search</div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2 }}>Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{
                background: tab === n.id ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: tab === n.id ? '#3b82f6' : '#94a3b8',
                border: tab === n.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
              }}>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Upload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {uploadMsg && <span style={{ fontSize: 13, color: uploadMsg.startsWith('✅') ? '#22c55e' : '#ef4444' }}>{uploadMsg}</span>}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            {uploading ? <><Spinner /> Importando...</> : '📂 Importar CSV'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

        {/* Dashboard tab */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Dashboard</h1>
              <p style={{ color: '#64748b', fontSize: 14 }}>Visão geral dos dados extraídos do Google Maps</p>
            </div>
            <Dashboard onSelectSearch={handleSelectSearch} />
          </div>
        )}

        {/* Searches tab */}
        {tab === 'searches' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
            <div>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>Importações</h2>
                <p style={{ color: '#64748b', fontSize: 13 }}>Selecione uma para ver os dados</p>
              </div>
              <SearchList onSelectSearch={handleSelectSearch} selectedId={selectedSearch?.id} />
            </div>
            <div>
              {selectedSearch
                ? <ResultsTable search={selectedSearch} />
                : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: '#334155', flexDirection: 'column', gap: 16, border: '2px dashed #334155', borderRadius: 20 }}>
                    <div style={{ fontSize: '3rem' }}>👈</div>
                    <p style={{ color: '#64748b', fontSize: 15 }}>Selecione uma importação na lista</p>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Results tab (via click em "Ver dados") */}
        {tab === 'results' && selectedSearch && (
          <div>
            <button onClick={() => setTab('dashboard')}
              style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              ← Voltar ao Dashboard
            </button>
            <ResultsTable search={selectedSearch} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '16px 32px', borderTop: '1px solid #1e293b', color: '#334155', fontSize: 12 }}>
        Maps Search Dashboard — Backend: porta 5000 &nbsp;|&nbsp; Frontend: porta 3000
      </footer>
    </div>
  );
}
