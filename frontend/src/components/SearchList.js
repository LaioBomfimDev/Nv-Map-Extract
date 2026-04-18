import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function SearchList({ onSelectSearch, selectedId }) {
    const [searches, setSearches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getSearches()
            .then(r => { if (r.success) setSearches(r.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Carregando...</p>;
    if (!searches.length) return <p style={{ color: '#64748b', fontSize: 14, padding: '20px 0' }}>Nenhuma importação ainda.</p>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searches.map(s => (
                <button
                    key={s.id}
                    onClick={() => onSelectSearch(s)}
                    style={{
                        background: selectedId === s.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                        border: selectedId === s.id ? '1px solid #3b82f6' : '1px solid #334155',
                        borderRadius: 12,
                        padding: '12px 16px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                        width: '100%',
                    }}
                >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 4, wordBreak: 'break-all' }}>{s.filename}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{(s.total_results || 0).toLocaleString('pt-BR')} registros</span>
                        <span style={{ fontSize: 11, color: '#475569' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}
