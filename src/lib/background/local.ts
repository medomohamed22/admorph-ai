// Local background painting, extracted verbatim from the studio's previous
// inline implementation so the brand-color behavior is tested, not assumed.
// The gradient runs from the brand's second color to its third color, with
// a soft first-color disc. No model call, no network.

export function paintLocalBackground(
  ctx: CanvasRenderingContext2D,
  colors: [string, string, string],
): void {
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = colors[0] + '22';
  ctx.beginPath();
  ctx.arc(830, 780, 580, 0, Math.PI * 2);
  ctx.fill();
}
