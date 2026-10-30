export type ColorSample = { hex: string; x: number; y: number; share: number };

/**
 * The main colors of a photo, measured on the device: pixels are grouped by
 * a coarse color key, and the biggest groups (skipping near-duplicates)
 * come back with their average color and where they sit, as fractions of
 * the image, so they can be pinned on the preview.
 */
export function sampleColors(image: { data: Uint8ClampedArray; width: number; height: number }, count = 5): ColorSample[] {
  const { data, width, height } = image;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 6000)));
  const groups = new Map<number, { r: number; g: number; b: number; x: number; y: number; n: number }>();
  let total = 0;
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const group = groups.get(key) ?? { r: 0, g: 0, b: 0, x: 0, y: 0, n: 0 };
    group.r += data[i]; group.g += data[i + 1]; group.b += data[i + 2]; group.x += x; group.y += y; group.n++;
    groups.set(key, group); total++;
  }
  const picked: ColorSample[] = [];
  const colors: [number, number, number][] = [];
  for (const group of [...groups.values()].sort((a, b) => b.n - a.n)) {
    const rgb: [number, number, number] = [group.r / group.n, group.g / group.n, group.b / group.n];
    if (colors.some(other => Math.hypot(other[0] - rgb[0], other[1] - rgb[1], other[2] - rgb[2]) < 48)) continue;
    colors.push(rgb);
    picked.push({ hex: `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`, x: group.x / group.n / width, y: group.y / group.n / height, share: group.n / Math.max(1, total) });
    if (picked.length === count) break;
  }
  return picked;
}
