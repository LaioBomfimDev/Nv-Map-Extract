export const UPDATE_METADATA_CACHE_KEY = 'fm:update-metadata:v1';
export const UPDATE_METADATA_TTL_MS = 15 * 60 * 1000;

export const UPDATE_STATUS = Object.freeze({
  CHECKING: 'checking',
  MISSING: 'missing',
  CURRENT: 'current',
  OUTDATED: 'outdated',
  INCOMPATIBLE: 'incompatible',
  METADATA_ERROR: 'metadataError',
});

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/;
const SHA256_PATTERN = /^[a-f\d]{64}$/i;

function cleanText(value, fallback = '', maxLength = 500) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

export function isValidExtensionVersion(value) {
  if (!VERSION_PATTERN.test(String(value || ''))) return false;
  return String(value).split('.').every(part => Number(part) <= 65535);
}

export function compareVersions(a, b) {
  if (!isValidExtensionVersion(a) || !isValidExtensionVersion(b)) return null;
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference > 0) return 1;
    if (difference < 0) return -1;
  }
  return 0;
}

export function createRequestId(prefix = 'fm') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}:${crypto.randomUUID()}`;
    }
  } catch (_) {}

  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

export function sanitizeDownloadUrl(value, baseUrl = 'https://invalid.local/') {
  const raw = cleanText(value, '', 2048);
  if (!raw) return '';

  try {
    const url = new URL(raw, baseUrl);
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function sanitizeHistoryItem(item) {
  if (!item || typeof item !== 'object' || !isValidExtensionVersion(item.version)) return null;

  return {
    version: item.version,
    title: cleanText(item.title, `Versão ${item.version}`, 160),
    releasedAt: cleanText(item.releasedAt, '', 32),
    changes: Array.isArray(item.changes)
      ? item.changes.map(change => cleanText(change, '', 300)).filter(Boolean).slice(0, 30)
      : [],
  };
}

export function sanitizeUpdateMetadata(data, baseUrl) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('O catálogo de atualizações retornou um formato inválido.');
  }

  const source = data.latest;
  if (!source || typeof source !== 'object' || !isValidExtensionVersion(source.version)) {
    throw new Error('O catálogo não informa uma versão mais recente válida.');
  }

  const minimumSupportedVersion = source.minimumSupportedVersion || '0.0.0';
  if (!isValidExtensionVersion(minimumSupportedVersion)) {
    throw new Error('O catálogo informa uma versão mínima inválida.');
  }
  if (compareVersions(minimumSupportedVersion, source.version) > 0) {
    throw new Error('A versão mínima não pode ser maior que a versão mais recente.');
  }

  const channel = cleanText(source.channel, 'stable', 20).toLowerCase();
  if (!['stable', 'beta', 'preview'].includes(channel)) {
    throw new Error('O catálogo informa um canal de atualização inválido.');
  }
  const minimumChromeVersion = cleanText(source.minimumChromeVersion, '', 32);
  if (minimumChromeVersion && !isValidExtensionVersion(minimumChromeVersion)) {
    throw new Error('O catálogo informa uma versão mínima do Chrome inválida.');
  }

  const requestedDownloadUrl = cleanText(source.downloadUrl, '', 2048);
  const downloadUrl = sanitizeDownloadUrl(requestedDownloadUrl, baseUrl);
  if (requestedDownloadUrl && !downloadUrl) {
    throw new Error('O endereço de download do catálogo não é seguro.');
  }

  const sha256 = cleanText(source.sha256, '', 64);
  if (sha256 && !SHA256_PATTERN.test(sha256)) {
    throw new Error('A assinatura SHA-256 do arquivo é inválida.');
  }

  const sizeBytes = Number(source.sizeBytes) || 0;
  const history = Array.isArray(data.history)
    ? data.history.map(sanitizeHistoryItem).filter(Boolean).slice(0, 50)
    : [];

  return {
    schemaVersion: Number(data.schemaVersion) || 1,
    latest: {
      version: source.version,
      minimumSupportedVersion,
      minimumChromeVersion,
      channel,
      title: cleanText(source.title, `Versão ${source.version}`, 160),
      releasedAt: cleanText(source.releasedAt, '', 32),
      downloadUrl,
      notes: cleanText(source.notes, '', 500),
      sha256,
      sizeBytes: sizeBytes > 0 ? Math.floor(sizeBytes) : 0,
    },
    history,
  };
}

export function deriveUpdateStatus({
  extensionPhase,
  metadataPhase,
  installed,
  installedVersion,
  latestVersion,
  minimumSupportedVersion,
}) {
  if (extensionPhase === 'checking' || metadataPhase === 'checking') {
    return UPDATE_STATUS.CHECKING;
  }
  if (metadataPhase === 'error') return UPDATE_STATUS.METADATA_ERROR;
  if (!installed) return UPDATE_STATUS.MISSING;

  if (!isValidExtensionVersion(installedVersion)) return UPDATE_STATUS.INCOMPATIBLE;
  if (compareVersions(installedVersion, minimumSupportedVersion || '0.0.0') < 0) {
    return UPDATE_STATUS.INCOMPATIBLE;
  }
  if (compareVersions(installedVersion, latestVersion) < 0) return UPDATE_STATUS.OUTDATED;
  return UPDATE_STATUS.CURRENT;
}

export function readUpdateMetadataCache(storage, now = Date.now(), baseUrl) {
  if (!storage || typeof storage.getItem !== 'function') return null;

  try {
    const cached = JSON.parse(storage.getItem(UPDATE_METADATA_CACHE_KEY) || 'null');
    if (!cached || !Number.isFinite(cached.cachedAt)) return null;
    const metadata = sanitizeUpdateMetadata(cached.metadata, baseUrl);
    return {
      metadata,
      cachedAt: cached.cachedAt,
      isFresh: now - cached.cachedAt >= 0 && now - cached.cachedAt < UPDATE_METADATA_TTL_MS,
    };
  } catch (_) {
    return null;
  }
}

export function writeUpdateMetadataCache(storage, metadata, cachedAt = Date.now()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(UPDATE_METADATA_CACHE_KEY, JSON.stringify({ cachedAt, metadata }));
    return true;
  } catch (_) {
    return false;
  }
}
