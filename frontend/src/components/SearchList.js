import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Edit, Trash2 } from './Icons';

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
        if (!window.confirm(
            `Apagar a busca "${s.filename}" do histórico?\n\n` +
            `Os leads NÃO trabalhados (status "novo") serão excluídos. ` +
            `Os que você já moveu na prospecção continuam salvos.`
        )) return;
        try {
            await api.deleteSearch(s.id);
            setSearches(prev => prev.filter(x => x.id !== s.id));
            onDeleted?.(s.id);
        } catch { /* falha ao apagar */ }
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

    if (loading) return <p style={{ color: '#52525b', textAlign: 'center', padding: 20, fontFamily: 'var(--font-mono)' }}>Carregando...</p>;
    if (!searches.length) return <p style={{ color: '#52525b', fontSize: 14, padding: '20px 0' }}>Nenhuma importação ainda.</p>;

    const actionBtn = {
        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12,
        padding: '4px 6px', borderRadius: 0, lineHeight: 1, opacity: 0.75,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searches.map(s => (
                <div
                    key={s.id}
                    onClick={() => editingId !== s.id && onSelectSearch(s)}
                    style={{
                        background: selectedId === s.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.02)',
                        border: selectedId === s.id ? '1px solid #10b981' : '1px solid #27272a',
                        borderRadius: 0,
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
                                width: '100%', background: '#0e0e11', border: '1px solid #10b981', borderRadius: 0,
                                padding: '5px 8px', color: '#fafafa', fontSize: 13, outline: 'none', marginBottom: 6,
                            }}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fafafa', wordBreak: 'break-all', flex: 1 }}>{s.filename}</div>
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                <button title="Renomear" onClick={e => startRename(e, s)} style={actionBtn}>
                                  <Edit size={13} color="#a1a1aa" />
                                </button>
                                <button title="Apagar busca e leads" onClick={e => handleDelete(e, s)} style={actionBtn}>
                                  <Trash2 size={13} color="#ef4444" />
                                </button>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: 12, color: '#a1a1aa' }}>{(s.total_results || 0).toLocaleString('pt-BR')} registros</span>
                        <span className="mono" style={{ fontSize: 11, color: '#52525b' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
