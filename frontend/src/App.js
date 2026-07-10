import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import SearchList from './components/SearchList';
import LoginScreen from './components/LoginScreen';
import { api } from './api';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { BarChart3, Search, FolderOpen, MessageCircle, Upload, Download, ChevronLeft, Map as MapIcon, Target } from './components/Icons';

// Abas pesadas carregadas sob demanda (code splitting): cada uma vira um chunk
// separado, baixado só quando a aba é aberta pela primeira vez — em vez de tudo
// no bundle inicial. ResultsTable arrasta o MapView junto no mesmo chunk.
const Dashboard    = lazy(() => import('./components/Dashboard'));
const ResultsTable = lazy(() => import('./components/ResultsTable'));
const ScraperTab   = lazy(() => import('./components/ScraperTab'));
const ProspectTab  = lazy(() => import('./components/ProspectTab'));
const MapaTab      = lazy(() => import('./components/MapaTab'));
const CampaignsTab = lazy(() => import('./components/CampaignsTab'));
const UpdatesTab   = lazy(() => import('./components/UpdatesTab'));

function TabFallback() {
  return <p style={{ color: '#52525b', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Carregando…</p>;
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'scraper',   label: 'Buscar Leads', icon: Search },
  { id: 'searches',  label: 'Importações', icon: FolderOpen },
  { id: 'mapa',      label: 'Mapa', icon: MapIcon },
  { id: 'prospect',  label: 'Prospecção', icon: MessageCircle },
  { id: 'campaigns', label: 'Campanhas', icon: Target },
  { id: 'updates',   label: 'Atualizações', icon: Download },
];

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

// Mantém a aba viva depois da primeira visita: monta só quando é aberta pela
// primeira vez e, ao trocar de aba, apenas esconde com display:none. Assim o
// estado e os dados já buscados permanecem — voltar não refaz os fetches.
function TabPanel({ active, children }) {
  const [mounted, setMounted] = useState(active);
  useEffect(() => { if (active) setMounted(true); }, [active]);
  if (!mounted) return null;
  return (
    <div style={{ display: active ? 'block' : 'none' }}>
      <Suspense fallback={<TabFallback />}>{children}</Suspense>
    </div>
  );
}

// Parser CSV simples (lida com aspas e vírgulas dentro de campos).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignora */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// Converte uma planilha CSV em objetos de lead compatíveis com import_leads.
function csvToLeads(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const pick = (obj, keys) => { for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k]; return ''; };
  return rows.slice(1).map(cols => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (cols[i] || '').trim(); });
    return {
      name: pick(o, ['name', 'nome', 'title', 'título', 'titulo']),
      phone: pick(o, ['phone', 'telefone', 'fone', 'celular']),
      website: pick(o, ['website', 'site', 'url']),
      address: pick(o, ['address', 'endereço', 'endereco']),
      email: pick(o, ['email', 'e-mail']),
      category: pick(o, ['category', 'categoria', 'ramo']),
      rating: pick(o, ['rating', 'avaliação', 'avaliacao', 'nota']),
      reviews_count: pick(o, ['reviews_count', 'reviews', 'avaliações', 'avaliacoes']),
      latitude: pick(o, ['latitude', 'lat']),
      longitude: pick(o, ['longitude', 'lng', 'lon']),
      place_id: pick(o, ['place_id', 'placeid']),
      instagram: pick(o, ['instagram']),
      facebook: pick(o, ['facebook']),
      linkedin: pick(o, ['linkedin']),
      twitter: pick(o, ['twitter']),
      youtube: pick(o, ['youtube']),
    };
  }).filter(l => l.name);
}

export default function App() {
  const [session, setSession]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab]               = useState('dashboard');
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadMsg, setUploadMsg]   = useState('');
  const fileRef = useRef();

  // Sessão do Supabase: carrega a atual e escuta mudanças (login/logout).
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setAuthLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  function handleSelectSearch(s) {
    setSelectedSearch(s);
    setTab('results');
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSelectedSearch(null);
    setTab('dashboard');
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const text = await file.text();
      const leads = csvToLeads(text);
      if (!leads.length) throw new Error('Nenhum lead válido na planilha');
      const keyword = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      const res = await api.importLeads(keyword, '', leads);
      const d = res.data || {};
      setUploadMsg(`✅ Importado: ${d.inserted || 0} novos, ${d.merged || 0} mesclados`);
      setTab('dashboard');
    } catch (err) {
      setUploadMsg('❌ ' + (err.message || 'Erro ao importar'));
    }
    setUploading(false);
    e.target.value = '';
    setTimeout(() => setUploadMsg(''), 6000);
  }

  // ── Estados de autenticação ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Spinner />
      </div>
    );
  }
  if (!session) return <LoginScreen />;

  const userEmail = session.user?.email || '';

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

        {/* Upload + Usuário */}
        <div className="upload-btn-container" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {uploadMsg && <span style={{ fontSize: 13, color: uploadMsg.includes('✅') ? '#10b981' : '#ef4444' }}>{uploadMsg}</span>}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 0, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            {uploading ? <><Spinner /> Importando...</> : <><Upload size={14} /> Importar CSV</>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6, borderLeft: '1px solid #27272a' }}>
            <span title={userEmail} style={{ fontSize: 12, color: '#a1a1aa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</span>
            <button
              onClick={handleLogout}
              title="Sair"
              style={{ background: 'transparent', color: '#a1a1aa', border: '1px solid #27272a', padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="responsive-padding" style={{ flex: 1, padding: '32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

         {/* Dashboard tab */}
        <TabPanel active={tab === 'dashboard'}>
          <Dashboard onSelectSearch={handleSelectSearch} onGoTo={setTab} onImportCSV={() => fileRef.current?.click()} />
        </TabPanel>

        {/* Scraper tab (instruções da extensão) */}
        <TabPanel active={tab === 'scraper'}><ScraperTab /></TabPanel>

        {/* Mapa tab */}
        <TabPanel active={tab === 'mapa'}><MapaTab /></TabPanel>

        {/* Prospect tab */}
        <TabPanel active={tab === 'prospect'}><ProspectTab /></TabPanel>

        {/* Campaigns tab */}
        <TabPanel active={tab === 'campaigns'}><CampaignsTab /></TabPanel>

        {/* Updates tab */}
        <TabPanel active={tab === 'updates'}><UpdatesTab /></TabPanel>

        {/* Searches tab */}
        <TabPanel active={tab === 'searches'}>
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
        </TabPanel>

        {/* Results tab (via click em "Ver dados") */}
        {tab === 'results' && selectedSearch && (
          <div>
            <button onClick={() => setTab('dashboard')}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              ← Voltar ao Dashboard
            </button>
            <Suspense fallback={<TabFallback />}>
              <ResultsTable search={selectedSearch} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '16px 32px', borderTop: '1px solid #18181b', color: '#3f3f46', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Friendly Miner Dashboard — conectado como {userEmail}
      </footer>
    </div>
  );
}
