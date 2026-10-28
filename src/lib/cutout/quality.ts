/** Bottom-edge roughness of a cutout's alpha mask (pure array math).
 *
 * A product standing on a surface should have a nearly flat bottom edge:
 * the bottom-most opaque pixel per column changes by only a few pixels
 * between neighbours, even for a tapered or round-bottomed product. A torn
 * bottom — SAM confused by props touching the base, like mint leaves or
 * an orange slice — shows up as sudden vertical jumps in that profile.
 * So the metric is the largest single-column step in the central 80% of
 * the opaque span (edges taper legitimately and are excluded), not the
 * overall range, which a round product would fail on its own.
 * Returns rough=true when that step exceeds 10px or 2% of the height. */
export function cutoutBottomRoughness(alpha: Uint8Array, width: number, height: number): { rough: boolean; maxStep: number } {
  if (width <= 0 || height <= 0 || alpha.length !== width * height) throw new Error('invalid_alpha');
  const OPAQUE = 128;
  const bottom: (number | null)[] = [];
  for (let x = 0; x < width; x++) {
    let found: number | null = null;
    for (let y = height - 1; y >= 0; y--) {
      if (alpha[y * width + x] > OPAQUE) { found = y; break; }
    }
    bottom.push(found);
  }
  const present = bottom.map((b, x) => ({ b, x })).filter((c): c is { b: number; x: number } => c.b !== null);
  if (present.length < 8) return { rough: false, maxStep: 0 };
  const first = present[0].x, last = present[present.length - 1].x;
  const span = last - first;
  const lo = first + Math.floor(span * 0.1), hi = last - Math.floor(span * 0.1);
  let maxStep = 0, prev: number | null = null, prevX = -2;
  for (const { b, x } of present) {
    if (x < lo || x > hi) { prev = null; prevX = -2; continue; }
    if (prev !== null && x === prevX + 1) maxStep = Math.max(maxStep, Math.abs(b - prev));
    prev = b; prevX = x;
  }
  const threshold = Math.max(10, Math.round(height * 0.02));
  return { rough: maxStep > threshold, maxStep };
}
