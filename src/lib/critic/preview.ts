import { ProviderError } from '../ai/errors';
export async function previewJpeg(handle: { exportPng: () => string }) {
  const image = new Image(); image.src = handle.exportPng(); await image.decode();
  // Half of the exported size, so the preview matches the creative's
  // platform size (540x675 for 4:5, 540x540 for 1:1, 540x960 for 9:16).
  const width = Math.round(image.width / 2), height = Math.round(image.height / 2);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
  const data = canvas.toDataURL('image/jpeg', .8).split(',')[1];
  if (data.length > 4 * Math.ceil(512 * 1024 / 3)) throw new ProviderError('review_preview');
  return { mimeType: 'image/jpeg' as const, data };
}
