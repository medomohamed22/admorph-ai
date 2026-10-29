import { inspectOneshotLayout, type InspectCode } from '../oneshot/rules';
import type { OneshotCanvasElement, VerifyResult } from '../ai/oneshot';

export type EvidenceCheck = { code: string; status: 'pass' | 'fail'; detail: string };
export type CertificateStatus = 'valid' | 'cleared_after_edit' | 'none';

export type EvidenceManifest = {
  version: 1;
  creativeId: string;
  createdAt: string;
  originalProductHash: string;
  productSourceHash: string;
  finalExportHash: string;
  modelIds: { planner?: string; image?: string; vision?: string; segment?: string };
  ruleVersion: string;
  deterministicChecks: EvidenceCheck[];
  modelJudgment: {
    score: number | null;
    productKept: boolean | null;
    logoKept: boolean | null;
    layoutKept: boolean | null;
    texts: { expected: string; found: string; match: boolean }[];
  } | null;
  certificateStatus: CertificateStatus;
  failedChecks: string[];
};

const RULE_CODES: InspectCode[] = ['overlap_product', 'overlap_text', 'overlap_logo', 'low_contrast', 'outside_safe_zone'];

/** SHA-256 of a blob's bytes, lowercase hex. Pure and offline. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** One outcome per rule for a layout: pass when the rule finds nothing. */
export function deterministicChecksFor(elements: OneshotCanvasElement[]): EvidenceCheck[] {
  const findings = inspectOneshotLayout(elements);
  return RULE_CODES.map(code => {
    const found = findings.filter(item => item.code === code);
    return { code, status: found.length === 0 ? 'pass' : 'fail', detail: found.map(item => item.elementIds.join(',')).join('; ') };
  });
}

/**
 * Content signature of a mockup + brand: identical arrangements give
 * identical signatures, any move/resize/recolor/reword changes it. Blobs
 * are excluded on purpose (a re-cut product keeps its geometry). Used to
 * invalidate the on-screen certificate the moment the mockup changes.
 */
export function mockupSignature(elements: OneshotCanvasElement[], brand: { name: string; description: string; colors: readonly string[] }): string {
  const layout = elements.map(item => [item.id, item.kind, item.x, item.y, item.width, item.height, item.text ?? '', item.color ?? '', item.fontSize ?? 0, item.fontFamily ?? ''].join('|')).join(';');
  return `${layout}#${[brand.name, brand.description, ...brand.colors].join('|')}`;
}

export function buildManifest(input: {
  creativeId: string; createdAt: string;
  originalProductHash: string; productSourceHash: string; finalExportHash: string;
  modelIds: EvidenceManifest['modelIds']; ruleVersion: string;
  layout: OneshotCanvasElement[];
  certificate: VerifyResult | null; score: number | null;
  certificateStatus: CertificateStatus;
}): EvidenceManifest {
  const deterministicChecks = deterministicChecksFor(input.layout);
  const failedChecks = deterministicChecks.filter(item => item.status === 'fail').map(item => item.code);
  if (input.certificate) {
    if (!input.certificate.productKept) failedChecks.push('product_not_kept');
    if (!input.certificate.layoutKept) failedChecks.push('layout_not_kept');
    for (const text of input.certificate.texts) if (!text.match) failedChecks.push(`text_mismatch:${text.id}`);
  }
  return {
    version: 1,
    creativeId: input.creativeId,
    createdAt: input.createdAt,
    originalProductHash: input.originalProductHash,
    productSourceHash: input.productSourceHash,
    finalExportHash: input.finalExportHash,
    modelIds: input.modelIds,
    ruleVersion: input.ruleVersion,
    deterministicChecks,
    modelJudgment: input.certificate ? {
      score: input.score,
      productKept: input.certificate.productKept,
      logoKept: input.certificate.logoKept,
      layoutKept: input.certificate.layoutKept,
      texts: input.certificate.texts.map(item => ({ expected: item.expected, found: item.found, match: item.match })),
    } : null,
    certificateStatus: input.certificateStatus,
    failedChecks,
  };
}
