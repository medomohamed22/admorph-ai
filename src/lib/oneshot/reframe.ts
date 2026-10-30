import { SIZE_DIMENSIONS, type SizeFormat } from '../editor/sizes';

export type FrameRect = { width: number; height: number; x: number; y: number; w: number; h: number };

/**
 * Where a finished ad sits on a new canvas: as large as it can be while
 * staying whole, centered. 4:5 on 1:1 leaves bands left and right; on 9:16
 * it leaves bands above and below. Nothing of the ad is ever cropped.
 */
export function frameRect(sourceWidth: number, sourceHeight: number, format: SizeFormat): FrameRect {
  const { width, height } = SIZE_DIMENSIONS[format];
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = Math.round(sourceWidth * scale), h = Math.round(sourceHeight * scale);
  return { width, height, x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h };
}

/** True when an image is close enough to a format to be cover-fitted without losing anything that matters. */
export function closeToFormat(width: number, height: number, format: SizeFormat, tolerance = 0.06): boolean {
  const target = SIZE_DIMENSIONS[format];
  return Math.abs(width / height - target.width / target.height) / (target.width / target.height) <= tolerance;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), 'image/png'));
}

/**
 * The local version of a new size, made without any request: the ad whole
 * in the middle, the bands filled with a blurred, slightly darkened stretch
 * of the ad itself so the frame never shows bare color.
 */
export async function composeFrame(ad: Blob, format: SizeFormat): Promise<Blob> {
  const bitmap = await createImageBitmap(ad);
  try {
    const rect = frameRect(bitmap.width, bitmap.height, format);
    const canvas = document.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    const cover = Math.max(rect.width / bitmap.width, rect.height / bitmap.height);
    const cw = bitmap.width * cover, ch = bitmap.height * cover;
    context.filter = 'blur(36px) brightness(0.82)';
    context.drawImage(bitmap, (rect.width - cw) / 2, (rect.height - ch) / 2, cw, ch);
    context.filter = 'none';
    context.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
    return await canvasToBlob(canvas);
  } finally { bitmap.close(); }
}

/**
 * Bring a painted result to the exact pixel size. Close to the right shape:
 * cover-fit (a sliver trimmed at most). Any other shape: framed whole, like
 * the local version, so a provider that ignores the canvas never loses words.
 */
export async function fitToFormat(image: Blob, format: SizeFormat): Promise<{ blob: Blob; exact: boolean }> {
  const bitmap = await createImageBitmap(image);
  const exact = closeToFormat(bitmap.width, bitmap.height, format);
  if (!exact) { bitmap.close(); return { blob: await composeFrame(image, format), exact }; }
  try {
    const { width, height } = SIZE_DIMENSIONS[format];
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    const cover = Math.max(width / bitmap.width, height / bitmap.height);
    context.drawImage(bitmap, (width - bitmap.width * cover) / 2, (height - bitmap.height * cover) / 2, bitmap.width * cover, bitmap.height * cover);
    return { blob: await canvasToBlob(canvas), exact };
  } finally { bitmap.close(); }
}
