import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export default function SearchList({ onSelectSearch, selectedId, onDeleted }) {
    const [searches, setSearches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    const load = useCallback(() => {
        api.getSearches()
            .then(r => { if (r.success) setSearches(r.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleDelete(e, s) {
        e.stopPropagation();
        if (!window.confirm(`Apagar "${s.filename}" e todos os seus ${s.total_results || 0} leads?`)) return;
        try {
            await api.deleteSearch(s.id);
            setSearches(prev => prev.filter(x => x.id !== s.id));
            onDeleted?.(s.id);
        } catch { /* backend indisponível */ }
    }

    function startRename(e, s) {
        e.stopPropagation();
        setEditingId(s.id);
        setEditName(s.filename);
    }

    async function saveRename(s) {
        const name = editName.trim();
        setEditingId(null);
        if (!name || name === s.filename) return;
        try {
            await api.renameSearch(s.id, name);
            setSearches(prev => prev.map(x => x.id === s.id ? { ...x, filename: name } : x));
        } catch { /* mantém o nome antigo */ }
    }

    if (loading) return <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Carregando...</p>;
    if (!searches.length) return <p style={{ color: '#64748b', fontSize: 14, padding: '20px 0' }}>Nenhuma importação ainda.</p>;

    const actionBtn = {
        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12,
        padding: '2px 4px', borderRadius: 6, lineHeight: 1, opacity: 0.75,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searches.map(s => (
                <div
                    key={s.id}
                    onClick={() => editingId !== s.id && onSelectSearch(s)}
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
                    {editingId === s.id ? (
                        <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onBlur={() => saveRename(s)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') saveRename(s);
                                if (e.key === 'Escape') setEditingId(null);
                            }}
                            style={{
                                width: '100%', background: '#0f172a', border: '1px solid #3b82f6', borderRadius: 8,
                                padding: '5px 8px', color: '#f1f5f9', fontSize: 13, outline: 'none', marginBottom: 6,
                            }}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', wordBreak: 'break-all', flex: 1 }}>{s.filename}</div>
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                <button title="Renomear" onClick={e => startRename(e, s)} style={actionBtn}>✏️</button>
                                <button title="Apagar busca e leads" onClick={e => handleDelete(e, s)} style={actionBtn}>🗑️</button>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{(s.total_results || 0).toLocaleString('pt-BR')} registros</span>
                        <span style={{ fontSize: 11, color: '#475569' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
