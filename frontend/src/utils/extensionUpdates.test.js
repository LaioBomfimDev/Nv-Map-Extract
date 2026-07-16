import {
  compareVersions,
  deriveUpdateStatus,
  readUpdateMetadataCache,
  sanitizeDownloadUrl,
  sanitizeUpdateMetadata,
  UPDATE_METADATA_TTL_MS,
  UPDATE_STATUS,
  writeUpdateMetadataCache,
} from './extensionUpdates';

const metadata = {
  schemaVersion: 1,
  latest: {
    version: '2.1.0',
    minimumSupportedVersion: '2.0.0',
    minimumChromeVersion: '102',
    channel: 'stable',
    title: 'Versão estável',
    releasedAt: '2026-07-11',
    downloadUrl: '/downloads/friendly-miner-2.1.0.zip',
    sha256: 'a'.repeat(64),
    sizeBytes: 34737,
  },
  history: [{ version: '2.1.0', title: 'Atualização', releasedAt: '2026-07-11', changes: ['Correções.'] }],
};

describe('comparação de versões da extensão', () => {
  test.each([
    ['2.1.0', '2.0.9', 1],
    ['2.0', '2.0.0', 0],
    ['1.9.9', '2.0.0', -1],
    ['inválida', '2.0.0', null],
  ])('compara %s com %s', (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });
});

describe('catálogo de atualizações', () => {
  test('normaliza os campos usados pela interface', () => {
    const result = sanitizeUpdateMetadata(metadata, 'https://nv-map-extract.vercel.app/?tab=updates');
    expect(result.latest).toMatchObject({
      version: '2.1.0',
      minimumSupportedVersion: '2.0.0',
      minimumChromeVersion: '102',
      channel: 'stable',
      downloadUrl: 'https://nv-map-extract.vercel.app/downloads/friendly-miner-2.1.0.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 34737,
    });
  });

  test.each([
    // eslint-disable-next-line no-script-url -- valor malicioso intencional para testar a sanitização
    'javascript:alert(1)',
    'data:text/html,conteudo',
    'http://example.com/extensao.zip',
    'https://usuario:senha@example.com/extensao.zip',
  ])('recusa download inseguro: %s', (downloadUrl) => {
    expect(() => sanitizeUpdateMetadata({
      ...metadata,
      latest: { ...metadata.latest, downloadUrl },
    }, 'https://nv-map-extract.vercel.app/')).toThrow(/seguro/i);
  });

  test('aceita HTTP somente em localhost para desenvolvimento', () => {
    expect(sanitizeDownloadUrl('/downloads/extensao.zip', 'http://localhost:3000/'))
      .toBe('http://localhost:3000/downloads/extensao.zip');
    expect(sanitizeDownloadUrl('http://example.com/extensao.zip')).toBe('');
  });

  test('recusa canal, versão mínima e checksum inválidos', () => {
    expect(() => sanitizeUpdateMetadata({ ...metadata, latest: { ...metadata.latest, channel: 'nightly' } })).toThrow(/canal/i);
    expect(() => sanitizeUpdateMetadata({ ...metadata, latest: { ...metadata.latest, minimumChromeVersion: 'Chrome 102' } })).toThrow(/Chrome/i);
    expect(() => sanitizeUpdateMetadata({ ...metadata, latest: { ...metadata.latest, sha256: 'curto' } })).toThrow(/SHA-256/i);
  });
});

describe('estado da Central de Atualizações', () => {
  const base = {
    extensionPhase: 'ready',
    metadataPhase: 'ready',
    installed: true,
    installedVersion: '2.1.0',
    latestVersion: '2.1.0',
    minimumSupportedVersion: '2.0.0',
  };

  test.each([
    [{ ...base, extensionPhase: 'checking' }, UPDATE_STATUS.CHECKING],
    [{ ...base, metadataPhase: 'error' }, UPDATE_STATUS.METADATA_ERROR],
    [{ ...base, installed: false, installedVersion: '' }, UPDATE_STATUS.MISSING],
    [{ ...base, installedVersion: '2.1.0' }, UPDATE_STATUS.CURRENT],
    [{ ...base, installedVersion: '2.0.5' }, UPDATE_STATUS.OUTDATED],
    [{ ...base, installedVersion: '1.9.9' }, UPDATE_STATUS.INCOMPATIBLE],
    [{ ...base, installedVersion: '' }, UPDATE_STATUS.INCOMPATIBLE],
  ])('deriva o estado %s', (input, expected) => {
    expect(deriveUpdateStatus(input)).toBe(expected);
  });
});

describe('cache com TTL', () => {
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };

  beforeEach(() => {
    storage.value = null;
  });

  test('reutiliza o último catálogo válido dentro do TTL', () => {
    const now = 1_800_000_000_000;
    const sanitized = sanitizeUpdateMetadata(metadata, 'https://nv-map-extract.vercel.app/');
    expect(writeUpdateMetadataCache(storage, sanitized, now)).toBe(true);
    expect(readUpdateMetadataCache(storage, now + UPDATE_METADATA_TTL_MS - 1, 'https://nv-map-extract.vercel.app/'))
      .toMatchObject({ metadata: sanitized, cachedAt: now, isFresh: true });
  });

  test('mantém o catálogo vencido como fallback, mas o marca como antigo', () => {
    const now = 1_800_000_000_000;
    const sanitized = sanitizeUpdateMetadata(metadata, 'https://nv-map-extract.vercel.app/');
    writeUpdateMetadataCache(storage, sanitized, now);
    expect(readUpdateMetadataCache(storage, now + UPDATE_METADATA_TTL_MS, 'https://nv-map-extract.vercel.app/'))
      .toMatchObject({ cachedAt: now, isFresh: false });
  });
});
