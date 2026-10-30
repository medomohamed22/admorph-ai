import { ONESHOT_WIDTH, ONESHOT_HEIGHT, type OneshotElement } from '../ai/oneshot';

/**
 * Build the one-shot mockup for one shelf product without the editor: the
 * cutout centred, the headline on top, the price in a badge and the CTA as
 * a pill at the foot. Returns the layout the server checks and a pure
 * drawing plan, so the composition is testable without a browser canvas.
 */
export type ShelfMockupInput = { headline: string; cta: string; priceText: string; productAspect: number; rtl: boolean };

export function shelfLayout(input: ShelfMockupInput): OneshotElement[] {
  const maxW = 560, maxH = 700, area = { x: (ONESHOT_WIDTH - maxW) / 2, y: 320 };
  const aspect = Math.max(0.2, Math.min(5, input.productAspect || 1));
  const width = aspect >= maxW / maxH ? maxW : Math.round(maxH * aspect);
  const height = aspect >= maxW / maxH ? Math.round(maxW / aspect) : maxH;
  const layout: OneshotElement[] = [
    { id: 'headline', kind: 'text', x: 90, y: 110, width: 900, height: 150, text: input.headline },
    { id: 'product', kind: 'product', x: Math.round(area.x + (maxW - width) / 2), y: Math.round(area.y + (maxH - height) / 2), width, height },
    { id: 'cta', kind: 'text', x: 340, y: 1140, width: 400, height: 96, text: input.cta },
  ];
  if (input.priceText.trim()) layout.push({ id: 'price', kind: 'text', x: input.rtl ? 80 : 760, y: 900, width: 240, height: 120, text: input.priceText.trim() });
  return layout;
}

export async function drawShelfMockup(product: Blob, layout: OneshotElement[], accent: string): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = ONESHOT_WIDTH; canvas.height = ONESHOT_HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e9e9e9'; context.fillRect(0, 0, canvas.width, canvas.height);
  const bitmap = await createImageBitmap(product);
  try {
    for (const element of layout) {
      if (element.kind === 'product') { context.drawImage(bitmap, element.x, element.y, element.width, element.height); continue; }
      const text = element.text ?? '';
      const arabic = /[؀-ۿ]/.test(text);
      context.textAlign = 'center'; context.textBaseline = 'middle';
      if (element.id === 'price') {
        context.fillStyle = accent; context.beginPath(); context.arc(element.x + element.width / 2, element.y + element.height / 2, element.height / 2 + 10, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#ffffff'; context.font = `700 46px ${arabic ? 'Cairo' : 'Inter'}`;
      } else if (element.id === 'cta') {
        context.fillStyle = accent; const r = element.height / 2;
        context.beginPath(); context.roundRect(element.x, element.y, element.width, element.height, r); context.fill();
        context.fillStyle = '#ffffff'; context.font = `700 44px ${arabic ? 'Cairo' : 'Inter'}`;
      } else {
        context.fillStyle = '#16100C'; context.font = `800 72px ${arabic ? 'Cairo' : 'Inter'}`;
        if (arabic) context.direction = 'rtl';
      }
      context.fillText(text, element.x + element.width / 2, element.y + element.height / 2, element.width - 20);
      context.direction = 'ltr';
    }
  } finally { bitmap.close(); }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('mockup_failed')), 'image/png'));
}
