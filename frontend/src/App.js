import React, { useState, useRef } from 'react';
import Dashboard from './components/Dashboard';
import SearchList from './components/SearchList';
import ResultsTable from './components/ResultsTable';
import ScraperTab from './components/ScraperTab';
import ProspectTab from './components/ProspectTab';
import { api } from './api';
import { BarChart3, Search, FolderOpen, MessageCircle, Upload, ChevronLeft } from './components/Icons';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'scraper',   label: 'Buscar Leads', icon: Search },
  { id: 'searches',  label: 'Importações', icon: FolderOpen },
  { id: 'prospect',  label: 'Prospecção', icon: MessageCircle },
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
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <header className="responsive-header" style={{ background: '#18181b', borderBottom: '1px solid #27272a', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div onClick={() => setTab('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} title="Ir para o Dashboard">
          <img src="/logo-miner.jpg" alt="Friendly Miner Logo" style={{ width: 36, height: 36, borderRadius: 0, objectFit: 'cover', border: '2px solid #10b981', boxShadow: '0 0 8px rgba(16,185,129,0.2)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', lineHeight: 1.2 }}>Friendly Miner</div>
            <div style={{ fontSize: 11, color: '#52525b', lineHeight: 1.2 }}>Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} className="nav-btn"
              style={{
                background: tab === n.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: tab === n.id ? '#10b981' : '#a1a1aa',
                border: tab === n.id ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                padding: '7px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
              <n.icon size={15} color={tab === n.id ? '#10b981' : '#a1a1aa'} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {/* Upload */}
        <div className="upload-btn-container" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {uploadMsg && <span style={{ fontSize: 13, color: uploadMsg.includes('✅') ? '#10b981' : '#ef4444' }}>{uploadMsg}</span>}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 0, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            {uploading ? <><Spinner /> Importando...</> : <><Upload size={14} /> Importar CSV</>}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="responsive-padding" style={{ flex: 1, padding: '32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

         {/* Dashboard tab */}
        {tab === 'dashboard' && (
          <Dashboard onSelectSearch={handleSelectSearch} onGoTo={setTab} onImportCSV={() => fileRef.current?.click()} />
        )}

        {/* Scraper tab */}
        {tab === 'scraper' && <ScraperTab />}

        {/* Prospect tab */}
        {tab === 'prospect' && <ProspectTab />}

        {/* Searches tab */}
        {tab === 'searches' && (
          <div className="responsive-grid-searches" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
            <div>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fafafa' }}>Importações</h2>
                <p style={{ color: '#52525b', fontSize: 13 }}>Selecione uma para ver os dados</p>
              </div>
              <SearchList 
                onSelectSearch={handleSelectSearch} 
                selectedId={selectedSearch?.id} 
                onDeleted={(deletedId) => { if (selectedSearch?.id === deletedId) setSelectedSearch(null); }}
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              {selectedSearch
                ? <ResultsTable search={selectedSearch} />
                : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: '#27272a', flexDirection: 'column', gap: 16, border: '2px dashed #27272a', borderRadius: 0 }}>
                    <ChevronLeft size={36} color="#52525b" />
                    <p style={{ color: '#a1a1aa', fontSize: 15 }}>Selecione uma importação na lista</p>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Results tab (via click em "Ver dados") */}
        {tab === 'results' && selectedSearch && (
          <div>
            <button onClick={() => setTab('dashboard')}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              ← Voltar ao Dashboard
            </button>
            <ResultsTable search={selectedSearch} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '16px 32px', borderTop: '1px solid #18181b', color: '#3f3f46', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Friendly Miner Dashboard — Backend: porta 5000 &nbsp;|&nbsp; Frontend: porta {window.location.port || '3005'}
      </footer>
    </div>
  );
}
