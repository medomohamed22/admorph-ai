// Dependency-free stored-ZIP writer (no compression, no jszip). Entries
// are written with method 0 and a real CRC-32, so any unzip tool can read
// the archive. Pure and unit tested by parsing the archive back.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = ((date.getFullYear() - 1980) & 0x7f) << 9 | ((date.getMonth() + 1) & 0x0f) << 5 | (date.getDate() & 0x1f);
  return { time, date: day };
}

export function writeZip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date: dosDate } = dosDateTime(date);
  const push = (target: Uint8Array[], bytes: Uint8Array) => {
    target.push(bytes);
  };
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    push(chunks, new Uint8Array(local.buffer));
    push(chunks, name);
    push(chunks, entry.data);
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, dosDate, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, entry.data.length, true);
    header.setUint32(24, entry.data.length, true);
    header.setUint16(28, name.length, true);
    header.setUint16(30, 0, true);
    header.setUint16(32, 0, true);
    header.setUint16(34, 0, true);
    header.setUint16(36, 0, true);
    header.setUint32(38, 0, true);
    header.setUint32(42, offset, true);
    push(central, new Uint8Array(header.buffer));
    push(central, name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const part of central) centralSize += part.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...chunks, ...central, new Uint8Array(end.buffer)]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
