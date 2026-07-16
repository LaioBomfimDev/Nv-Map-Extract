export const IMPORT_FIELDS = [
  { key: 'name', label: 'Nome da empresa', required: true, aliases: ['name', 'nome', 'empresa', 'title', 'titulo', 'título'] },
  { key: 'phone', label: 'Telefone', aliases: ['phone', 'telefone', 'fone', 'celular', 'whatsapp'] },
  { key: 'email', label: 'E-mail', aliases: ['email', 'e-mail', 'mail'] },
  { key: 'website', label: 'Site', aliases: ['website', 'site', 'url'] },
  { key: 'address', label: 'Endereço', aliases: ['address', 'endereco', 'endereço', 'localizacao', 'localização'] },
  { key: 'category', label: 'Categoria', aliases: ['category', 'categoria', 'ramo', 'segmento'] },
  { key: 'rating', label: 'Nota', aliases: ['rating', 'nota', 'avaliacao', 'avaliação'] },
  { key: 'reviews_count', label: 'Avaliações', aliases: ['reviews_count', 'reviews', 'avaliacoes', 'avaliações'] },
  { key: 'latitude', label: 'Latitude', aliases: ['latitude', 'lat'] },
  { key: 'longitude', label: 'Longitude', aliases: ['longitude', 'lng', 'lon'] },
  { key: 'place_id', label: 'Google Place ID', aliases: ['place_id', 'placeid', 'google_place_id'] },
  { key: 'instagram', label: 'Instagram', aliases: ['instagram', 'insta'] },
  { key: 'facebook', label: 'Facebook', aliases: ['facebook', 'fb'] },
  { key: 'linkedin', label: 'LinkedIn', aliases: ['linkedin'] },
  { key: 'twitter', label: 'X / Twitter', aliases: ['twitter', 'x'] },
  { key: 'youtube', label: 'YouTube', aliases: ['youtube'] },
];

const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

export function parseDelimitedLine(line, delimiter) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(value.trim());
      value = '';
    } else value += char;
  }
  out.push(value.trim());
  return out;
}

export function detectDelimiter(text) {
  const sample = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(0, 8);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const counts = sample.map(line => parseDelimitedLine(line, delimiter).length);
    const common = counts.length ? Math.max(...counts) : 0;
    const stable = counts.filter(n => n === common).length;
    const score = common > 1 ? common * stable : 0;
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

export function parseDelimitedText(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const rows = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '"') {
      current += char;
      if (quoted && clean[i + 1] === '"') { current += clean[i + 1]; i += 1; }
      else quoted = !quoted;
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && clean[i + 1] === '\n') i += 1;
      if (current.trim()) rows.push(parseDelimitedLine(current, delimiter));
      current = '';
    } else current += char;
  }
  if (current.trim()) rows.push(parseDelimitedLine(current, delimiter));
  return { rows, delimiter };
}

export function autoMapHeaders(headers) {
  const result = {};
  const normalizedHeaders = headers.map(normalize);
  IMPORT_FIELDS.forEach(field => {
    const aliases = field.aliases.map(normalize);
    const index = normalizedHeaders.findIndex(header => aliases.includes(header));
    result[field.key] = index >= 0 ? String(index) : '';
  });
  return result;
}

function cleanNumber(value) {
  if (value === '' || value == null) return '';
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) ? number : '';
}

export function rowsToLeads(rows, mapping) {
  return rows.map((row, rowIndex) => {
    const lead = {};
    IMPORT_FIELDS.forEach(field => {
      const index = mapping[field.key] === '' ? -1 : Number(mapping[field.key]);
      let value = index >= 0 ? row[index] ?? '' : '';
      if (['rating', 'reviews_count', 'latitude', 'longitude'].includes(field.key)) value = cleanNumber(value);
      else value = String(value ?? '').trim();
      lead[field.key] = value;
    });
    const errors = [];
    if (!lead.name) errors.push('nome ausente');
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('e-mail inválido');
    if (lead.latitude !== '' && (lead.latitude < -90 || lead.latitude > 90)) errors.push('latitude inválida');
    if (lead.longitude !== '' && (lead.longitude < -180 || lead.longitude > 180)) errors.push('longitude inválida');
    return { lead, rowNumber: rowIndex + 2, errors };
  });
}
