// ============================================================================
// Instalador / Atualizador direto na pasta (File System Access API + DecompressionStream)
// Elimina WinRAR, extração manual e substituição de arquivos em atualizações.
// ============================================================================

const LEGACY_FILES_TO_CLEAN = [
  ['dashboard.html'],
  ['bundle2.js'],
  ['js', 'dashboard.js'],
  ['js', 'mybg.js'],
];

export function canDirectFolderInstall() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    typeof window.DecompressionStream === 'function'
  );
}

export async function computeSha256Hex(arrayBuffer) {
  if (!window.crypto?.subtle) return '';
  const digest = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function inflateRawBytes(compressed) {
  const ds = new window.DecompressionStream('deflate-raw');
  const stream = new Blob([compressed]).stream().pipeThrough(ds);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function unzipArchive(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 22) {
    throw new Error('Arquivo ZIP inválido ou incompleto.');
  }

  // Localiza o End of Central Directory (0x06054b50)
  const minOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Cabeçalho do ZIP não encontrado.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries = [];
  let cursor = cdOffset;

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('Diretório do ZIP corrompido.');
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    cursor += 46 + nameLen + extraLen + commentLen;

    if (!name || name.endsWith('/')) continue;
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || name.includes('\0')) {
      throw new Error(`Caminho inválido dentro do ZIP: ${name}`);
    }

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Entrada inválida no ZIP: ${name}`);
    }
    const lfNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lfExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Dados truncados no ZIP: ${name}`);
    }

    const compressed = bytes.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = await inflateRawBytes(compressed);
    } else {
      throw new Error(`Método de compressão não suportado (${method}) em ${name}`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Tamanho inconsistente após descompactar ${name}`);
    }

    entries.push({ name, data });
  }

  return entries;
}

async function writeEntryToFolder(rootDir, relativePath, data) {
  const parts = relativePath.split('/').filter(Boolean);
  let current = rootDir;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function removeLegacyFiles(rootDir) {
  for (const parts of LEGACY_FILES_TO_CLEAN) {
    try {
      let current = rootDir;
      for (let i = 0; i < parts.length - 1; i += 1) {
        current = await current.getDirectoryHandle(parts[i], { create: false });
      }
      await current.removeEntry(parts[parts.length - 1]);
    } catch (_) {
      // Arquivo legado não existia — ignorar
    }
  }
}

export async function installOrUpdateExtensionInFolder({ downloadUrl, expectedSha256 = '', onStep }) {
  if (!canDirectFolderInstall()) {
    throw new Error('Seu navegador não suporta gravação direta em pasta. Use o download do ZIP.');
  }

  // Solicita a pasta primeiro (mantém o user gesture ativo exigido pelo Chrome)
  let dirHandle;
  try {
    onStep?.('picking');
    dirHandle = await window.showDirectoryPicker({
      id: 'friendly-miner-extension',
      mode: 'readwrite',
      startIn: 'documents',
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    if (err?.name === 'SecurityError') {
      throw new Error('Por segurança, o Chrome bloqueia pastas raiz (como Downloads ou Documentos). Crie ou abra uma subpasta como "FriendlyMiner" e selecione ela.');
    }
    throw new Error(err?.message || 'Não foi possível acessar a pasta selecionada.');
  }

  let hadPreviousManifest = false;
  try {
    await dirHandle.getFileHandle('manifest.json', { create: false });
    hadPreviousManifest = true;
  } catch (_) {
    hadPreviousManifest = false;
  }

  onStep?.('downloading');
  const sep = downloadUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${downloadUrl}${sep}ts=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Falha ao baixar o pacote (${response.status}).`);
  }
  const archiveBuffer = await response.arrayBuffer();

  if (expectedSha256) {
    const actualSha = await computeSha256Hex(archiveBuffer);
    if (actualSha && actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error('A verificação de integridade (SHA-256) falhou. Tente novamente.');
    }
  }

  onStep?.('unzipping');
  const entries = await unzipArchive(archiveBuffer);

  onStep?.('writing');
  await removeLegacyFiles(dirHandle);
  for (const entry of entries) {
    await writeEntryToFolder(dirHandle, entry.name, entry.data);
  }

  return {
    ok: true,
    cancelled: false,
    folderName: dirHandle.name,
    fileCount: entries.length,
    hadPreviousManifest,
  };
}
