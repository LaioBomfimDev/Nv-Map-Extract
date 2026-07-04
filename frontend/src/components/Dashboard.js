import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getWhatsAppUrl } from '../statuses';
import { Search, MapPin, Star, Tag, MessageCircle, Clock, Lightbulb, Building2, TrendingUp, FileText, Plug, FolderOpen, Rocket, Upload, ArrowRight, DynIcon, AlertTriangle } from './Icons';

export default function Dashboard({ onSelectSearch, onGoTo, onImportCSV }) {
    const [metrics, setMetrics] = useState(null);
    const [charts, setCharts] = useState(null);
    const [summary, setSummary] = useState(null);
    const [modalLead, setModalLead] = useState(null);
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

            try {
                const resSummary = await api.getProspectSummary();
                if (resSummary.success) setSummary(resSummary.data);
            } catch (e) { /* resumo é opcional */ }
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

    if (loading) return <p style={{ color: '#52525b', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Carregando métricas e gráficos...</p>;

    const maxCat = metrics?.topCategories?.[0]?.count || 1;
    const recentSearches = metrics?.recentSearches || [];
    const resultsByDate = charts?.resultsByDate || [];
    const statusCounts = summary?.statusCounts || {};
    const followUps = summary?.followUps || { count: 0, sample: [] };
    const suggestions = (summary?.suggestions || []).filter(s => s.count > 0);

    // Calcular o máximo para o gráfico de linhas/barras de evolução de leads
    const maxLeadsByDate = resultsByDate.reduce((max, curr) => curr.count > max ? curr.count : max, 0) || 1;

    const cardStyle = {
        background: '#18181b', border: '1px solid #27272a', borderRadius: 0,
        padding: 24, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default',
        borderLeft: '3px solid #10b981'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '16px 20px', borderRadius: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} color="#ef4444" />
                    <span>{error}</span>
                </div>
            )}

            {/* Hero Section */}
            <div className="neon-glow" style={{
                background: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
                border: '1px solid #27272a',
                borderRadius: 0,
                padding: '40px 32px',
                display: 'flex',
                alignItems: 'center',
                gap: 32,
                flexWrap: 'wrap',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Efeitos de brilho de fundo (glow neon esmeralda) */}
                <div style={{ position: 'absolute', top: '-50%', left: '-20%', width: 300, height: 300, background: 'rgba(16,185,129,0.06)', filter: 'blur(80px)', borderRadius: 0, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-50%', right: '-10%', width: 250, height: 250, background: 'rgba(6,182,212,0.06)', filter: 'blur(80px)', borderRadius: 0, pointerEvents: 'none' }} />

                {/* Imagem da Logo */}
                <div style={{ position: 'relative', flexShrink: 0, margin: '0 auto' }}>
                    <div style={{
                        position: 'absolute', inset: -4,
                        background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                        borderRadius: 0, filter: 'blur(4px)', opacity: 0.7,
                    }} />
                    <img src="/logo-miner.jpg" alt="Friendly Miner Logo" style={{
                        width: 96, height: 96, borderRadius: 0, objectFit: 'cover',
                        border: '4px solid #18181b', position: 'relative', zIndex: 1,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }} />
                </div>

                {/* Texto & Apresentação */}
                <div style={{ flex: '1 1 350px', zIndex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PROSPECÇÃO ATIVA</span>
                        <span style={{ color: '#52525b', fontSize: 13 }}>•</span>
                        <span style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 500 }}>Inteligência Geográfica</span>
                    </div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fafafa', marginBottom: 8, letterSpacing: '-0.02em' }}>
                        Friendly Miner
                    </h1>
                    <p style={{ color: '#a1a1aa', fontSize: 15, lineHeight: 1.6, maxWidth: 650, margin: 0 }}>
                        Sua plataforma inteligente para mapeamento, prospecção e extração de leads do Google Maps. Encontre clientes, qualifique contatos e otimize seu funil comercial em um só lugar.
                    </p>
                </div>

                {/* Botões de Ação */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', zIndex: 2, flexShrink: 0, width: '100%', justifyContent: 'flex-start', marginTop: 8 }}>
                    <button onClick={() => onGoTo?.('scraper')}
                        className="hero-primary-btn"
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 0,
                            cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex',
                            alignItems: 'center', gap: 8, transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                        }}>
                        <Rocket size={16} />
                        Buscar Leads agora
                    </button>
                    <button onClick={onImportCSV}
                        className="hero-secondary-btn"
                        style={{
                            background: 'rgba(39, 39, 42, 0.4)',
                            color: '#e4e4e7', border: '1px solid #27272a', padding: '12px 24px', borderRadius: 0,
                            cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex',
                            alignItems: 'center', gap: 8, transition: 'all 0.2s',
                        }}>
                        <Upload size={16} />
                        Importar Planilha
                    </button>
                </div>
            </div>

            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                {[
                    { icon: <Search size={20} color="#10b981" />, label: 'Total de Buscas',    value: metrics?.totalSearches ?? 0 },
                    { icon: <MapPin size={20} color="#10b981" />, label: 'Total de Leads',     value: (metrics?.totalResults ?? 0).toLocaleString('pt-BR') },
                    { icon: <Star size={20} color="#10b981" />, label: 'Avaliação Média',     value: metrics?.avgRating ? Number(metrics.avgRating).toFixed(1) : '0.0' },
                    { icon: <Tag size={20} color="#10b981" />, label: 'Categorias',          value: metrics?.topCategories?.length ?? 0 },
                ].map((c, i) => (
                    <div key={i} style={cardStyle}>
                        <span>{c.icon}</span>
                        <span style={{ fontSize: 12, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{c.label}</span>
                        <span className="mono" style={{ fontSize: '2rem', fontWeight: 700, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{c.value}</span>
                    </div>
                ))}
            </div>

            {/* ——— Resumo da Prospecção ——— */}
            {Object.keys(statusCounts).length > 0 && (
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MessageCircle size={16} color="#10b981" />
                            Sua Prospecção
                        </h3>
                        <button onClick={() => onGoTo?.('prospect')}
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>Abrir Prospecção</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>

                    {/* Funil compacto */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: followUps.count > 0 || suggestions.length > 0 ? 16 : 0 }}>
                        {STATUS_OPTIONS.map(opt => (
                            <div key={opt.value} style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: opt.color }}>{statusCounts[opt.value] || 0}</div>
                                <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <DynIcon name={opt.icon} size={12} color={opt.color} />
                                    <span>{opt.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Follow-up pendente */}
                    {followUps.count > 0 && (
                        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 0, padding: '11px 16px', marginBottom: suggestions.length > 0 ? 14 : 0, fontSize: 13, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Clock size={14} color="#8b5cf6" />
                            <span>⏰ <strong>{followUps.count}</strong> {followUps.count === 1 ? 'lead está' : 'leads estão'} sem resposta há 3+ dias — hora do follow-up!</span>
                        </div>
                    )}

                    {/* Empresas sugeridas (abrem a ficha no modal) */}
                    {suggestions.map(sug => (
                        <div key={sug.type} style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Lightbulb size={14} color="#f59e0b" />
                                <span><strong style={{ color: '#e4e4e7' }}>{sug.count}</strong> {sug.title.toLowerCase()} — {sug.hint.toLowerCase()}:</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {sug.sample.map(lead => (
                                    <button key={lead.id} onClick={() => setModalLead(lead)}
                                        title="Abrir ficha da empresa"
                                        style={{
                                            background: '#09090b', border: '1px solid #27272a', borderRadius: 0,
                                            padding: '7px 13px', cursor: 'pointer', fontSize: 12, color: '#e4e4e7',
                                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#10b981'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = '#27272a'}>
                                        <Building2 size={12} color="#a1a1aa" />
                                        <span>{lead.name}</span>
                                        {getWhatsAppUrl(lead.phone) && <span style={{ width: 6, height: 6, background: '#10b981', display: 'inline-block' }} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Seção de Gráficos SVG */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
                {/* Gráfico 1: Evolução de Captação */}
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 24 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={16} color="#10b981" />
                        Histórico de Leads (Últimos Dias)
                    </h3>
                    {resultsByDate.length === 0 ? (
                        <p style={{ color: '#52525b', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Sem dados históricos suficientes.</p>
                    ) : (
                        <div style={{ width: '100%', height: 200, display: 'flex', flexDirection: 'column' }}>
                            {/* Gráfico de Barras SVG Nativo */}
                            <svg viewBox="0 0 500 180" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                {/* Linhas de grade horizontais */}
                                <line x1="40" y1="20" x2="480" y2="20" stroke="#27272a" strokeWidth="0.5" strokeDasharray="4 4" />
                                <line x1="40" y1="75" x2="480" y2="75" stroke="#27272a" strokeWidth="0.5" strokeDasharray="4 4" />
                                <line x1="40" y1="130" x2="480" y2="130" stroke="#27272a" strokeWidth="0.5" />
                                
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
                                                    <stop offset="0%" stopColor="#10b981" />
                                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
                                                </linearGradient>
                                            </defs>
                                            
                                            {/* Barra */}
                                            <rect x={x} y={y} width="16" height={barHeight} rx="0" fill={`url(#gradient-${index})`} />
                                            
                                            {/* Valor sobre a barra */}
                                            <text className="mono" x={x + 8} y={y - 6} fill="#d4d4d8" fontSize="9" fontWeight="600" textAnchor="middle">
                                                {d.count}
                                            </text>
                                            
                                            {/* Data (Eixo X) */}
                                            <text className="mono" x={x + 8} y="150" fill="#52525b" fontSize="9" textAnchor="middle">
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
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 24 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fafafa', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag size={16} color="#10b981" />
                        Maiores Categorias
                    </h3>
                    {metrics?.topCategories?.length === 0 ? (
                        <p style={{ color: '#52525b', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Nenhuma categoria registrada.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {metrics?.topCategories?.slice(0, 5).map((cat, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 12, color: '#d4d4d8', width: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cat.category}>
                                        {cat.category || '(sem categoria)'}
                                    </span>
                                    <div style={{ flex: 1, height: 8, background: '#09090b', borderRadius: 0, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 0, background: 'linear-gradient(90deg,#10b981,#06b6d4)', width: `${Math.round((cat.count / maxCat) * 100)}%` }} />
                                    </div>
                                    <span className="mono" style={{ fontSize: 11, color: '#52525b', width: 35, textAlign: 'right', fontWeight: 600 }}>{cat.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Importações Recentes */}
            {recentSearches.length > 0 && (
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fafafa', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={18} color="#10b981" />
                        Histórico de Importações Recentes
                    </h2>
                    <div style={{ background: '#18181b', borderRadius: 0, border: '1px solid #27272a', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    {['Arquivo', 'Resultados', 'Origem', 'Data', ''].map((h, i) => (
                                        <th key={i} style={{ textAlign: 'left', padding: '12px 16px', color: '#52525b', fontWeight: 500, borderBottom: '1px solid #27272a', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recentSearches.map(s => (
                                    <tr key={s.id}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        style={{ transition: 'background 0.15s' }}>
                                        <td style={{ padding: '12px 16px', color: '#e4e4e7', fontWeight: 500 }}>{s.filename}</td>
                                        <td className="mono" style={{ padding: '12px 16px', color: '#a1a1aa' }}>{(s.total_results || 0).toLocaleString('pt-BR')} leads</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ 
                                                background: s.source === 'extension' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)', 
                                                color: s.source === 'extension' ? '#a78bfa' : '#10b981', 
                                                padding: '3px 10px', borderRadius: 0, fontSize: 11, fontWeight: 600,
                                                display: 'inline-flex', alignItems: 'center', gap: 6
                                            }}>
                                                {s.source === 'extension' ? <Plug size={12} /> : <FileText size={12} />}
                                                <span>{s.source === 'extension' ? 'Extensão Chrome' : 'Planilha CSV/Excel'}</span>
                                            </span>
                                        </td>
                                        <td className="mono" style={{ padding: '12px 16px', color: '#52525b' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <button onClick={() => onSelectSearch(s)}
                                                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'none', padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span>Ver dados</span>
                                                <ArrowRight size={12} />
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
                <div style={{ marginTop: 40, textAlign: 'center', color: '#52525b' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <FolderOpen size={48} color="#52525b" />
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#a1a1aa' }}>Nenhum dado importado</h3>
                    <p style={{ fontSize: 14 }}>
                        Use a aba <strong style={{ color: '#10b981' }}>Buscar Leads</strong> para capturar seus primeiros leads, ou importe uma planilha CSV/Excel acima.
                    </p>
                </div>
            )}

            {/* Modal da ficha da empresa */}
            {modalLead && (
                <LeadModal
                    lead={modalLead}
                    onClose={() => setModalLead(null)}
                    onUpdated={(updated) => {
                        setModalLead(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
                        load();
                    }}
                    onDeleted={() => load()}
                />
            )}
        </div>
    );
}
