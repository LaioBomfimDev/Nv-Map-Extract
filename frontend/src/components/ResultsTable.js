import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import MapView from './MapView';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getWhatsAppUrl } from '../statuses';

const cols = [
    { key: 'name',            label: '🏢 Nome' },
    { key: 'category',        label: '🏷️ Categoria' },
    { key: 'prospect_status', label: '📊 Status CRM' },
    { key: 'phone',           label: '📞 Contato' },
    { key: 'email',           label: '✉️ Email' },
    { key: 'address',         label: '📍 Endereço' },
    { key: 'website',         label: '🌐 Website' },
    { key: 'rating',          label: '⭐ Avaliação' },
    { key: 'socials',         label: '📱 Redes Sociais' }
];

export default function ResultsTable({ search }) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [showAdvFilters, setShowAdvFilters] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [modalLead, setModalLead] = useState(null);
    const [actionMsg, setActionMsg] = useState('');

    // Estados dos Filtros Avançados
    const [filters, setFilters] = useState({
        name: '',
        category: '',
        city: '',
        prospect_status: '',
        has_website: '',
        has_email: '',
        has_phone: '',
        no_social: '',
        min_rating: '',
        max_rating: '',
        min_reviews: '',
        max_reviews: ''
    });

    const LIMIT = 50;

    const load = useCallback(async () => {
        if (!search?.id) return;
        setLoading(true);
        try {
            // Limpa filtros vazios antes de enviar
            const activeFilters = {};
            Object.entries(filters).forEach(([k, v]) => {
                if (v !== '' && v !== null && v !== undefined) {
                    activeFilters[k] = v;
                }
            });

            const res = await api.getResults(search.id, page, LIMIT, activeFilters);
            if (res.success) {
                setData(res.data.data || []);
                setTotal(res.data.total || 0);
            }
        } catch (e) {
            console.error('Erro ao carregar resultados:', e);
        }
        setLoading(false);
    }, [search, page, filters]);

    // Reseta página e seleção quando a busca selecionada muda ou os filtros mudam
    useEffect(() => {
        setPage(1);
        setSelected(new Set());
    }, [search, filters]);

    useEffect(() => { 
        load(); 
    }, [load]);

    const handleStatusChange = async (resultId, newStatus) => {
        try {
            const res = await api.updateResultStatus(resultId, newStatus);
            if (res.success) {
                setData(prev => prev.map(r => r.id === resultId ? { ...r, prospect_status: newStatus } : r));
            }
        } catch (e) {
            console.error('Erro ao atualizar status comercial:', e);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleClearFilters = () => {
        setFilters({
            name: '',
            category: '',
            city: '',
            prospect_status: '',
            has_website: '',
            has_email: '',
            has_phone: '',
            no_social: '',
            min_rating: '',
            max_rating: '',
            min_reviews: '',
            max_reviews: ''
        });
    };

    // ——— Seleção e ações em massa ———
    const flash = (msg) => {
        setActionMsg(msg);
        setTimeout(() => setActionMsg(''), 3500);
    };

    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelected(prev => prev.size === data.length ? new Set() : new Set(data.map(r => r.id)));
    };

    const bulkStatus = async (status, label) => {
        const ids = [...selected];
        if (!ids.length) return;
        try {
            await api.bulkStatus(ids, status);
            flash(`✅ ${ids.length} leads movidos para "${label}"`);
            setSelected(new Set());
            load();
        } catch {
            flash('❌ Erro ao atualizar leads');
        }
    };

    const bulkDelete = async () => {
        const ids = [...selected];
        if (!ids.length) return;
        if (!window.confirm(`Apagar ${ids.length} leads definitivamente?`)) return;
        try {
            await api.bulkDelete(ids);
            flash(`🗑️ ${ids.length} leads apagados`);
            setSelected(new Set());
            load();
        } catch {
            flash('❌ Erro ao apagar leads');
        }
    };

    const onLeadUpdated = (updated) => {
        setData(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
        setModalLead(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
    };

    const onLeadDeleted = (id) => {
        setData(prev => prev.filter(r => r.id !== id));
        setTotal(t => Math.max(0, t - 1));
    };

    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    // Renderizar ícones das redes sociais
    const renderSocials = (row) => {
        const socials = [];
        if (row.instagram) socials.push({ key: 'ig', icon: '📸', url: row.instagram, title: 'Instagram' });
        if (row.facebook)  socials.push({ key: 'fb', icon: '👥', url: row.facebook, title: 'Facebook' });
        if (row.linkedin)  socials.push({ key: 'in', icon: '👔', url: row.linkedin, title: 'LinkedIn' });
        if (row.twitter)   socials.push({ key: 'tw', icon: '🐦', url: row.twitter, title: 'Twitter/X' });
        if (row.youtube)   socials.push({ key: 'yt', icon: '🎥', url: row.youtube, title: 'YouTube' });

        if (socials.length === 0) return <span style={{ color: '#475569' }}>—</span>;

        return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {socials.map(s => (
                    <a key={s.key} href={s.url} target="_blank" rel="noreferrer" title={s.title}
                       style={{ fontSize: 13, textDecoration: 'none', transition: 'transform 0.15s', display: 'inline-block' }}
                       onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                       onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                        {s.icon}
                    </a>
                ))}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header com botões de ação e exportação */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{search.filename}</h2>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{total.toLocaleString('pt-BR')} leads encontrados</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowAdvFilters(!showAdvFilters)}
                        style={{
                            background: showAdvFilters ? 'rgba(59,130,246,0.2)' : '#1e293b',
                            border: showAdvFilters ? '1px solid #3b82f6' : '1px solid #334155',
                            borderRadius: 10, padding: '8px 14px', color: '#f1f5f9', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        ⚙️ Filtros Avançados
                    </button>
                    <button
                        onClick={() => setShowMap(!showMap)}
                        style={{
                            background: showMap ? 'rgba(139,92,246,0.2)' : '#1e293b',
                            border: showMap ? '1px solid #8b5cf6' : '1px solid #334155',
                            borderRadius: 10, padding: '8px 14px', color: '#f1f5f9', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        🗺️ {showMap ? 'Ocultar Mapa' : 'Mostrar no Mapa'}
                    </button>
                    <a
                        href={api.getExportUrl(search.id)}
                        download
                        style={{
                            background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', border: 'none',
                            padding: '8px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            textDecoration: 'none', display: 'inline-block',
                        }}
                    >
                        ⬇️ Exportar CSV
                    </a>
                </div>
            </div>

            {/* Painel de Filtros Avançados */}
            {showAdvFilters && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>🏢 Nome</label>
                            <input
                                value={filters.name}
                                onChange={e => handleFilterChange('name', e.target.value)}
                                placeholder="Buscar por nome..."
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>🏷️ Categoria</label>
                            <input
                                value={filters.category}
                                onChange={e => handleFilterChange('category', e.target.value)}
                                placeholder="Buscar categoria..."
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>📍 Cidade / Endereço</label>
                            <input
                                value={filters.city}
                                onChange={e => handleFilterChange('city', e.target.value)}
                                placeholder="Ex: Pinheiros, SP..."
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>📊 Status CRM</label>
                            <select
                                value={filters.prospect_status}
                                onChange={e => handleFilterChange('prospect_status', e.target.value)}
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="">Todos</option>
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>⭐ Avaliação Mínima</label>
                            <input
                                type="number" step="0.1" min="0" max="5"
                                value={filters.min_rating}
                                onChange={e => handleFilterChange('min_rating', e.target.value)}
                                placeholder="Ex: 4.0"
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>⭐ Avaliação Máxima</label>
                            <input
                                type="number" step="0.1" min="0" max="5"
                                value={filters.max_rating}
                                onChange={e => handleFilterChange('max_rating', e.target.value)}
                                placeholder="Ex: 4.5"
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>💬 Mín. Reviews</label>
                            <input
                                type="number" min="0"
                                value={filters.min_reviews}
                                onChange={e => handleFilterChange('min_reviews', e.target.value)}
                                placeholder="Ex: 5"
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>💬 Máx. Reviews</label>
                            <input
                                type="number" min="0"
                                value={filters.max_reviews}
                                onChange={e => handleFilterChange('max_reviews', e.target.value)}
                                placeholder="Ex: 20"
                                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                    </div>

                    {/* Botões Rápidos de Leads Oportunidades */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>💡 Oportunidades:</span>
                        {[
                            { key: 'has_website', label: '🌐 Sem Site', val: '0' },
                            { key: 'has_email',   label: '✉️ Sem Email', val: '0' },
                            { key: 'has_phone',   label: '📞 Sem Telefone', val: '0' },
                            { key: 'no_social',   label: '📱 Sem Redes Sociais', val: '1' }
                        ].map(item => {
                            const isActive = filters[item.key] === item.val;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => handleFilterChange(item.key, isActive ? '' : item.val)}
                                    style={{
                                        background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                                        color: isActive ? '#3b82f6' : '#94a3b8',
                                        border: isActive ? '1px solid rgba(59,130,246,0.4)' : '1px solid #334155',
                                        borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                        <button
                            onClick={handleClearFilters}
                            style={{
                                background: 'transparent', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer',
                                fontWeight: 500, marginLeft: 'auto'
                            }}
                        >
                            🧹 Limpar Filtros
                        </button>
                    </div>
                </div>
            )}

            {/* Barra de ações em massa */}
            {selected.size > 0 && (
                <div style={{
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12,
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                    <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>{selected.size} selecionados:</span>
                    <button onClick={() => bulkStatus('fila', 'Na fila')}
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        📌 Enviar depois
                    </button>
                    <button onClick={() => bulkStatus('enviado', 'Mensagem enviada')}
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        📤 Marcar enviada
                    </button>
                    <button onClick={bulkDelete}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>
                        🗑️ Apagar selecionados
                    </button>
                </div>
            )}
            {actionMsg && <span style={{ fontSize: 13, color: '#22c55e' }}>{actionMsg}</span>}

            {/* Layout Flexbox com Mapa Lateral (Split Screen) */}
            <div className="responsive-split" style={{ display: 'flex', gap: 20, alignItems: 'start', flexWrap: 'wrap' }}>
                {/* Tabela de Leads */}
                <div style={{ flex: showMap ? '1 1 55%' : '1 1 100%', minWidth: 320, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid #334155', background: '#1e293b' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #334155', width: 36 }}>
                                        <input type="checkbox" checked={data.length > 0 && selected.size === data.length} onChange={toggleSelectAll} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
                                    </th>
                                    {cols.map(c => (
                                        <th key={c.key} style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 500, borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontSize: 12 }}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando leads...</td></tr>
                                )}
                                {!loading && data.map((row, i) => {
                                    const waUrl = getWhatsAppUrl(row.phone);
                                    return (
                                        <tr key={row.id || i} style={{ transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {/* Seleção */}
                                            <td style={{ padding: '11px 14px' }}>
                                                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
                                            </td>

                                            {/* Nome (abre a ficha da empresa) */}
                                            <td onClick={() => setModalLead(row)}
                                                style={{ padding: '11px 16px', color: '#e2e8f0', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                title={`${row.name} — clique para abrir a ficha`}>
                                                <span style={{ borderBottom: '1px dashed #475569' }}>{row.name || '—'}</span>
                                                {row.notes && <span title="Tem anotações" style={{ marginLeft: 5 }}>📝</span>}
                                            </td>
                                            
                                            {/* Categoria */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.category}>
                                                {row.category || '—'}
                                            </td>

                                            {/* Status CRM */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8' }}>
                                                <select
                                                    value={row.prospect_status || 'novo'}
                                                    onChange={e => handleStatusChange(row.id, e.target.value)}
                                                    style={{
                                                        background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
                                                        borderRadius: 8, padding: '4px 6px', fontSize: 12, outline: 'none', cursor: 'pointer'
                                                    }}
                                                >
                                                    {STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Telefone / DDI WhatsApp */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span>{row.phone || '—'}</span>
                                                    {waUrl && (
                                                        <a href={waUrl} target="_blank" rel="noreferrer" title="Iniciar Conversa no WhatsApp"
                                                           style={{ textDecoration: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justify: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                                            💬
                                                        </a>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Email */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.email}>
                                                {row.email || '—'}
                                            </td>

                                            {/* Endereço */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.address}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.address || '—'}</span>
                                                    {row.address && (
                                                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name + ' ' + row.address)}`} target="_blank" rel="noreferrer" title="Ver no Google Maps"
                                                           style={{ textDecoration: 'none', filter: 'grayscale(1)', fontSize: 11 }}>
                                                            🗺️
                                                        </a>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Website */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8' }}>
                                                {row.website 
                                                    ? <a href={row.website} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>🔗 Site</a>
                                                    : '—'
                                                }
                                            </td>

                                            {/* Avaliação */}
                                            <td style={{ padding: '11px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                {row.rating > 0
                                                    ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>★ {row.rating.toFixed(1)} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>({row.reviews_count || 0})</span></span>
                                                    : '—'
                                                }
                                            </td>

                                            {/* Redes Sociais */}
                                            <td style={{ padding: '11px 16px' }}>
                                                {renderSocials(row)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!loading && !data.length && (
                                    <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Nenhum lead correspondente aos filtros</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginação */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 18px', borderRadius: 8, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                                ← Anterior
                            </button>
                            <span style={{ color: '#64748b', fontSize: 13 }}>Página {page} de {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 18px', borderRadius: 8, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                                Próxima →
                            </button>
                        </div>
                    )}
                </div>

                {/* Mapa Lateral (Split) */}
                {showMap && (
                    <div style={{ flex: '1 1 40%', minWidth: 320, position: 'sticky', top: 80 }}>
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 16 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                🗺️ Geolocalização dos Leads
                            </h3>
                            <div style={{ height: '420px', width: '100%' }}>
                                <MapView leads={data} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal da ficha da empresa */}
            {modalLead && (
                <LeadModal
                    lead={modalLead}
                    onClose={() => setModalLead(null)}
                    onUpdated={onLeadUpdated}
                    onDeleted={onLeadDeleted}
                />
            )}
        </div>
    );
}
