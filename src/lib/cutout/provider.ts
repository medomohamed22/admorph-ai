// Cutout provider contract (browser adapter).
//
// Two providers: 'local' runs entirely in the browser and sends no image
// anywhere; 'meta-sam' sends the product photo to Meta's SAM 3.1 through
// the app's own /api/ai/segment route (BYOK, consent-gated) and turns the
// returned mask into an alpha channel. Original RGB is never touched by
// either provider. Availability of 'meta-sam' is dynamic: it needs a Meta
// key and a segment model selected in Settings, so callers check that
// instead of a static flag.

import { applyMask, segmentImageData, type SegmentWarning } from './segment';
import { decodeToImageData, encodePng } from './raster';
import { samCutout, type SamCutoutOptions } from './sam-client';

export type CutoutProviderId = 'local' | 'meta-sam';

export interface CutoutResult {
  /** Grayscale PNG rendering of the alpha mask at source dimensions. */
  maskBlob: Blob;
  /** Transparent PNG: original RGB + generated alpha. */
  cutoutBlob: Blob;
  sourceWidth: number;
  sourceHeight: number;
  provider: CutoutProviderId;
  reliable: boolean;
  warnings: SegmentWarning[];
}

/** SAM prompt for every product cutout. Kept to the single word that SAM
 * answered with mask records live (Oct 28, before PR #43): the longer
 * "excluding props/garnish/..." wording introduced in PR #43 correlates
 * exactly with every live SAM run returning zero mask records, so it was
 * reverted. The bottom-roughness detector remains the guard for torn
 * bottom edges. */
export const SAM_PRODUCT_PROMPT = 'product';

export async function localCutout(blob: Blob): Promise<CutoutResult> {
  const image = await decodeToImageData(blob);
  const segment = segmentImageData(image.data, image.width, image.height);
  const cutoutData = applyMask(image.data, segment.mask);
  const maskData = new Uint8ClampedArray(segment.mask.length * 4);
  for (let i = 0; i < segment.mask.length; i++) {
    maskData[i * 4] = segment.mask[i];
    maskData[i * 4 + 1] = segment.mask[i];
    maskData[i * 4 + 2] = segment.mask[i];
    maskData[i * 4 + 3] = 255;
  }
  const [cutoutBlob, maskBlob] = await Promise.all([
    encodePng(cutoutData, image.width, image.height),
    encodePng(maskData, image.width, image.height),
  ]);
  return {
    maskBlob,
    cutoutBlob,
    sourceWidth: image.width,
    sourceHeight: image.height,
    provider: 'local',
    reliable: segment.reliable,
    warnings: segment.warnings,
  };
}

export async function cutoutImage(blob: Blob, provider: CutoutProviderId, samOptions?: SamCutoutOptions): Promise<CutoutResult> {
  if (provider === 'meta-sam') {
    if (!samOptions) throw new Error('meta_sam_missing_config');
    return samCutout(blob, samOptions);
  }
  return localCutout(blob);
}
