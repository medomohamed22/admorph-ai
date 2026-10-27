// Browser-only image helpers for the auto-run orchestrator. Kept separate
// from the cutout provider because these return raw pixels / blobs for
// analysis and background painting, not cutout results.

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, image.width, image.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      'image/png',
    ),
  );
}
