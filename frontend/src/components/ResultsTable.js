import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const cols = [
    { key: 'name',          label: '🏢 Nome' },
    { key: 'category',      label: '🏷️ Categoria' },
    { key: 'phone',         label: '📞 Telefone' },
    { key: 'address',       label: '📍 Endereço' },
    { key: 'website',       label: '🌐 Website' },
    { key: 'rating',        label: '⭐ Avaliação' },
    { key: 'reviews_count', label: '💬 Reviews' },
    { key: 'email',         label: '✉️ Email' },
];

export default function ResultsTable({ search }) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [search2, setSearch2] = useState('');
    const LIMIT = 50;

    const load = useCallback(async () => {
        if (!search?.id) return;
        setLoading(true);
        try {
            const res = await api.getResults(search.id, page, LIMIT);
            if (res.success) {
                setData(res.data.data || []);
                setTotal(res.data.total || 0);
            }
        } catch {}
        setLoading(false);
    }, [search, page]);

    useEffect(() => { setPage(1); }, [search]);
    useEffect(() => { load(); }, [load]);

    const filtered = search2
        ? data.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search2.toLowerCase())))
        : data;

    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{search.filename}</h2>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{total.toLocaleString('pt-BR')} registros importados</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        value={search2}
                        onChange={e => setSearch2(e.target.value)}
                        placeholder="Filtrar resultados..."
                        style={{
                            background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                            padding: '8px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', width: 220,
                        }}
                    />
                    <a
                        href={api.getExportUrl(search.id)}
                        download
                        style={{
                            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none',
                            padding: '8px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            textDecoration: 'none', display: 'inline-block',
                        }}
                    >⬇️ Exportar CSV</a>
                </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid #334155', background: '#1e293b' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {cols.map(c => (
                                <th key={c.key} style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 500, borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontSize: 12 }}>
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</td></tr>
                        )}
                        {!loading && filtered.map((row, i) => (
                            <tr key={i} style={{ transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                {cols.map(c => (
                                    <td key={c.key} style={{ padding: '11px 16px', color: c.key === 'name' ? '#e2e8f0' : '#94a3b8', borderBottom: '1px solid rgba(51,65,85,0.5)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {c.key === 'website' && row[c.key]
                                            ? <a href={row[c.key]} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>🔗 Site</a>
                                            : c.key === 'rating' && row[c.key]
                                            ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>{'★'.repeat(Math.round(row[c.key]))} {row[c.key]}</span>
                                            : String(row[c.key] || '—')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {!loading && !filtered.length && (
                            <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Nenhum resultado encontrado</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
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
    );
}
