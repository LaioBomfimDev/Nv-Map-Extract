import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getWhatsAppUrl } from '../statuses';
import { Search, MapPin, Star, Tag, MessageCircle, Clock, Lightbulb, Building2, TrendingUp, FileText, Plug, FolderOpen, Rocket, Upload, ArrowRight, DynIcon, AlertTriangle, Pin, Send, Target } from './Icons';

const isExtensionSource = (source) => ['extension', 'extensao'].includes(String(source || '').toLowerCase());

export default function Dashboard({ onSelectSearch, onGoTo, onImportCSV }) {
    const [metrics, setMetrics] = useState(null);
    const [charts, setCharts] = useState(null);
    const [summary, setSummary] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [modalLead, setModalLead] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // `silent`: refresh em segundo plano (polling) não liga o spinner de tela cheia,
    // só a primeira carga liga. Evita a tela piscar "Carregando" a cada 30s.
    const load = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setError('');
            const [resMetrics, resCharts, resSummary, resCampaigns] = await Promise.all([
                api.getMetrics(),
                api.getCharts(),
                api.getProspectSummary().catch(() => null),
                api.getCampaigns?.().catch(() => null),
            ]);

            if (resMetrics.success) setMetrics(resMetrics.data);
            if (resCharts.success) setCharts(resCharts.data);
            if (resSummary?.success) setSummary(resSummary.data);
            if (resCampaigns?.success) setCampaigns(resCampaigns.data || []);
        } catch (e) {
            setError('Não foi possível carregar os dados do Supabase. Verifique login, variáveis de ambiente e conexão.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    const openLead = useCallback((lead) => {
        if (!lead?.id) return;
        setModalLead(lead);
        api.getLead?.(lead.id)
            .then(response => { if (response?.success && response.data) setModalLead(current => current?.id === lead.id ? { ...current, ...response.data } : current); })
            .catch(() => { /* mantém os dados resumidos */ });
    }, []);

    useEffect(() => {
        load();
        // Polling que pausa quando a aba do navegador está oculta (não gasta
        // 3 RPCs a cada 30s à toa) e refaz uma atualização ao voltar o foco.
        let timer = null;
        const startPolling = () => { if (!timer) timer = setInterval(() => load(true), 30000); };
        const stopPolling = () => { if (timer) { clearInterval(timer); timer = null; } };
        const onVisibility = () => {
            if (document.hidden) stopPolling();
            else { load(true); startPolling(); }
        };
        if (!document.hidden) startPolling();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stopPolling(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [load]);

    if (loading) return <p style={{ color: '#52525b', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Carregando métricas e gráficos...</p>;

    const maxCat = metrics?.topCategories?.[0]?.count || 1;
    const recentSearches = metrics?.recentSearches || [];
    const resultsByDate = charts?.resultsByDate || [];
    const statusCounts = summary?.statusCounts || {};
    const followUps = summary?.followUps || { count: 0, sample: [] };
    const dueTasks = summary?.dueTasks || { count: 0, sample: [] };
    const suggestions = (summary?.suggestions || []).filter(s => s.count > 0);
    const campaignDue = campaigns.reduce((sum, campaign) => sum + Number(campaign.due_followups || 0), 0);
    const campaignQueue = campaigns.reduce((sum, campaign) => sum + Number(campaign.pending || 0), 0);
    const nextActions = [
        dueTasks.count > 0 && {
            key: 'due-tasks', label: 'Tarefas vencidas', value: dueTasks.count,
            detail: dueTasks.sample?.[0]?.title || 'Próximas ações que passaram do prazo', color: '#ef4444', icon: Target,
            tab: 'prospect', lead: dueTasks.sample?.[0]?.lead,
        },
        followUps.count > 0 && {
            key: 'followups', label: 'Follow-ups atrasados', value: followUps.count,
            detail: 'Leads sem resposta há 3 dias ou mais', color: '#8b5cf6', icon: Clock, tab: 'prospect',
        },
        campaignDue > 0 && {
            key: 'campaign-due', label: 'Cadências vencidas', value: campaignDue,
            detail: 'Follow-ups de campanha prontos para enviar', color: '#06b6d4', icon: Send, tab: 'campaigns',
        },
        campaignQueue > 0 && {
            key: 'campaign-queue', label: 'Fila de campanhas', value: campaignQueue,
            detail: 'Contatos aguardando a primeira abordagem', color: '#f59e0b', icon: Target, tab: 'campaigns',
        },
        Number(statusCounts.fila || 0) > 0 && {
            key: 'prospect-queue', label: 'Fila de prospecção', value: Number(statusCounts.fila || 0),
            detail: 'Leads salvos para trabalhar agora', color: '#f59e0b', icon: Pin, tab: 'prospect',
        },
        Number(statusCounts.novo || 0) > 0 && {
            key: 'new-leads', label: 'Novos para qualificar', value: Number(statusCounts.novo || 0),
            detail: 'Leads ainda sem uma próxima etapa', color: '#10b981', icon: Lightbulb, tab: 'prospect',
        },
    ].filter(Boolean).slice(0, 4);

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

            {/* Começa pelo trabalho pendente, não apenas por indicadores históricos. */}
            <section aria-labelledby="next-actions-title" style={{ background: '#18181b', border: '1px solid #27272a', padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                        <h2 id="next-actions-title" style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', margin: 0 }}>Próximas ações</h2>
                        <p style={{ color: '#71717a', fontSize: 13, margin: '3px 0 0' }}>Prioridades comerciais que merecem atenção agora.</p>
                    </div>
                    <button type="button" onClick={() => load(true)} className="secondary-action">
                        Atualizar dados
                    </button>
                </div>
                {nextActions.length ? (
                    <div className="action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                        {nextActions.map(action => {
                            const Icon = action.icon;
                            return (
                                <button key={action.key} type="button" onClick={() => action.lead ? openLead(action.lead) : onGoTo?.(action.tab)}
                                    aria-label={`${action.label}: ${action.value}. ${action.detail}`}
                                    style={{ background: '#09090b', border: '1px solid #27272a', borderLeft: `3px solid ${action.color}`, padding: '14px 15px', textAlign: 'left', cursor: 'pointer', color: '#fafafa' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                                        <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: action.color }}>{action.value.toLocaleString('pt-BR')}</span>
                                        <Icon size={17} color={action.color} />
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{action.label}</div>
                                    <div style={{ color: '#71717a', fontSize: 11, lineHeight: 1.4, marginTop: 3 }}>{action.detail}</div>
                                    <span style={{ color: action.color, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 9 }}>
                                        Resolver agora <ArrowRight size={11} color={action.color} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div role="status" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7', padding: '14px 16px', fontSize: 13 }}>
                        Tudo em dia. Você pode buscar novos leads ou revisar as oportunidades do mapa.
                    </div>
                )}
            </section>

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
                                    <button key={lead.id} onClick={() => openLead(lead)}
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
                                                background: isExtensionSource(s.source) ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
                                                color: isExtensionSource(s.source) ? '#a78bfa' : '#10b981',
                                                padding: '3px 10px', borderRadius: 0, fontSize: 11, fontWeight: 600,
                                                display: 'inline-flex', alignItems: 'center', gap: 6
                                            }}>
                                                {isExtensionSource(s.source) ? <Plug size={12} /> : <FileText size={12} />}
                                                <span>{isExtensionSource(s.source) ? 'Extensão Chrome' : 'Planilha CSV/Excel'}</span>
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
