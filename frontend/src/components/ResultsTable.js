import React, { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api';
import useDebouncedValue from '../hooks/useDebounce';
import useRefreshOnFocus from '../hooks/useRefreshOnFocus';
import MapView from './MapView';
import LeadModal from './LeadModal';
import { STATUS_OPTIONS, getWhatsAppUrl } from '../statuses';
import { safeExternalUrl } from '../utils/safeUrl';
import {
    Building2, Tag, Activity, Phone, Mail, MapPin, Globe, Star, Share2,
    SlidersHorizontal, Map as MapIcon, Download, Lightbulb, X, Pin, Send,
    Trash2, StickyNote, MessageCircle, Link2, StarFilled
} from './Icons';

// Ícones das redes sociais de um lead (função pura — só depende da linha).
function renderSocials(row) {
    const socials = [];
    if (row.instagram) socials.push({ key: 'ig', icon: '📸', url: row.instagram, title: 'Instagram' });
    if (row.facebook)  socials.push({ key: 'fb', icon: '👥', url: row.facebook, title: 'Facebook' });
    if (row.linkedin)  socials.push({ key: 'in', icon: '👔', url: row.linkedin, title: 'LinkedIn' });
    if (row.twitter)   socials.push({ key: 'tw', icon: '🐦', url: row.twitter, title: 'Twitter/X' });
    if (row.youtube)   socials.push({ key: 'yt', icon: '🎥', url: row.youtube, title: 'YouTube' });

    const safeSocials = socials
        .map(s => ({ ...s, href: safeExternalUrl(s.url) }))
        .filter(s => s.href);

    if (safeSocials.length === 0) return <span style={{ color: '#52525b' }}>—</span>;

    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {safeSocials.map(s => (
                <a key={s.key} href={s.href} target="_blank" rel="noreferrer" title={s.title}
                   style={{ fontSize: 13, textDecoration: 'none', transition: 'transform 0.15s', display: 'inline-block' }}
                   onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                   onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                    {s.icon}
                </a>
            ))}
        </div>
    );
}

// Linha da tabela memoizada: só re-renderiza quando ESTA linha muda (dados ou
// seleção). Antes, marcar 1 checkbox re-renderizava as 50 linhas de uma vez.
const ResultRow = memo(function ResultRow({ row, isSelected, onToggleSelect, onStatusChange, onOpen }) {
    const waUrl = getWhatsAppUrl(row.phone);
    const websiteUrl = safeExternalUrl(row.website);
    return (
        <tr style={{ transition: 'background 0.15s', borderBottom: '1px solid #1c1c22' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {/* Seleção */}
            <td style={{ padding: '14px 14px' }}>
                <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.id)} aria-label={`Selecionar ${row.name || 'lead'}`} style={{ accentColor: '#10b981', cursor: 'pointer' }} />
            </td>

            {/* Nome (abre a ficha da empresa) */}
            <td onClick={() => onOpen(row)}
                style={{ padding: '14px 16px', color: '#e4e4e7', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                title={`${row.name} — clique para abrir a ficha`}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ borderBottom: '1px dashed #3f3f46' }}>{row.name || '—'}</span>
                    {row.notes && <StickyNote size={11} color="#a1a1aa" title="Tem anotações" />}
                </div>
            </td>

            {/* Categoria */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.category}>
                {row.category || '—'}
            </td>

            {/* Status CRM */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>
                <select
                    value={row.prospect_status || 'novo'}
                    onChange={e => onStatusChange(row.id, e.target.value)}
                    style={{
                        background: '#0e0e11', color: '#fafafa', border: '1px solid #27272a',
                        borderRadius: 0, padding: '4px 6px', fontSize: 12, outline: 'none', cursor: 'pointer'
                    }}
                >
                    {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </td>

            {/* Telefone / DDI WhatsApp */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono">{row.phone || '—'}</span>
                    {waUrl && (
                        <a href={waUrl} target="_blank" rel="noreferrer" title="Iniciar Conversa no WhatsApp"
                           style={{ textDecoration: 'none', background: 'rgba(16,185,129,0.15)', color: '#10b981', width: 22, height: 22, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                            <MessageCircle size={11} color="#10b981" />
                        </a>
                    )}
                </div>
            </td>

            {/* Email */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.email}>
                {row.email || '—'}
            </td>

            {/* Endereço */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.address}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.address || '—'}</span>
                    {row.address && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name + ' ' + row.address)}`} target="_blank" rel="noreferrer" title="Ver no Google Maps"
                           style={{ textDecoration: 'none', fontSize: 11, display: 'inline-flex', alignItems: 'center' }}>
                            <MapIcon size={12} color="#10b981" />
                        </a>
                    )}
                </div>
            </td>

            {/* Website */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>
                {websiteUrl
                    ? <a href={websiteUrl} target="_blank" rel="noreferrer" style={{ color: '#10b981', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Link2 size={12} />
                        <span>Site</span>
                      </a>
                    : '—'
                }
            </td>

            {/* Avaliação */}
            <td style={{ padding: '14px 16px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                {row.rating > 0
                    ? <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <StarFilled size={12} color="#f59e0b" />
                        <span className="mono">{row.rating.toFixed(1)}</span>
                        <span className="mono" style={{ fontSize: 11, color: '#52525b', fontWeight: 400 }}>({row.reviews_count || 0})</span>
                      </span>
                    : '—'
                }
            </td>

            {/* Redes Sociais */}
            <td style={{ padding: '14px 16px' }}>
                {renderSocials(row)}
            </td>
        </tr>
    );
});

// Colunas com labels limpas (sem emojis)
const cols = [
    { key: 'name',            label: 'Nome',            icon: <Building2 size={13} color="#52525b" /> },
    { key: 'category',        label: 'Categoria',       icon: <Tag size={13} color="#52525b" /> },
    { key: 'prospect_status', label: 'Status',          icon: <Activity size={13} color="#52525b" /> },
    { key: 'phone',           label: 'Contato',         icon: <Phone size={13} color="#52525b" /> },
    { key: 'email',           label: 'Email',           icon: <Mail size={13} color="#52525b" /> },
    { key: 'address',         label: 'Endereço',        icon: <MapPin size={13} color="#52525b" /> },
    { key: 'website',         label: 'Website',         icon: <Globe size={13} color="#52525b" /> },
    { key: 'rating',          label: 'Avaliação',       icon: <Star size={13} color="#52525b" /> },
    { key: 'socials',         label: 'Redes',           icon: <Share2 size={13} color="#52525b" /> }
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
    const [error, setError] = useState('');

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

    // Só busca depois que o usuário para de digitar (evita 1 request por tecla).
    const debouncedFilters = useDebouncedValue(filters, 350);

    // `forceCount`: recontar o total mesmo fora da 1ª página — usado após
    // apagar/mover leads em lote, quando o total muda mas a página não.
    const load = useCallback(async (forceCount = false) => {
        if (!search?.id) return;
        setLoading(true);
        setError('');
        try {
            // Limpa filtros vazios antes de enviar
            const activeFilters = {};
            Object.entries(debouncedFilters).forEach(([k, v]) => {
                if (v !== '' && v !== null && v !== undefined) {
                    activeFilters[k] = v;
                }
            });

            // COUNT(*) exato só na 1ª página; ao paginar reaproveita o total.
            const res = await api.getResults(search.id, page, LIMIT, activeFilters, forceCount || page === 1);
            if (res.success) {
                setData(res.data.data || []);
                if (res.data.total != null) setTotal(res.data.total);
            }
        } catch (e) {
            console.error('Erro ao carregar resultados:', e);
            setError('Não foi possível atualizar os leads desta importação.');
        }
        setLoading(false);
    }, [search, page, debouncedFilters]);

    // Reseta página e seleção quando a busca selecionada muda ou os filtros mudam
    useEffect(() => {
        setPage(1);
        setSelected(new Set());
    }, [search, debouncedFilters]);

    useEffect(() => { 
        load(); 
    }, [load]);

    const refreshRef = useRefreshOnFocus(useCallback(() => load(true), [load]));

    // Estáveis (useCallback) para que a memoização das linhas funcione: se o
    // handler mudasse de identidade a cada render, todas as linhas re-renderizariam.
    const handleStatusChange = useCallback(async (resultId, newStatus) => {
        try {
            const res = await api.updateResultStatus(resultId, newStatus);
            if (res.success) {
                setData(prev => prev.map(r => r.id === resultId ? { ...r, prospect_status: newStatus } : r));
            }
        } catch (e) {
            console.error('Erro ao atualizar status comercial:', e);
            setError('Não foi possível alterar o status do lead.');
        }
    }, []);

    const openModal = useCallback((row) => setModalLead(row), []);

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

    const toggleSelect = useCallback((id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = () => {
        setSelected(prev => prev.size === data.length ? new Set() : new Set(data.map(r => r.id)));
    };

    const bulkStatus = async (status, label) => {
        const ids = [...selected];
        if (!ids.length) return;
        try {
            await api.bulkStatus(ids, status);
            flash(`${ids.length} leads movidos para "${label}"`);
            setSelected(new Set());
            load(true);
        } catch {
            flash('Erro ao atualizar leads');
        }
    };

    const bulkDelete = async () => {
        const ids = [...selected];
        if (!ids.length) return;
        if (!window.confirm(`Apagar ${ids.length} leads definitivamente?`)) return;
        try {
            await api.bulkDelete(ids);
            flash(`${ids.length} leads apagados`);
            setSelected(new Set());
            load(true);
        } catch {
            flash('Erro ao apagar leads');
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

    return (
        <div ref={refreshRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
                <div role="alert" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '9px 12px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span>{error}</span>
                    <button type="button" onClick={() => load(true)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>Tentar novamente</button>
                </div>
            )}
            {/* Header com botões de ação e exportação */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fafafa' }}>{search.filename}</h2>
                    <p style={{ fontSize: 13, color: '#52525b', marginTop: 2 }}><span className="mono">{total.toLocaleString('pt-BR')}</span> leads encontrados</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowAdvFilters(!showAdvFilters)}
                        style={{
                            background: showAdvFilters ? 'rgba(16,185,129,0.2)' : '#18181b',
                            border: showAdvFilters ? '1px solid #10b981' : '1px solid #27272a',
                            borderRadius: 0, padding: '8px 14px', color: '#fafafa', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <SlidersHorizontal size={14} color={showAdvFilters ? '#10b981' : '#a1a1aa'} />
                        Filtros Avançados
                    </button>
                    <button
                        onClick={() => setShowMap(!showMap)}
                        style={{
                            background: showMap ? 'rgba(6,182,212,0.2)' : '#18181b',
                            border: showMap ? '1px solid #06b6d4' : '1px solid #27272a',
                            borderRadius: 0, padding: '8px 14px', color: '#fafafa', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <MapIcon size={14} color={showMap ? '#06b6d4' : '#a1a1aa'} />
                        {showMap ? 'Ocultar Mapa' : 'Mostrar no Mapa'}
                    </button>
                    <button
                        onClick={() => api.exportSearch(search.id, filters)}
                        style={{
                            background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none',
                            padding: '8px 18px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <Download size={14} />
                        <span>Exportar CSV</span>
                    </button>
                </div>
            </div>

            {/* Painel de Filtros Avançados */}
            {showAdvFilters && (
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Nome</label>
                            <input
                                value={filters.name}
                                onChange={e => handleFilterChange('name', e.target.value)}
                                placeholder="Buscar por nome..."
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Categoria</label>
                            <input
                                value={filters.category}
                                onChange={e => handleFilterChange('category', e.target.value)}
                                placeholder="Buscar categoria..."
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Cidade / Endereço</label>
                            <input
                                value={filters.city}
                                onChange={e => handleFilterChange('city', e.target.value)}
                                placeholder="Ex: Pinheiros, SP..."
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Status CRM</label>
                            <select
                                value={filters.prospect_status}
                                onChange={e => handleFilterChange('prospect_status', e.target.value)}
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="">Todos</option>
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Avaliação Mínima</label>
                            <input
                                type="number" step="0.1" min="0" max="5"
                                value={filters.min_rating}
                                onChange={e => handleFilterChange('min_rating', e.target.value)}
                                placeholder="Ex: 4.0"
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Avaliação Máxima</label>
                            <input
                                type="number" step="0.1" min="0" max="5"
                                value={filters.max_rating}
                                onChange={e => handleFilterChange('max_rating', e.target.value)}
                                placeholder="Ex: 4.5"
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Mín. Reviews</label>
                            <input
                                type="number" min="0"
                                value={filters.min_reviews}
                                onChange={e => handleFilterChange('min_reviews', e.target.value)}
                                placeholder="Ex: 5"
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase' }}>Máx. Reviews</label>
                            <input
                                type="number" min="0"
                                value={filters.max_reviews}
                                onChange={e => handleFilterChange('max_reviews', e.target.value)}
                                placeholder="Ex: 20"
                                style={{ background: '#0e0e11', border: '1px solid #27272a', borderRadius: 0, padding: '7px 10px', color: '#fafafa', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                    </div>

                    {/* Botões Rápidos de Leads Oportunidades */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#52525b', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Lightbulb size={12} color="#f59e0b" />
                            <span>Oportunidades:</span>
                        </span>
                        {[
                            { key: 'has_website', label: 'Sem Site', icon: <Globe size={12} />, val: '0' },
                            { key: 'has_email',   label: 'Sem Email', icon: <Mail size={12} />, val: '0' },
                            { key: 'has_phone',   label: 'Sem Telefone', icon: <Phone size={12} />, val: '0' },
                            { key: 'no_social',   label: 'Sem Redes Sociais', icon: <Share2 size={12} />, val: '1' }
                        ].map(item => {
                            const isActive = filters[item.key] === item.val;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => handleFilterChange(item.key, isActive ? '' : item.val)}
                                    style={{
                                        background: isActive ? 'rgba(16,185,129,0.15)' : 'transparent',
                                        color: isActive ? '#10b981' : '#a1a1aa',
                                        border: isActive ? '1px solid rgba(16,185,129,0.4)' : '1px solid #27272a',
                                        borderRadius: 0, padding: '5px 12px', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                                        display: 'inline-flex', alignItems: 'center', gap: 6
                                    }}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                        <button
                            onClick={handleClearFilters}
                            style={{
                                background: 'transparent', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer',
                                fontWeight: 500, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4
                            }}
                        >
                            <X size={12} color="#ef4444" />
                            <span>Limpar Filtros</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Barra de ações em massa */}
            {selected.size > 0 && (
                <div style={{
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 0,
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                    <span className="mono" style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>{selected.size} selecionados:</span>
                    <button onClick={() => bulkStatus('fila', 'Na fila')}
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Pin size={12} color="#f59e0b" />
                        <span>Enviar depois</span>
                    </button>
                    <button onClick={() => bulkStatus('enviado', 'Mensagem enviada')}
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Send size={12} color="#a78bfa" />
                        <span>Marcar enviada</span>
                    </button>
                    <button onClick={bulkDelete}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Trash2 size={12} color="#ef4444" />
                        <span>Apagar selecionados</span>
                    </button>
                </div>
            )}
            {actionMsg && <span role="status" aria-live="polite" style={{ fontSize: 13, color: actionMsg.includes('Erro') ? '#fca5a5' : '#10b981' }}>{actionMsg}</span>}

            {/* Layout Flexbox com Mapa Lateral (Split Screen) */}
            <div className="responsive-split" style={{ display: 'flex', gap: 20, alignItems: 'start', flexWrap: 'wrap' }}>
                {/* Tabela de Leads */}
                <div style={{ flex: showMap ? '1 1 55%' : '1 1 100%', minWidth: 320, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', borderRadius: 0, border: '1px solid #27272a', background: '#18181b' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #27272a', width: 36 }}>
                                        <input type="checkbox" checked={data.length > 0 && selected.size === data.length} onChange={toggleSelectAll} aria-label="Selecionar leads desta página" style={{ accentColor: '#10b981', cursor: 'pointer' }} />
                                    </th>
                                    {cols.map(c => (
                                        <th key={c.key} style={{ textAlign: 'left', padding: '12px 16px', color: '#52525b', fontWeight: 500, borderBottom: '1px solid #27272a', whiteSpace: 'nowrap', fontSize: 12 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {c.icon}
                                                <span>{c.label}</span>
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', padding: 40, color: '#52525b', fontFamily: 'var(--font-mono)' }}>Carregando leads...</td></tr>
                                )}
                                {!loading && data.map((row, i) => (
                                    <ResultRow
                                        key={row.id || i}
                                        row={row}
                                        isSelected={selected.has(row.id)}
                                        onToggleSelect={toggleSelect}
                                        onStatusChange={handleStatusChange}
                                        onOpen={openModal}
                                    />
                                ))}
                                {!loading && !data.length && (
                                    <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', padding: 40, color: '#52525b' }}>Nenhum lead correspondente aos filtros</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginação */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px 18px', borderRadius: 0, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                                ← Anterior
                            </button>
                            <span style={{ color: '#52525b', fontSize: 13 }}>Página {page} de {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '8px 18px', borderRadius: 0, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                                Próxima →
                            </button>
                        </div>
                    )}
                </div>

                {/* Mapa Lateral (Split) */}
                {showMap && (
                    <div style={{ flex: '1 1 40%', minWidth: 320, position: 'sticky', top: 80 }}>
                        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: 16 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <MapIcon size={14} color="#10b981" />
                                Geolocalização dos Leads
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
