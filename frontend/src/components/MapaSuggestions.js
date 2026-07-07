import React from 'react';
import { gmapsSearchUrl } from '../utils/geo';
import { Lightbulb, Target, ExternalLink, MapPin } from './Icons';

const num = (v) => (Number(v || 0)).toLocaleString('pt-BR');
const popShort = (p) => p >= 1000000 ? `${(p / 1000000).toFixed(1)} mi` : p >= 1000 ? `${Math.round(p / 1000)} mil` : String(p);

const selStyle = {
  background: '#0f0f11', border: '1px solid #27272a', color: '#fafafa',
  fontSize: 12, padding: '6px 8px', borderRadius: 0, outline: 'none',
};

// Painel de sugestões inteligentes da aba Mapa.
// EXPANDIR: tema que você já domina numa cidade vizinha ainda não pesquisada.
// APROFUNDAR: cidade já visitada com tema que você nunca buscou lá.
// As estimativas vêm de densidade medida × população (Censo 2022) — são uma
// projeção honesta do seu próprio histórico, não um número real.
export default function MapaSuggestions({
  loading, error, suggestions, deepen, themeOptions, controls, onControls, onFocus,
}) {
  const labelOf = (tk) => themeOptions.find(t => t.key === tk)?.label || tk;
  const colorOf = (tk) => themeOptions.find(t => t.key === tk)?.color || '#a1a1aa';

  const card = { background: '#18181b', border: '1px solid #27272a', padding: '10px 12px' };
  const gBtn = {
    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981',
    fontSize: 11, fontWeight: 600, padding: '4px 8px', cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  const ghostBtn = {
    background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa',
    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Lightbulb size={15} color="#f59e0b" /> Sugestões inteligentes
          </h3>
          <p style={{ color: '#52525b', fontSize: 12, margin: '2px 0 0' }}>
            Estimativas projetadas do seu próprio histórico: densidade medida × população (Censo 2022)
          </p>
        </div>

        {/* Filtros — inclui o "leads potenciais" como filtro mínimo */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={controls.themeKey} onChange={e => onControls({ themeKey: e.target.value })} style={selStyle} title="Filtrar por tema">
            <option value="">Todos os temas</option>
            {themeOptions.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={controls.maxKm} onChange={e => onControls({ maxKm: Number(e.target.value) })} style={selStyle} title="Raio de busca das vizinhas">
            <option value={50}>até 50 km</option>
            <option value={100}>até 100 km</option>
            <option value={150}>até 150 km</option>
            <option value={300}>até 300 km</option>
          </select>
          <select value={controls.minEst} onChange={e => onControls({ minEst: Number(e.target.value) })} style={selStyle} title="Mínimo de leads estimados">
            <option value={0}>sem mínimo</option>
            <option value={5}>≥ 5 leads est.</option>
            <option value={10}>≥ 10 leads est.</option>
            <option value={20}>≥ 20 leads est.</option>
            <option value={50}>≥ 50 leads est.</option>
          </select>
        </div>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {loading && !error && <p style={{ color: '#52525b', fontSize: 13 }}>Calculando sugestões…</p>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>

          {/* EXPANDIR */}
          <div>
            <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={12} color="#f59e0b" /> Expandir — cidades vizinhas ainda não pesquisadas
            </div>
            {suggestions.length === 0 && (
              <p style={{ color: '#52525b', fontSize: 12 }}>Nenhuma sugestão com esses filtros. Aumente o raio ou reduza o mínimo.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map(s => (
                <div key={s.muni.code} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fafafa' }}>
                      {s.muni.nome} <span style={{ color: '#52525b', fontWeight: 400 }}>— {s.muni.uf}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#71717a', whiteSpace: 'nowrap' }}>
                      {s.dist} km de {s.from?.nome}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#a1a1aa', margin: '4px 0 8px' }}>
                    pop. {popShort(s.muni.pop)} ·{' '}
                    {s.ests.slice(0, 3).map((e, i) => (
                      <span key={e.themeKey}>
                        {i > 0 && ' · '}
                        <span style={{ color: colorOf(e.themeKey), fontWeight: 600 }}>~{num(e.est)}</span> {labelOf(e.themeKey)}
                      </span>
                    ))}
                    <span style={{ color: '#52525b' }}> (estimado)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={gmapsSearchUrl(labelOf(s.ests[0].themeKey), s.muni)} target="_blank" rel="noreferrer" style={gBtn}>
                      <ExternalLink size={11} /> Minerar no Google Maps
                    </a>
                    <button onClick={() => onFocus(s.muni)} style={ghostBtn}>
                      <MapPin size={11} /> Ver no mapa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* APROFUNDAR */}
          <div>
            <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={12} color="#8b5cf6" /> Aprofundar — temas parados em cidades já visitadas
            </div>
            {deepen.length === 0 && (
              <p style={{ color: '#52525b', fontSize: 12 }}>Nada por aqui — você já cruzou todos os temas nas suas cidades.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deepen.map(d => (
                <div key={`${d.muni.code}:${d.themeKey}`} style={card}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fafafa' }}>
                    <span style={{ color: colorOf(d.themeKey) }}>{labelOf(d.themeKey)}</span> em {d.muni.nome}
                  </div>
                  <div style={{ fontSize: 12, color: '#a1a1aa', margin: '4px 0 8px' }}>
                    você nunca buscou esse tema aqui · <span style={{ fontWeight: 600, color: '#fafafa' }}>~{num(d.est)}</span> estimados
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={gmapsSearchUrl(labelOf(d.themeKey), d.muni)} target="_blank" rel="noreferrer" style={gBtn}>
                      <ExternalLink size={11} /> Minerar no Google Maps
                    </a>
                    <button onClick={() => onFocus(d.muni)} style={ghostBtn}>
                      <MapPin size={11} /> Ver no mapa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
