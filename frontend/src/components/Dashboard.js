import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export default function Dashboard({ onSelectSearch }) {
    const [metrics, setMetrics] = useState(null);
    const [charts, setCharts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const resMetrics = await api.getMetrics();
            const resCharts = await api.getCharts();

            if (resMetrics.success) setMetrics(resMetrics.data);
            if (resCharts.success) setCharts(resCharts.data);
        } catch (e) {
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

    if (loading) return <p style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Carregando métricas e gráficos...</p>;

    const maxCat = metrics?.topCategories?.[0]?.count || 1;
    const recentSearches = metrics?.recentSearches || [];
    const resultsByDate = charts?.resultsByDate || [];

    // Calcular o máximo para o gráfico de linhas/barras de evolução de leads
    const maxLeadsByDate = resultsByDate.reduce((max, curr) => curr.count > max ? curr.count : max, 0) || 1;

    const cardStyle = {
        background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
        padding: 24, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '16px 20px', borderRadius: 12, fontSize: 14 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                {[
                    { icon: '🔍', label: 'Total de Buscas',    value: metrics?.totalSearches ?? 0 },
                    { icon: '📍', label: 'Total de Leads',     value: (metrics?.totalResults ?? 0).toLocaleString('pt-BR') },
                    { icon: '⭐', label: 'Avaliação Média',     value: metrics?.avgRating ? Number(metrics.avgRating).toFixed(1) : '0.0' },
                    { icon: '🏷️', label: 'Categorias',          value: metrics?.topCategories?.length ?? 0 },
                ].map((c, i) => (
                    <div key={i} style={cardStyle}>
                        <span style={{ fontSize: '1.8rem' }}>{c.icon}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{c.label}</span>
                        <span style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{c.value}</span>
                    </div>
                ))}
            </div>

            {/* Seção de Gráficos SVG */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
                {/* Gráfico 1: Evolução de Captação */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 24 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>📈 Histórico de Leads (Últimos Dias)</h3>
                    {resultsByDate.length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Sem dados históricos suficientes.</p>
                    ) : (
                        <div style={{ width: '100%', height: 200, display: 'flex', flexDirection: 'column' }}>
                            {/* Gráfico de Barras SVG Nativo */}
                            <svg viewBox="0 0 500 180" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                {/* Linhas de grade horizontais */}
                                <line x1="40" y1="20" x2="480" y2="20" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
                                <line x1="40" y1="75" x2="480" y2="75" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
                                <line x1="40" y1="130" x2="480" y2="130" stroke="#334155" strokeWidth="0.5" />
                                
                                {resultsByDate.map((d, index) => {
                                    const length = resultsByDate.length;
                                    const gap = 400 / (length || 1);
                                    const x = 50 + index * gap;
                                    const barHeight = Math.max(8, (d.count / maxLeadsByDate) * 110);
                                    const y = 130 - barHeight;

                                    return (
                                        <g key={index}>
                                            {/* Gradiente da barra */}
                                            <defs>
                                                <linearGradient id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#3b82f6" />
                                                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
                                                </linearGradient>
                                            </defs>
                                            
                                            {/* Barra */}
                                            <rect x={x} y={y} width="16" height={barHeight} rx="3" fill={`url(#gradient-${index})`} />
                                            
                                            {/* Valor sobre a barra */}
                                            <text x={x + 8} y={y - 6} fill="#cbd5e1" fontSize="9" fontWeight="600" textAnchor="middle">
                                                {d.count}
                                            </text>
                                            
                                            {/* Data (Eixo X) */}
                                            <text x={x + 8} y="150" fill="#64748b" fontSize="9" textAnchor="middle">
                                                {d.date.split('/')[0] + '/' + d.date.split('/')[1]}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    )}
                </div>

                {/* Gráfico 2: Ranking de Categorias */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 24 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>🏷️ Maiores Categorias Capilares</h3>
                    {metrics?.topCategories?.length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Nenhuma categoria registrada.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {metrics?.topCategories?.slice(0, 5).map((cat, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 12, color: '#cbd5e1', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cat.category}>
                                        {cat.category || '(sem categoria)'}
                                    </span>
                                    <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', width: `${Math.round((cat.count / maxCat) * 100)}%` }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: '#64748b', width: 35, textAlign: 'right', fontWeight: 600 }}>{cat.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Como Usar o Extrator Chrome (Tudo-em-Um) */}
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: 20, padding: 28 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'flex', alignItems: 'center', justify: 'center', fontSize: 22 }}>🔌</div>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Ative seu Extrator do Google Maps Integrado</h3>
                        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Instale a extensão em seu navegador para capturar leads do Maps e enviá-los diretamente para cá.</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 20 }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>PASSO 1</div>
                        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>Acesse <code style={{ color: '#a78bfa' }}>chrome://extensions</code> no Chrome, ative o <strong>Modo do desenvolvedor</strong> no canto superior direito.</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>PASSO 2</div>
                        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>Clique em <strong>Carregar sem compactação</strong> e selecione a pasta <code style={{ color: '#a78bfa' }}>extension/</code> localizada na raiz do projeto.</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>PASSO 3</div>
                        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>Abra o popup da extensão, clique em <strong>Salvar URL</strong>, navegue no Google Maps e clique em <strong>Enviar ao Dashboard</strong>.</p>
                    </div>
                </div>
            </div>

            {/* Importações Recentes */}
            {recentSearches.length > 0 && (
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>📋 Histórico de Importações Recentes</h2>
                    <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    {['Arquivo', 'Resultados', 'Origem', 'Data', ''].map((h, i) => (
                                        <th key={i} style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 500, borderBottom: '1px solid #334155', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recentSearches.map(s => (
                                    <tr key={s.id}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        style={{ transition: 'background 0.15s' }}>
                                        <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>{s.filename}</td>
                                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{(s.total_results || 0).toLocaleString('pt-BR')} leads</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ 
                                                background: s.source === 'extension' ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)', 
                                                color: s.source === 'extension' ? '#a78bfa' : '#3b82f6', 
                                                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 
                                            }}>
                                                {s.source === 'extension' ? '🔌 Extensão Chrome' : '📂 Planilha CSV/Excel'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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

            {!metrics?.totalSearches && (
                <div style={{ marginTop: 40, textAlign: 'center', color: '#475569' }}>
                    <div style={{ fontSize: '4rem', marginBottom: 16 }}>📂</div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>Nenhum dado importado</h3>
                    <p style={{ fontSize: 14 }}>
                        Adicione planilhas CSV/Excel na pasta <code style={{ color: '#3b82f6' }}>resultados/</code>, faça o upload acima ou comece a enviar leads da extensão!
                    </p>
                </div>
            )}
        </div>
    );
}
