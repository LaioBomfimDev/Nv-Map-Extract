import React from 'react';
import { AlertTriangle } from './Icons';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Mantém o detalhe no console para diagnóstico sem expor dados da sessão na tela.
    console.error('[Friendly Miner] Erro inesperado na interface', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: 'min(520px,100%)', background: '#18181b', border: '1px solid rgba(239,68,68,.45)', padding: 28 }}>
          <AlertTriangle size={28} color="#ef4444" />
          <h1 style={{ fontSize: 20, margin: '14px 0 8px' }}>O painel encontrou um erro inesperado</h1>
          <p style={{ color: '#d4d4d8', fontSize: 14, lineHeight: 1.6 }}>
            Seus leads continuam salvos. Recarregue a página; se o problema continuar, abra Atualizações e envie o diagnóstico ao suporte.
          </p>
          <button type="button" onClick={() => window.location.reload()}
            style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>
            Recarregar painel
          </button>
        </div>
      </main>
    );
  }
}
