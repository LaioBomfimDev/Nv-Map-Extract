import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export default function Dashboard({ onSelectSearch }) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const res = await api.getMetrics();
            if (res.success) setMetrics(res.data);
        } catch {
            setError('Não foi possível conectar ao backend. Verifique se o servidor está rodando na porta 5000.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    if (loading) return <p style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Carregando métricas...</p>;

    const maxCat = metrics?.topCategories?.[0]?.count || 1;

    const cardStyle = {
        background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
        padding: 24, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default',
    };

    return (
        <div>
            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '16px 20px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                {[
                    { icon: '🔍', label: 'Total de Buscas',    value: metrics?.totalSearches ?? 0 },
                    { icon: '📍', label: 'Total de Resultados', value: (metrics?.totalResults ?? 0).toLocaleString('pt-BR') },
                    { icon: '⭐', label: 'Avaliação Média',     value: metrics?.avgRating ?? '0.0' },
                    { icon: '🏷️', label: 'Categorias',          value: metrics?.topCategories?.length ?? 0 },
                ].map((c, i) => (
                    <div key={i} style={cardStyle}>
                        <span style={{ fontSize: '1.8rem' }}>{c.icon}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{c.label}</span>
                        <span style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{c.value}</span>
                    </div>
                ))}
            </div>

            {/* Recent searches */}
            {metrics?.recentSearches?.length > 0 && (
                <div style={{ marginTop: 32 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>📋 Importações Recentes</h2>
                    <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    {['Arquivo', 'Resultados', 'Status', 'Data', ''].map((h, i) => (
                                        <th key={i} style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 500, borderBottom: '1px solid #334155', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.recentSearches.map(s => (
                                    <tr key={s.id}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        style={{ transition: 'background 0.15s' }}>
                                        <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>{s.filename}</td>
                                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{(s.total_results || 0).toLocaleString('pt-BR')}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                                                {s.status || 'completed'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => onSelectSearch(s)}
                                                style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                                                Ver dados
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Top Categories */}
            {metrics?.topCategories?.length > 0 && (
                <div style={{ marginTop: 32 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>🏷️ Top Categorias</h2>
                    <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', padding: '20px 24px' }}>
                        {metrics.topCategories.map((cat, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <span style={{ fontSize: 13, color: '#cbd5e1', width: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cat.category}>
                                    {cat.category || '(sem categoria)'}
                                </span>
                                <div style={{ flex: 1, height: 8, background: '#334155', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', width: `${Math.round((cat.count / maxCat) * 100)}%` }} />
                                </div>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, textAlign: 'right' }}>{cat.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!error && metrics?.totalSearches === 0 && (
                <div style={{ marginTop: 60, textAlign: 'center', color: '#475569' }}>
                    <div style={{ fontSize: '4rem', marginBottom: 16 }}>📂</div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>Nenhum dado ainda</h3>
                    <p style={{ fontSize: 14 }}>
                        Coloque arquivos CSV na pasta <code style={{ color: '#3b82f6' }}>resultados/</code> ou use o botão <strong>"Importar CSV"</strong> no topo.
                    </p>
                </div>
            )}
        </div>
    );
}
