import React from 'react';

// Mini simulação fiel da barra do chrome://extensions para eliminar dúvidas visuais.
export default function ChromeGuideMockup({ mode = 'install' }) {
  const isUpdate = mode === 'update';

  return (
    <div
      aria-label={isUpdate ? 'Exemplo visual de onde clicar em Recarregar no Chrome' : 'Exemplo visual de onde ativar Modo do desenvolvedor e Carregar sem compactação no Chrome'}
      style={{
        background: '#09090b',
        border: '1px solid #27272a',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}
    >
      {/* Barra simulada do chrome://extensions */}
      <div
        style={{
          background: '#141418',
          borderBottom: '1px solid #27272a',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7' }}>Extensões</span>
          {!isUpdate && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '5px 10px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid #10b981',
                color: '#34d399',
              }}
            >
              2. Carregar sem compactação
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: !isUpdate ? '#34d399' : '#a1a1aa', fontWeight: !isUpdate ? 700 : 500 }}>
            {!isUpdate ? '1. Modo do desenvolvedor' : 'Modo do desenvolvedor'}
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 18,
              borderRadius: 999,
              background: '#10b981',
              padding: 2,
              display: 'inline-flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#041d15' }} />
          </span>
        </div>
      </div>

      {/* Área do card da extensão no Chrome */}
      <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo-miner.jpg"
            alt=""
            style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: '1px solid #27272a' }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fafafa' }}>Friendly Miner Extractor</div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              {isUpdate ? 'Clique no ícone de recarregar (↻) abaixo' : 'Ou simplesmente arraste a pasta preparada para cá'}
            </div>
          </div>
        </div>

        {isUpdate ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.16)',
              border: '1px solid #10b981',
              color: '#34d399',
            }}
          >
            ↻ Recarregar
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#71717a',
              border: '1px dashed #3f3f46',
              padding: '5px 10px',
              borderRadius: 6,
            }}
          >
            manifest.json detectado ✓
          </span>
        )}
      </div>
    </div>
  );
}
