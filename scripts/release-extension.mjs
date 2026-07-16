import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const FEED_PATH = path.join(ROOT, 'frontend', 'public', 'updates.json');
const PRODUCTION_APP_URL = 'https://nv-map-extract.vercel.app';
const args = new Set(process.argv.slice(2));
const validateOnly = args.has('--validate');
const configFileArg = process.argv.find(argument => argument.startsWith('--config-file='));

const REQUIRED_FILES = [
  'authBridge.js',
  'bg.js',
  'contentScript.js',
  'contentScript2.js',
  'dashboard.html',
  'injected.js',
  'manifest.json',
  'popup.html',
  'css/contentScript.css',
  'css/style.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'js/dashboard.js',
  'js/emailExtractor.js',
  'js/popup.js',
];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function fail(message) {
  throw new Error(`[release-extension] ${message}`);
}

function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1;
    if ((a[index] || 0) < (b[index] || 0)) return -1;
  }
  return 0;
}

function assertVersion(value, label) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(String(value || ''))) fail(`${label} inválida: ${value || 'vazia'}.`);
}

function assertSafePublicUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { fail(`${label} inválida.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(`${label} precisa usar HTTPS e não pode conter credenciais.`);
  return parsed.href.replace(/\/$/, '');
}

function readConfigValue(source, name) {
  const expression = new RegExp(`${name}\\s*:\\s*(['\"])(.*?)\\1`);
  return source.match(expression)?.[2] || '';
}

async function resolvePublicConfig() {
  let fileConfig = {};
  if (configFileArg) {
    const relativePath = configFileArg.slice('--config-file='.length);
    const absolutePath = path.resolve(ROOT, relativePath);
    const source = await readFile(absolutePath, 'utf8');
    fileConfig = {
      SUPABASE_URL: readConfigValue(source, 'SUPABASE_URL'),
      SUPABASE_ANON_KEY: readConfigValue(source, 'SUPABASE_ANON_KEY'),
    };
  }

  const supabaseUrl = process.env.FM_SUPABASE_URL || fileConfig.SUPABASE_URL;
  const anonKey = process.env.FM_SUPABASE_ANON_KEY || fileConfig.SUPABASE_ANON_KEY;
  const appUrl = process.env.FM_APP_URL || PRODUCTION_APP_URL;

  assertSafePublicUrl(supabaseUrl, 'FM_SUPABASE_URL');
  if (!anonKey || /service[_-]?role/i.test(anonKey) || /\s/.test(anonKey)) {
    fail('FM_SUPABASE_ANON_KEY deve conter apenas a chave pública anon/publishable, nunca service_role.');
  }
  if (anonKey.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') fail('Uma chave service_role nunca pode entrar na extensão.');
    } catch (error) {
      if (String(error.message).startsWith('[release-extension]')) throw error;
    }
  }
  if (assertSafePublicUrl(appUrl, 'FM_APP_URL') !== PRODUCTION_APP_URL) {
    fail(`FM_APP_URL de release deve ser ${PRODUCTION_APP_URL}.`);
  }

  return { SUPABASE_URL: supabaseUrl.replace(/\/$/, ''), SUPABASE_ANON_KEY: anonKey, APP_URL: PRODUCTION_APP_URL };
}

function makeConfigFile(config) {
  return Buffer.from([
    '// Gerado por scripts/release-extension.mjs. A chave anon é pública e protegida por RLS.',
    `const FM_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});`,
    '',
  ].join('\n'));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

function createZip(files, timestamp) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files.sort((left, right) => left.name.localeCompare(right.name))) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const raw = file.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const compressed = deflated.length < raw.length ? deflated : raw;
    const method = compressed === deflated ? 8 : 0;
    const checksum = crc32(raw);
    const { time, day } = dosTimestamp(timestamp);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function readZipEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > archive.length) fail('Cabeçalho local truncado no ZIP.');
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) fail('Entrada truncada no ZIP.');
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) fail(`Caminho inseguro no ZIP: ${name || 'vazio'}.`);
    if (entries.has(name)) fail(`Entrada duplicada no ZIP: ${name}.`);
    const compressed = archive.subarray(dataStart, dataEnd);
    const data = method === 8 ? inflateRawSync(compressed) : (method === 0 ? compressed : null);
    if (!data || data.length !== uncompressedSize) fail(`Entrada inválida no ZIP: ${name}.`);
    entries.set(name, data);
    offset = dataEnd;
  }
  return entries;
}

async function assertArchiveInputs() {
  for (const relativePath of REQUIRED_FILES) {
    const absolutePath = path.join(EXTENSION_DIR, relativePath);
    if (!existsSync(absolutePath) || !(await stat(absolutePath)).isFile()) fail(`Arquivo obrigatório ausente: extension/${relativePath}.`);
  }

  const topLevel = await readdir(EXTENSION_DIR);
  const forbidden = topLevel.filter(name => /(^\.env|secret|service.?role|credentials)/i.test(name));
  if (forbidden.length) fail(`Arquivos potencialmente secretos encontrados: ${forbidden.join(', ')}.`);
}

async function validateRelease(manifest, feed, archivePath) {
  assertVersion(manifest.version, 'Versão do manifest');
  assertVersion(feed.latest?.version, 'Versão do catálogo');
  assertVersion(feed.latest?.minimumSupportedVersion, 'Versão mínima');
  if (manifest.version !== feed.latest.version) fail('manifest.json e updates.json estão com versões diferentes.');
  if (!['stable', 'beta', 'preview'].includes(feed.latest.channel)) fail('O canal do catálogo deve ser stable, beta ou preview.');
  assertVersion(feed.latest.minimumChromeVersion, 'Versão mínima do Chrome');
  if (manifest.minimum_chrome_version !== feed.latest.minimumChromeVersion) {
    fail('minimum_chrome_version do manifest e minimumChromeVersion do catálogo estão diferentes.');
  }
  if (compareVersions(feed.latest.minimumSupportedVersion, feed.latest.version) > 0) fail('A versão mínima é maior que a versão publicada.');

  const expectedDownload = `/downloads/friendly-miner-${manifest.version}.zip`;
  if (feed.latest.downloadUrl !== expectedDownload) fail(`downloadUrl deve ser ${expectedDownload}.`);
  if (!existsSync(archivePath)) fail(`Artefato ausente: ${path.relative(ROOT, archivePath)}.`);

  const archive = await readFile(archivePath);
  const sha256 = createHash('sha256').update(archive).digest('hex');
  if (feed.latest.sha256 !== sha256) fail('O SHA-256 do catálogo não corresponde ao ZIP.');
  if (feed.latest.sizeBytes !== archive.length) fail('O tamanho do catálogo não corresponde ao ZIP.');
  if (archive.readUInt32LE(0) !== 0x04034b50) fail('O artefato não é um ZIP válido.');

  const entries = readZipEntries(archive);
  const expectedNames = [...REQUIRED_FILES, 'config.js'].sort();
  const archivedNames = [...entries.keys()].sort();
  if (JSON.stringify(archivedNames) !== JSON.stringify(expectedNames)) {
    fail('O ZIP contém arquivos extras ou não contém todos os arquivos permitidos.');
  }
  for (const relativePath of REQUIRED_FILES) {
    const source = await readFile(path.join(EXTENSION_DIR, relativePath));
    if (!source.equals(entries.get(relativePath))) fail(`O ZIP está desatualizado em relação a extension/${relativePath}.`);
  }
  const archivedManifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
  if (archivedManifest.version !== manifest.version) fail('A versão dentro do ZIP difere do manifest atual.');
  const archivedConfig = entries.get('config.js').toString('utf8');
  if (!archivedConfig.includes(PRODUCTION_APP_URL) || /service[_-]?role/i.test(archivedConfig)) {
    fail('O config.js do ZIP não é uma configuração pública de produção segura.');
  }
  return { sha256, sizeBytes: archive.length };
}

const manifest = JSON.parse(await readFile(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const feed = JSON.parse(await readFile(FEED_PATH, 'utf8'));
assertVersion(manifest.version, 'Versão do manifest');
const expectedDownload = `/downloads/friendly-miner-${manifest.version}.zip`;
const archivePath = path.join(ROOT, 'frontend', 'public', expectedDownload);

if (!validateOnly) {
  await assertArchiveInputs();
  const config = await resolvePublicConfig();
  const files = await Promise.all(REQUIRED_FILES.map(async name => ({ name, data: await readFile(path.join(EXTENSION_DIR, name)) })));
  files.push({ name: 'config.js', data: makeConfigFile(config) });

  const releaseDate = new Date(`${feed.latest.releasedAt || '2026-01-01'}T00:00:00Z`);
  const archive = createZip(files, releaseDate);
  const sha256 = createHash('sha256').update(archive).digest('hex');
  feed.latest.downloadUrl = expectedDownload;
  feed.latest.sha256 = sha256;
  feed.latest.sizeBytes = archive.length;

  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, archive);
  await writeFile(FEED_PATH, `${JSON.stringify(feed, null, 2)}\n`);
}

const result = await validateRelease(
  JSON.parse(await readFile(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8')),
  JSON.parse(await readFile(FEED_PATH, 'utf8')),
  archivePath,
);
console.log(`Extensão ${manifest.version} validada: ${path.relative(ROOT, archivePath)} (${result.sizeBytes} bytes, SHA-256 ${result.sha256}).`);
