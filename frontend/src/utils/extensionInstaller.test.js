import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import { unzipArchive } from './extensionInstaller';

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = NodeTextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = NodeTextDecoder;

function makeStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = new TextEncoder().encode(name);
    const dataBytes = new TextEncoder().encode(content);

    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of [...localParts, ...centralParts, eocd]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out.buffer;
}

describe('extensionInstaller.unzipArchive', () => {
  test('extrai arquivos em raiz e subpastas preservando conteúdo', async () => {
    const zip = makeStoredZip([
      { name: 'manifest.json', content: '{"version":"2.1.2"}' },
      { name: 'js/popup.js', content: 'console.log("ok");' },
    ]);
    const entries = await unzipArchive(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('manifest.json');
    expect(new TextDecoder().decode(entries[0].data)).toBe('{"version":"2.1.2"}');
    expect(entries[1].name).toBe('js/popup.js');
    expect(new TextDecoder().decode(entries[1].data)).toBe('console.log("ok");');
  });

  test('bloqueia caminho inseguro com traversal', async () => {
    const zip = makeStoredZip([{ name: '../evil.js', content: 'x' }]);
    await expect(unzipArchive(zip)).rejects.toThrow('Caminho inválido');
  });
});
