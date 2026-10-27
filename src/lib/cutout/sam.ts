// SAM 3.1 cutout core (pure, no network, no secrets).
//
// The wire format is Meta's Responses API output_text lane, parsed with the
// official @meta-sam/parser package: one line per frame, comma-separated
// `id<|box;...|><|mask;...|>` records. A mask record's raster covers only
// its half-open bounds box, so it is upscaled to the source image before
// it becomes an alpha channel. Original RGB is never touched; only alpha
// changes, exactly like the local cutout. A radius-1 blur softens the mask
// edge so the composite does not look pasted.

import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from '@meta-sam/parser';

export interface SamMask {
  objectId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  /** 0/1 raster, row-major, length width * height. */
  raster: Uint8Array;
}

export interface SamParseResult {
  masks: SamMask[];
  diagnostics: { code: string; message: string }[];
}

/** Parse SAM output_text into mask records. Throws nothing; empty means no mask. */
export async function parseSamMasks(outputText: string): Promise<SamParseResult> {
  async function* events(): AsyncIterable<ResponsesEvent> {
    yield {
      type: 'response.output_text.delta',
      item_id: 'message-1',
      output_index: 0,
      content_index: 0,
      delta: outputText,
    };
    yield {
      type: 'response.output_text.done',
      item_id: 'message-1',
      output_index: 0,
      content_index: 0,
      text: outputText,
    };
    yield { type: 'response.completed' };
  }
  const parsed = parseImageStream(events());
  // Drain the stream to completion; the final result carries the records.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _snapshot of parsed) { /* drain */ }
  const result = await parsed.finalResult;
  const masks = recordsOfKind(result.records, 'mask').map((record: SegmentationMaskRecord) => ({
    objectId: record.objectId,
    left: record.bounds.left,
    top: record.bounds.top,
    right: record.bounds.right,
    bottom: record.bounds.bottom,
    width: record.mask.width,
    height: record.mask.height,
    raster: decodeMaskToRaster(record.mask),
  }));
  return {
    masks,
    diagnostics: result.diagnostics.map((item) => ({ code: item.code, message: item.message })),
  };
}

/** The product is the largest segmented object; ties keep the first record. */
export function pickLargestMask(masks: SamMask[]): SamMask | null {
  let best: SamMask | null = null;
  let bestFill = -1;
  for (const mask of masks) {
    let fill = 0;
    for (let i = 0; i < mask.raster.length; i++) if (mask.raster[i] === 1) fill++;
    if (fill > bestFill) {
      bestFill = fill;
      best = mask;
    }
  }
  return best;
}

/**
 * Upscale a mask raster onto its bounds box in source pixels, then soften
 * the edge with a radius-1 box blur. Outside the bounds, alpha stays 0.
 */
export function maskToAlpha(
  mask: SamMask,
  sourceWidth: number,
  sourceHeight: number,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(sourceWidth * sourceHeight);
  const boxWidth = Math.max(1, mask.right - mask.left);
  const boxHeight = Math.max(1, mask.bottom - mask.top);
  for (let my = 0; my < mask.height; my++) {
    const y0 = mask.top + Math.floor((my * boxHeight) / mask.height);
    const y1 = mask.top + Math.floor(((my + 1) * boxHeight) / mask.height);
    for (let mx = 0; mx < mask.width; mx++) {
      if (mask.raster[my * mask.width + mx] !== 1) continue;
      const x0 = mask.left + Math.floor((mx * boxWidth) / mask.width);
      const x1 = mask.left + Math.floor(((mx + 1) * boxWidth) / mask.width);
      for (let y = Math.max(0, y0); y < Math.min(sourceHeight, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(sourceWidth, x1); x++) {
          alpha[y * sourceWidth + x] = 255;
        }
      }
    }
  }
  // Radius-1 blur: average each pixel with its 8 neighbours.
  const blurred = new Uint8ClampedArray(alpha);
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= sourceWidth || ny >= sourceHeight) continue;
          sum += alpha[ny * sourceWidth + nx];
          count++;
        }
      }
      blurred[y * sourceWidth + x] = Math.round(sum / count);
    }
  }
  return blurred;
}

/** Replace only the alpha channel of RGBA data; RGB bytes are copied verbatim. */
export function applySamAlpha(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i];
  return out;
}
