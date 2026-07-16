import React, { useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { IMPORT_FIELDS, autoMapHeaders, parseDelimitedText, rowsToLeads } from '../utils/importSpreadsheet';
import { AlertTriangle, ArrowRight, Check, Upload, X } from './Icons';

const card = { background: '#18181b', border: '1px solid #27272a', padding: 20 };
const input = { width: '100%', background: '#09090b', border: '1px solid #3f3f46', color: '#fafafa', padding: '10px 12px', fontSize: 14 };

async function decodeTextFile(file) {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8;
  try { return new TextDecoder('windows-1252').decode(bytes); } catch (_) { return utf8; }
}

export default function ImportWizard({ open, onClose, onImport }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState('merge');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);
  const closeButton = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape' && !loading) onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => closeButton.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loading, onClose, open]);

  const parsed = useMemo(() => rowsToLeads(rows, mapping), [mapping, rows]);
  const valid = parsed.filter(item => item.errors.length === 0);
  const rejected = parsed.filter(item => item.errors.length > 0);

  function reset() {
    setStep(1); setFile(null); setHeaders([]); setRows([]); setMapping({});
    setKeyword(''); setCity(''); setConflictStrategy('merge'); setError(''); setResult(null);
  }

  function close() {
    if (loading) return;
    reset();
    onClose?.();
  }

  async function chooseFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setLoading(true);
    setError('');
    try {
      const extension = chosen.name.split('.').pop()?.toLowerCase();
      let matrix;
      if (extension === 'xlsx') matrix = await readXlsxFile(chosen);
      else if (['csv', 'tsv', 'txt'].includes(extension)) matrix = parseDelimitedText(await decodeTextFile(chosen)).rows;
      else throw new Error('Formato não suportado. Use CSV, TSV ou XLSX.');
      const cleaned = matrix.map(row => row.map(value => value == null ? '' : value));
      if (cleaned.length < 2) throw new Error('A planilha precisa ter cabeçalho e ao menos uma linha de dados.');
      const nextHeaders = cleaned[0].map((value, index) => String(value || `Coluna ${index + 1}`).trim());
      setFile(chosen);
      setHeaders(nextHeaders);
      setRows(cleaned.slice(1).filter(row => row.some(value => String(value ?? '').trim())));
      setMapping(autoMapHeaders(nextHeaders));
      setKeyword(chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      setStep(2);
    } catch (err) {
      setError(err.message || 'Não foi possível ler o arquivo.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  async function importRows() {
    if (!valid.length) return;
    setLoading(true);
    setError('');
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'csv';
      const response = await onImport(valid.map(item => item.lead), {
        keyword: keyword.trim() || 'planilha', city: city.trim(), source: 'spreadsheet',
        originalFilename: file.name, format: extension, conflictStrategy,
        metadata: { rejected: rejected.map(item => ({ row: item.rowNumber, errors: item.errors })) },
      });
      setResult(response?.data || response || {});
      setStep(4);
    } catch (err) {
      setError(err.message || 'Não foi possível importar a planilha.');
    } finally { setLoading(false); }
  }

  if (!open) return null;
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(9,9,11,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" aria-busy={loading}
        style={{ width: 'min(920px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#09090b', border: '1px solid #3f3f46', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 id="import-title" style={{ color: '#fafafa', fontSize: 20, margin: '0 0 5px' }}>Importar planilha</h2>
            <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0 }}>CSV, TSV ou XLSX · etapa {step} de 4</p>
          </div>
          <button ref={closeButton} type="button" onClick={close} disabled={loading} aria-label="Fechar importação"
            style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#d4d4d8', padding: 8, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 22 }}>
          {[1, 2, 3, 4].map(value => <div key={value} style={{ height: 4, background: value <= step ? '#10b981' : '#27272a' }} />)}
        </div>

        {error && <div role="alert" style={{ ...card, borderColor: 'rgba(239,68,68,.45)', color: '#fecaca', marginBottom: 18, display: 'flex', gap: 8 }}><AlertTriangle size={16} color="#ef4444" />{error}</div>}

        {step === 1 && <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
          <Upload size={38} color="#10b981" />
          <h3 style={{ color: '#fafafa', margin: '14px 0 6px' }}>Escolha a planilha</h3>
          <p style={{ color: '#a1a1aa', fontSize: 13, margin: '0 0 18px' }}>A primeira linha deve conter o nome das colunas.</p>
          <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={chooseFile} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={loading}
            style={{ background: '#10b981', border: 0, color: '#fff', padding: '11px 18px', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Lendo arquivo…' : 'Selecionar CSV ou XLSX'}
          </button>
        </div>}

        {step === 2 && <>
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={{ color: '#fafafa', fontSize: 15, margin: '0 0 4px' }}>Mapeie as colunas</h3>
            <p style={{ color: '#a1a1aa', fontSize: 13, margin: '0 0 16px' }}>{file?.name} · {rows.length.toLocaleString('pt-BR')} linhas encontradas</p>
            <div className="import-mapping-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
              {IMPORT_FIELDS.map(field => <label key={field.key} style={{ color: '#d4d4d8', fontSize: 12 }}>
                {field.label}{field.required ? ' *' : ''}
                <select value={mapping[field.key] ?? ''} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value }))}
                  style={{ ...input, marginTop: 5 }}>
                  <option value="">Não importar</option>
                  {headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}
                </select>
              </label>)}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" onClick={() => setStep(1)} style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#d4d4d8', padding: '10px 16px' }}>Trocar arquivo</button>
            <button type="button" onClick={() => setStep(3)} disabled={mapping.name === ''}
              style={{ background: '#10b981', border: 0, color: '#fff', padding: '10px 16px', fontWeight: 700, opacity: mapping.name === '' ? .5 : 1 }}>
              Revisar importação <ArrowRight size={14} />
            </button>
          </div>
        </>}

        {step === 3 && <>
          <div className="import-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[['Linhas válidas', valid.length, '#10b981'], ['Rejeitadas', rejected.length, '#ef4444'], ['Total', parsed.length, '#e4e4e7']].map(([label, value, color]) =>
              <div key={label} style={card}><div style={{ color, fontSize: 24, fontWeight: 800 }}>{value}</div><div style={{ color: '#a1a1aa', fontSize: 12 }}>{label}</div></div>)}
          </div>
          <div style={{ ...card, marginBottom: 16 }}>
            <div className="import-meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ color: '#d4d4d8', fontSize: 12 }}>Nome da importação<input value={keyword} onChange={e => setKeyword(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ color: '#d4d4d8', fontSize: 12 }}>Cidade (opcional)<input value={city} onChange={e => setCity(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
              <legend style={{ color: '#d4d4d8', fontSize: 12, marginBottom: 8 }}>Quando a empresa já existir</legend>
              {[['merge', 'Mesclar dados preenchendo campos vazios'], ['skip', 'Manter os dados atuais'], ['overwrite', 'Substituir pelos dados da planilha']].map(([value, label]) =>
                <label key={value} style={{ display: 'block', color: '#a1a1aa', fontSize: 13, marginBottom: 7 }}><input type="radio" name="conflict" value={value} checked={conflictStrategy === value} onChange={() => setConflictStrategy(value)} /> {label}</label>)}
            </fieldset>
          </div>
          <div style={{ ...card, overflowX: 'auto', marginBottom: 16 }}>
            <h3 style={{ color: '#fafafa', fontSize: 14, margin: '0 0 10px' }}>Prévia</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Empresa', 'Telefone', 'E-mail', 'Categoria'].map(h => <th key={h} style={{ color: '#a1a1aa', textAlign: 'left', padding: 8, borderBottom: '1px solid #3f3f46' }}>{h}</th>)}</tr></thead>
              <tbody>{valid.slice(0, 8).map(item => <tr key={item.rowNumber}><td style={{ padding: 8 }}>{item.lead.name}</td><td style={{ padding: 8 }}>{item.lead.phone || '—'}</td><td style={{ padding: 8 }}>{item.lead.email || '—'}</td><td style={{ padding: 8 }}>{item.lead.category || '—'}</td></tr>)}</tbody></table>
            {rejected.length > 0 && <p style={{ color: '#fca5a5', fontSize: 12, marginBottom: 0 }}>Linhas rejeitadas: {rejected.slice(0, 5).map(item => `${item.rowNumber} (${item.errors.join(', ')})`).join('; ')}{rejected.length > 5 ? '…' : ''}</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" onClick={() => setStep(2)} disabled={loading} style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#d4d4d8', padding: '10px 16px' }}>Voltar</button>
            <button type="button" onClick={importRows} disabled={loading || !valid.length}
              style={{ background: '#10b981', border: 0, color: '#fff', padding: '10px 18px', fontWeight: 700, opacity: loading || !valid.length ? .5 : 1 }}>
              {loading ? 'Importando…' : `Importar ${valid.length.toLocaleString('pt-BR')} leads`}
            </button>
          </div>
        </>}

        {step === 4 && <div role="status" style={{ ...card, textAlign: 'center', padding: 42 }}>
          <Check size={42} color="#10b981" />
          <h3 style={{ color: '#fafafa', margin: '14px 0 8px' }}>Importação concluída</h3>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            {result?.inserted ?? result?.new ?? 0} novos · {result?.merged ?? result?.updated ?? 0} mesclados · {rejected.length} rejeitados
          </p>
          <button type="button" onClick={close} style={{ background: '#10b981', border: 0, color: '#fff', padding: '10px 18px', fontWeight: 700 }}>Concluir</button>
        </div>}
      </div>
    </div>
  );
}
