/**
 * Make a logo's flat background transparent, on the device. Most logos
 * people have are a JPG on white (or one solid color): the background is the
 * color found at the corners and connected to the edges. A flood fill from
 * the edges clears it, so a white letter counter inside the mark survives.
 * No request, no model: instant and free.
 */

export type ClearResult = { cleared: number; total: number; reason?: 'already_transparent' | 'busy_background' };

const distance = (data: Uint8ClampedArray, index: number, color: [number, number, number]) =>
  Math.hypot(data[index] - color[0], data[index + 1] - color[1], data[index + 2] - color[2]);

/**
 * Clear in place. Pixels within `tolerance` of the corner color and
 * connected to an edge become transparent; pixels a little further away
 * (up to `tolerance * 1.8`) at the border of the cleared area are faded, so
 * the mark keeps a soft anti-aliased edge.
 */
export function clearEdgeBackground(data: Uint8ClampedArray, width: number, height: number, tolerance = 42): ClearResult {
  const total = width * height;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map(pixel => pixel * 4);
  if (corners.filter(index => data[index + 3] < 16).length >= 3) return { cleared: 0, total, reason: 'already_transparent' };
  const color: [number, number, number] = [0, 1, 2].map(channel => Math.round(corners.reduce((sum, index) => sum + data[index + channel], 0) / 4)) as [number, number, number];
  if (corners.some(index => distance(data, index, color) > tolerance)) return { cleared: 0, total, reason: 'busy_background' };

  const visited = new Uint8Array(total);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  let cleared = 0;
  const soft = tolerance * 1.8;
  while (stack.length) {
    const pixel = stack.pop()!;
    if (visited[pixel]) continue;
    visited[pixel] = 1;
    const index = pixel * 4, gap = distance(data, index, color);
    if (gap > soft) continue;
    if (gap > tolerance) {
      // Edge of the mark: fade, but do not spread further through it.
      data[index + 3] = Math.min(data[index + 3], Math.round(255 * (gap - tolerance) / (soft - tolerance)));
      continue;
    }
    data[index + 3] = 0; cleared += 1;
    const x = pixel % width, y = (pixel - x) / width;
    if (x > 0) stack.push(pixel - 1);
    if (x < width - 1) stack.push(pixel + 1);
    if (y > 0) stack.push(pixel - width);
    if (y < height - 1) stack.push(pixel + width);
  }
  return { cleared, total };
}

/** The browser half: decode, clear, re-encode as PNG (the only format that keeps alpha). */
export async function removeLogoBackground(logo: Blob): Promise<{ blob: Blob | null; result: ClearResult }> {
  const bitmap = await createImageBitmap(logo);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = clearEdgeBackground(image.data, canvas.width, canvas.height);
    if (result.reason || result.cleared === 0) return { blob: null, result };
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return { blob, result };
  } finally { bitmap.close(); }
}
