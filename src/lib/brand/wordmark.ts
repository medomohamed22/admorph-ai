// Wordmark logo: the brand name rendered as a transparent PNG in the
// extracted wordmark style (weight + family). No AI call, no baked-in
// product text — the logo is a plain text layer the editor can place
// like any uploaded logo. Canvas text is measured first so long names
// scale down instead of overflowing the 4096 px logo limit.
export async function renderWordmarkLogo(
  name: string,
  options: { bold: boolean; family: 'Inter' | 'Cairo'; color: string },
): Promise<Blob> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('empty_name');
  const weight = options.bold ? 700 : 400;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('no_canvas');
  const baseSize = 200;
  try { await document.fonts.load(`${weight} ${baseSize}px ${options.family}`); } catch { /* fall back to the loaded family */ }
  measure.font = `${weight} ${baseSize}px ${options.family}`;
  const measured = measure.measureText(trimmed).width;
  const padding = Math.ceil(baseSize * 0.4);
  const maxWidth = 2400;
  const scale = Math.min(1, maxWidth / (measured + padding * 2));
  const size = Math.max(24, Math.floor(baseSize * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no_canvas');
  context.font = `${weight} ${size}px ${options.family}`;
  const width = Math.ceil(context.measureText(trimmed).width) + padding * 2;
  canvas.width = width;
  canvas.height = Math.ceil(size * 1.5);
  context.font = `${weight} ${size}px ${options.family}`;
  context.fillStyle = options.color;
  context.textBaseline = 'middle';
  context.fillText(trimmed, padding, canvas.height / 2);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('encode_failed');
  return blob;
}
