/**
 * The product close-up sent to the painter beside the mockup. The cutout is
 * cropped to the product and kept at full photo resolution; here it is laid
 * on a plain light background (a transparent area must not read as black)
 * and encoded as a JPEG with its longest side up to 1600 px, so the label text
 * stays sharp while the request stays well under the size limit.
 */
const ATTEMPTS = [{ side: 1600, quality: 0.92 }, { side: 1280, quality: 0.9 }, { side: 1024, quality: 0.86 }];
/** Leaves room for the mockup inside one request. */
export const PRODUCT_REFERENCE_LIMIT = 800 * 1024;

export async function productReference(cutout: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(cutout).catch(() => null);
  if (!bitmap) return null;
  try {
    for (const attempt of ATTEMPTS) {
      const scale = Math.min(1, attempt.side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#f4f4f2'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', attempt.quality));
      if (blob && blob.size <= PRODUCT_REFERENCE_LIMIT) return blob;
    }
    return null;
  } finally { bitmap.close(); }
}
