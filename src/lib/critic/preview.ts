import { ProviderError } from '../ai/errors';
export async function previewJpeg(handle: { exportPng: () => string }) {
  const image = new Image(); image.src = handle.exportPng(); await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = 675;
  const context = canvas.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, 540, 675); context.drawImage(image, 0, 0, 540, 675);
  const data = canvas.toDataURL('image/jpeg', .8).split(',')[1];
  if (data.length > 4 * Math.ceil(512 * 1024 / 3)) throw new ProviderError('review_preview');
  return { mimeType: 'image/jpeg' as const, data };
}
