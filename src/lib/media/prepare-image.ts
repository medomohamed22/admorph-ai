import imageCompression from 'browser-image-compression';
import { validateProduct } from '../campaign/client';

import { UPLOAD_MAX_SIDE, fitsUpload } from './upload-rules';

/**
 * Accept a phone photo of any size. Small photos go through untouched.
 * Large ones are compressed on this device (browser-image-compression, MIT,
 * in a web worker served from this site) to under 2 MB with the longest
 * side capped at 2560 px and high quality first; PNGs keep transparency.
 * The result still passes the usual upload checks.
 */
export async function prepareImageUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap) {
    const fits = fitsUpload(file.size, bitmap.width, bitmap.height);
    bitmap.close();
    if (fits) return file;
  }
  const compressed = await imageCompression(file, {
    maxSizeMB: 1.9,
    maxWidthOrHeight: UPLOAD_MAX_SIDE,
    initialQuality: 0.92,
    alwaysKeepResolution: false,
    useWebWorker: true,
    libURL: '/vendor/browser-image-compression-2.0.2.js',
    fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
  });
  await validateProduct(compressed);
  return compressed;
}
