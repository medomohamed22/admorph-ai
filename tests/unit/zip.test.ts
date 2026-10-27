import { describe, expect, it } from 'vitest';
import { crc32, writeZip } from '../../src/lib/export/zip';

function parseBack(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 8, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  expect(cdSize).toBe(bytes.length - 22 - cdOffset);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; crc: number; size: number; offset: number }> = [];
  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.push({ name, crc, size, offset });
    at += 46 + nameLength;
  }
  return entries;
}

describe('stored zip writer', () => {
  it('matches the known CRC-32 vector and round-trips entries', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    const hello = new TextEncoder().encode('hello');
    const world = new TextEncoder().encode('world!');
    const bytes = writeZip([
      { name: 'ad-1.txt', data: hello },
      { name: 'ad-2.txt', data: world },
    ]);
    const entries = parseBack(bytes);
    expect(entries.map((entry) => entry.name)).toEqual(['ad-1.txt', 'ad-2.txt']);
    expect(entries[0].crc).toBe(crc32(hello));
    expect(entries[0].size).toBe(hello.length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (const entry of entries) {
      expect(view.getUint32(entry.offset, true)).toBe(0x04034b50);
      const nameLength = view.getUint16(entry.offset + 26, true);
      const dataStart = entry.offset + 30 + nameLength;
      expect(bytes.subarray(dataStart, dataStart + entry.size)).toEqual(
        entry.name === 'ad-1.txt' ? hello : world,
      );
    }
  });

  it('writes an empty archive', () => {
    const bytes = writeZip([]);
    expect(parseBack(bytes)).toEqual([]);
  });
});
