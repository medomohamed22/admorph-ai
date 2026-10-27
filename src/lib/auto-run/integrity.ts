// Integrity checks for one auto-run result. Everything here is derived
// from data the run itself stored — no model call, no external lookup.
// Labels: Verified (all checks pass, output unmodified), Warning (a check
// failed), Modified (checks pass but the caption or background was changed
// after the run), Not checked (the pixel comparison has not run yet and
// nothing else failed).

import type { AutoRunRecord } from './runner';
import type { AutoResult } from './results';
import type { Asset } from '../db/schema';

export interface PixelCheck {
  preserved: boolean;
  mismatchedPixels: number;
  totalPixels: number;
}

/**
 * The cutout must keep the original product pixels: same dimensions, and
 * every opaque cutout pixel must carry the original RGB at that position.
 * Only the alpha channel may change. Pure and unit tested.
 */
export function verifyProductPixels(original: ImageData, cutout: ImageData): PixelCheck {
  const total = original.width * original.height;
  if (
    original.width !== cutout.width ||
    original.height !== cutout.height ||
    original.data.length !== cutout.data.length
  ) {
    return { preserved: false, mismatchedPixels: total, totalPixels: total };
  }
  let mismatched = 0;
  for (let i = 0; i < original.data.length; i += 4) {
    if (cutout.data[i + 3] === 0) continue;
    if (
      original.data[i] !== cutout.data[i] ||
      original.data[i + 1] !== cutout.data[i + 1] ||
      original.data[i + 2] !== cutout.data[i + 2]
    ) {
      mismatched++;
    }
  }
  return { preserved: mismatched === 0, mismatchedPixels: mismatched, totalPixels: total };
}

export interface AssetMeta {
  kind: Asset['kind'];
  derivedFrom?: string;
  provider?: string;
}

/** Provenance and structure issues, as short codes the UI can render. */
export function checkResultProvenance(
  run: AutoRunRecord,
  result: AutoResult,
  assets: Map<string, AssetMeta>,
): string[] {
  const issues: string[] = [];
  const cutout = run.cutoutAssetId ? assets.get(run.cutoutAssetId) : undefined;
  if (!cutout) issues.push('cutout_missing');
  else {
    if (cutout.kind !== 'cutout') issues.push('cutout_kind');
    if (cutout.provider !== 'local') issues.push('cutout_provider');
    if (cutout.derivedFrom && cutout.derivedFrom !== run.productAssetId) {
      issues.push('cutout_source');
    }
  }
  const background = assets.get(result.backgroundAssetId);
  if (!background) issues.push('background_missing');
  else if (background.kind !== 'background') issues.push('background_kind');
  const backgroundLayer = result.hero.layers.find((layer) => layer.kind === 'background');
  if (!backgroundLayer || backgroundLayer.assetId !== result.backgroundAssetId) {
    issues.push('background_layer');
  }
  const productLayer = result.hero.layers.find((layer) => layer.kind === 'product');
  if (!productLayer || productLayer.assetId !== run.cutoutAssetId) {
    issues.push('product_layer');
  }
  const textLayers = result.hero.layers.filter(
    (layer) => layer.kind === 'brand' || layer.kind === 'headline',
  );
  if (textLayers.some((layer) => layer.fill !== 'transparent')) issues.push('text_box');
  if (result.caption.length === 0 || result.caption.length > 1200) issues.push('caption_length');
  return issues;
}

/** True when the caption or background changed after the run finished. */
export function isResultModified(result: AutoResult, templateCaption: string): boolean {
  return result.caption !== templateCaption || result.backgroundVariant !== 0;
}

export type QualityLabel = 'verified' | 'warning' | 'not_checked' | 'modified';

export function qualityLabel(
  pixel: PixelCheck | null,
  provenanceIssues: string[],
  modified: boolean,
): QualityLabel {
  if (provenanceIssues.length > 0 || (pixel && !pixel.preserved)) return 'warning';
  if (pixel === null) return 'not_checked';
  if (modified) return 'modified';
  return 'verified';
}
