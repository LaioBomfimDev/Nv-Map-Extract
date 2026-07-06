import React, { useState, useEffect } from 'react';
import { Sparkles, Zap, Phone, Globe, Instagram, Search, Rocket, Monitor, Target } from './Icons';

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

export default function ScraperTab() {
  const [hasExt, setHasExt] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [msg, setMsg] = useState('');

  // Detecta a extensão (o authBridge marca o <html> com data-fm-extension="1").
  useEffect(() => {
    let tries = 0;
    const check = () => {
      const ok = document.documentElement.getAttribute('data-fm-extension') === '1';
      setHasExt(ok);
      if (!ok && tries++ < 20) setTimeout(check, 500); // tenta por ~10s
    };
    check();
  }, []);

  function minerar(e) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    const query = city.trim() ? `${kw} em ${city.trim()}` : kw;
    window.postMessage({ __fm: 'site', action: 'startSearch', query }, '*');
    setMsg(`🚀 Mineração iniciada para "${query}". Uma janela do Maps vai abrir, minerar e fechar sozinha. Os leads aparecem no Dashboard em instantes.`);
    setTimeout(() => setMsg(''), 12000);
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

        {hasExt ? (
          <form onSubmit={minerar} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input style={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="Ex: dentistas, restaurantes, academias..." />
            <input style={{ ...inputStyle, flex: '0 1 220px' }} value={city} onChange={e => setCity(e.target.value)}
              placeholder="Cidade (ex: São Paulo)" />
            <button type="submit" disabled={!keyword.trim()}
              style={{
                background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none',
                padding: '11px 22px', borderRadius: 0, cursor: keyword.trim() ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: keyword.trim() ? 1 : 0.6,
              }}>
              <Rocket size={16} /> Minerar
            </button>
          </form>
        ) : (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', padding: 16, color: '#fca5a5', fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: '#fecaca' }}>Extensão não detectada.</strong> Para minerar, instale a
            extensão Friendly Miner no Chrome (no computador) e mantenha esta aba aberta. No celular
            você consegue ver e gerenciar os leads, mas a mineração é feita no computador.
          </div>
        )}

        {msg && (
          <div style={{ marginTop: 16, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: 14, color: '#6ee7b7', fontSize: 13, lineHeight: 1.5 }}>
            {msg}
          </div>
        )}
      </div>

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
