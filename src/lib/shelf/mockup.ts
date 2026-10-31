import { ONESHOT_WIDTH, ONESHOT_HEIGHT, type OneshotElement } from '../ai/oneshot';
import { textOn } from '../oneshot/badge-color';

/**
 * Build the one-shot mockup for one shelf product without the editor. The
 * layout is pure (testable without a canvas): the headline in its own top
 * band, the cutout as the hero, and the price tag and the button each sized
 * to their own words and placed with a clear gap from the product, never on
 * it. The painter is told the same: the price and the button are badges.
 */
export type ShelfMockupInput = { headline: string; cta: string; priceText: string; productAspect: number; rtl: boolean };

const MARGIN = 60, GAP = 40;
const PRICE_FONT = 46, CTA_FONT = 44;

/** Rough width of a line of text at a font size, before the canvas can measure it. */
export function estimateTextWidth(text: string, fontSize: number): number {
  const arabic = /[؀-ۿ]/.test(text);
  return Math.ceil([...text].length * fontSize * (arabic ? 0.5 : 0.58));
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function shelfLayout(input: ShelfMockupInput): OneshotElement[] {
  const price = input.priceText.trim();
  const ctaWidth = clamp(estimateTextWidth(input.cta, CTA_FONT) + 110, 280, 620);
  const priceWidth = clamp(estimateTextWidth(price, PRICE_FONT) + 90, 210, 440);
  const priceHeight = 104, ctaHeight = 96;

  // The product gets the middle of the frame between the headline band and the button row.
  const top = 300, maxBottom = ONESHOT_HEIGHT - MARGIN - ctaHeight - GAP;
  const maxW = 640, maxH = maxBottom - top;
  const aspect = clamp(input.productAspect || 1, 0.2, 5);
  let width = aspect >= maxW / maxH ? maxW : Math.round(maxH * aspect);
  let height = aspect >= maxW / maxH ? Math.round(maxW / aspect) : maxH;
  const side = (ONESHOT_WIDTH - width) / 2;
  const priceBeside = !!price && side >= priceWidth + MARGIN + GAP;
  // No room beside the product: the price takes its own row above the button, so the product shrinks to make room.
  if (price && !priceBeside) {
    const room = maxH - priceHeight - GAP;
    if (height > room) { width = Math.round(width * room / height); height = room; }
  }
  const product = { id: 'product', kind: 'product' as const, x: Math.round((ONESHOT_WIDTH - width) / 2), y: top, width, height };
  const layout: OneshotElement[] = [
    { id: 'headline', kind: 'text', x: MARGIN + 20, y: 90, width: ONESHOT_WIDTH - 2 * (MARGIN + 20), height: 170, text: input.headline },
    product,
  ];
  let rowY = product.y + product.height + GAP;
  if (price) {
    if (priceBeside) {
      const x = input.rtl ? MARGIN : ONESHOT_WIDTH - MARGIN - priceWidth;
      layout.push({ id: 'price', kind: 'text', badge: 'price', x, y: product.y + product.height - priceHeight, width: priceWidth, height: priceHeight, text: price });
    } else {
      layout.push({ id: 'price', kind: 'text', badge: 'price', x: Math.round((ONESHOT_WIDTH - priceWidth) / 2), y: rowY, width: priceWidth, height: priceHeight, text: price });
      rowY += priceHeight + GAP / 2;
    }
  }
  layout.push({ id: 'cta', kind: 'text', badge: 'cta', x: Math.round((ONESHOT_WIDTH - ctaWidth) / 2), y: Math.min(rowY, ONESHOT_HEIGHT - MARGIN - ctaHeight), width: ctaWidth, height: ctaHeight, text: input.cta });
  return layout;
}

/** Split a headline into at most two lines that fit `width` at `fontSize`. */
function wrapTwoLines(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (context.measureText(text).width <= width || words.length < 2) return [text];
  let best: string[] = [text], bestWidest = Infinity;
  for (let cut = 1; cut < words.length; cut++) {
    const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    const widest = Math.max(...lines.map(line => context.measureText(line).width));
    if (widest < bestWidest) { best = lines; bestWidest = widest; }
  }
  return best;
}

export async function drawShelfMockup(product: Blob, layout: OneshotElement[], accent: string): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = ONESHOT_WIDTH; canvas.height = ONESHOT_HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e9e9e9'; context.fillRect(0, 0, canvas.width, canvas.height);
  const bitmap = await createImageBitmap(product);
  const ink = textOn(accent);
  try {
    for (const element of layout) {
      if (element.kind === 'product') { context.drawImage(bitmap, element.x, element.y, element.width, element.height); continue; }
      const text = element.text ?? '';
      const arabic = /[؀-ۿ]/.test(text);
      const family = arabic ? 'Cairo' : 'Inter';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.direction = arabic ? 'rtl' : 'ltr';
      const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
      if (element.badge) {
        // A solid rounded badge sized to its words, with a soft drop shadow and a light rim.
        const radius = element.badge === 'cta' ? element.height / 2 : 24;
        context.save();
        context.shadowColor = 'rgba(0, 0, 0, .28)'; context.shadowBlur = 18; context.shadowOffsetY = 6;
        context.fillStyle = accent; context.beginPath(); context.roundRect(element.x, element.y, element.width, element.height, radius); context.fill();
        context.restore();
        context.lineWidth = 3; context.strokeStyle = 'rgba(255, 255, 255, .55)';
        context.beginPath(); context.roundRect(element.x + 1.5, element.y + 1.5, element.width - 3, element.height - 3, radius); context.stroke();
        let size = element.badge === 'cta' ? CTA_FONT : PRICE_FONT;
        do { context.font = `800 ${size}px ${family}`; size -= 2; } while (context.measureText(text).width > element.width - 56 && size > 24);
        context.fillStyle = ink;
        context.fillText(text, cx, cy);
        continue;
      }
      context.fillStyle = '#16100C';
      let size = 78, lines: string[] = [text];
      do { context.font = `800 ${size}px ${family}`; lines = wrapTwoLines(context, text, element.width); size -= 4; }
      while ((lines.length > 2 || Math.max(...lines.map(line => context.measureText(line).width)) > element.width || lines.length * size * 1.15 > element.height) && size > 40);
      const lineHeight = (size + 4) * 1.15;
      lines.forEach((line, index) => context.fillText(line, cx, cy + (index - (lines.length - 1) / 2) * lineHeight));
    }
  } finally { bitmap.close(); context.direction = 'ltr'; }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('mockup_failed')), 'image/png'));
}
