export function firstCsvValue(value) {
  return String(value ?? '').split(',')[0].trim();
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function safeExternalUrl(value) {
  const raw = firstCsvValue(value);
  if (!raw) return '';

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function safeMailto(value) {
  const email = firstCsvValue(value);
  if (!/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(email)) return '';
  return `mailto:${email}`;
}
