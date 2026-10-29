import { describe, expect, it } from 'vitest';
import { sha256Hex, buildManifest, deterministicChecksFor, mockupSignature } from '../../src/lib/evidence/manifest';
import type { OneshotCanvasElement } from '../../src/lib/ai/oneshot';

const product: OneshotCanvasElement = { id: 'product', kind: 'product', x: 340, y: 380, width: 400, height: 600 };
const brand = { name: 'Sora', description: 'Matcha.', colors: ['#52633c', '#dce5bb', '#f2d1bc'] as [string, string, string] };

describe('sha256Hex', () => {
  it('matches the known SHA-256 vector', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('deterministicChecksFor', () => {
  it('fails only the violated rules', () => {
    const overlapping: OneshotCanvasElement = { id: 't1', kind: 'text', x: 140, y: 500, width: 800, height: 120, text: 'Hello' };
    const checks = deterministicChecksFor([product, overlapping]);
    expect(checks.find(item => item.code === 'overlap_product')?.status).toBe('fail');
    expect(checks.find(item => item.code === 'low_contrast')?.status).toBe('pass');
    expect(checks).toHaveLength(5);
  });
});

describe('buildManifest', () => {
  it('records hashes, model IDs and failures without any secret', () => {
    const manifest = buildManifest({
      creativeId: 'test-id', createdAt: '2026-10-29T00:00:00.000Z',
      originalProductHash: 'aa', productSourceHash: 'bb', finalExportHash: 'cc',
      modelIds: { image: 'muse-image-1.0', segment: 'sam-3.1' }, ruleVersion: '1',
      layout: [product, { id: 't1', kind: 'text', x: 140, y: 500, width: 800, height: 120, text: 'Hello' }],
      certificate: { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 't1', expected: 'Hello', found: 'Hallo', match: false }] },
      score: 90, certificateStatus: 'valid',
    });
    expect(manifest.version).toBe(1);
    expect(manifest.finalExportHash).toBe('cc');
    expect(manifest.modelIds.image).toBe('muse-image-1.0');
    expect(manifest.modelJudgment?.score).toBe(90);
    expect(manifest.failedChecks).toContain('overlap_product');
    expect(manifest.failedChecks).toContain('text_mismatch:t1');
    expect(JSON.stringify(manifest)).not.toContain('fixture');
  });
  it('reports no judgment when the certificate was cleared', () => {
    const manifest = buildManifest({
      creativeId: 'test-id', createdAt: '2026-10-29T00:00:00.000Z',
      originalProductHash: 'aa', productSourceHash: 'aa', finalExportHash: 'cc',
      modelIds: {}, ruleVersion: '1', layout: [product],
      certificate: null, score: null, certificateStatus: 'cleared_after_edit',
    });
    expect(manifest.modelJudgment).toBeNull();
    expect(manifest.certificateStatus).toBe('cleared_after_edit');
  });
});

describe('mockupSignature', () => {
  it('is stable for identical content and changes on any edit', () => {
    const base = mockupSignature([product], brand);
    expect(mockupSignature([product], brand)).toBe(base);
    expect(mockupSignature([{ ...product, x: 341 }], brand)).not.toBe(base);
    expect(mockupSignature([product], { ...brand, name: 'Other' })).not.toBe(base);
  });
});
