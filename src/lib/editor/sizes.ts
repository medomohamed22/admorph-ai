// Platform output sizes. Width is always 1080; only height varies, so a
// 4:5 layout scales vertically onto 1:1 and 9:16 without touching x, width
// or font sizes. The campaign format field carries the size; a creative
// denormalizes it at compose time so canvas, export and critic can all read
// it from the creative alone. Old records without a format are 4:5.

export const SIZE_FORMATS = ['1080x1350', '1080x1080', '1080x1920'] as const;
export type SizeFormat = (typeof SIZE_FORMATS)[number];

export const SIZE_DIMENSIONS: Record<SizeFormat, { width: number; height: number; label: string }> = {
  '1080x1350': { width: 1080, height: 1350, label: '4:5' },
  '1080x1080': { width: 1080, height: 1080, label: '1:1' },
  '1080x1920': { width: 1080, height: 1920, label: '9:16' },
};

export function dimensionsFor(format: SizeFormat | undefined | null): { width: number; height: number } {
  const size = SIZE_DIMENSIONS[format ?? '1080x1350'] ?? SIZE_DIMENSIONS['1080x1350'];
  return { width: size.width, height: size.height };
}

export function formatLabel(format: SizeFormat | undefined | null): string {
  const size = SIZE_DIMENSIONS[format ?? '1080x1350'] ?? SIZE_DIMENSIONS['1080x1350'];
  return `${size.width} × ${size.height} · ${size.label}`;
}
