/**
 * The built-in icon library for the mockup. Each icon is a 24x24 SVG body
 * drawn in one color (the brand color the user picks), rendered to a PNG on
 * the device so it travels like any uploaded icon. Shapes are simple on
 * purpose: the image model repaints them in the scene's style.
 */
export const ICONS = [
  { id: 'star', body: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>' },
  { id: 'heart', body: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/>' },
  { id: 'check', body: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/>' },
  { id: 'bolt', body: '<path d="M7 2v11h3v9l7-12h-4l4-8z"/>' },
  { id: 'sparkle', body: '<path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/>' },
  { id: 'gift', body: '<rect x="3" y="8" width="18" height="4" rx="1"/><rect x="5" y="13" width="14" height="8" rx="1"/><path d="M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zm0 0c1.5-3 5-4 5-1.5S14 8 12 8z"/>' },
  { id: 'truck', body: '<path d="M2 6h12v10H2z"/><path d="M14 9h4.5l3.5 3.5V16h-8z"/><circle cx="6" cy="17.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/>' },
  { id: 'clock', body: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 4h-2v7l5.25 3.15 1-1.64L13 12.15z"/>' },
  { id: 'pin', body: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>' },
  { id: 'phone', body: '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.61 21 3 13.39 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02z"/>' },
  { id: 'leaf', body: '<path d="M4 20C4 10 10 4 21 3c-1 11-7 17-17 17z"/><path d="M4 20l9-9" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/>' },
  { id: 'shield', body: '<path d="M12 2l8 3v6c0 5-3.4 9.7-8 11-4.6-1.3-8-6-8-11V5z"/>' },
] as const;
export type IconId = (typeof ICONS)[number]['id'];

const HEX = /^#[\da-f]{6}$/i;

/** The icon as standalone SVG markup in one fill color. */
export function iconSvg(id: IconId, color: string): string {
  const icon = ICONS.find(item => item.id === id);
  if (!icon) throw new Error('unknown_icon');
  const fill = HEX.test(color) ? color : '#16100C';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${fill}">${icon.body}</svg>`;
}

/** Render an icon to a square PNG blob on the device. */
export async function iconPng(id: IconId, color: string, size = 256): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(id, color))}`;
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); if (!context) throw new Error('canvas');
  context.drawImage(image, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), 'image/png'));
}

/** Black or white, whichever reads better on a badge color. */
export function textOn(fill: string): string {
  if (!HEX.test(fill)) return '#FFFFFF';
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(fill.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? '#FFFFFF' : '#16100C';
}
