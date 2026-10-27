// Local background painting, extracted verbatim from the studio's previous
// inline implementation so the brand-color behavior is tested, not assumed.
// The gradient runs from the brand's second color to its third color, with
// a soft first-color disc. No model call, no network.
//
// Variant 0 is the original (diagonal gradient, disc lower-right). Variants
// 1 and 2 only change direction and disc position, so regenerating a
// background produces a visibly different backdrop from the same palette
// without touching product, text or caption.

export function paintLocalBackground(
  ctx: CanvasRenderingContext2D,
  colors: [string, string, string],
  variant = 0,
): void {
  const gradients: Array<
    [[number, number, number, number], [string, string], [number, number, number]]
  > = [
    [[0, 0, 1080, 1350], [colors[1], colors[2]], [830, 780, 580]],
    [[1080, 0, 0, 1350], [colors[2], colors[1]], [250, 300, 520]],
    [[0, 0, 0, 1350], [colors[1], colors[2]], [540, 1100, 600]],
  ];
  const [[x0, y0, x1, y1], [stop0, stop1], [cx, cy, radius]] =
    gradients[((variant % 3) + 3) % 3];
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, stop0);
  gradient.addColorStop(1, stop1);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = colors[0] + '22';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}
