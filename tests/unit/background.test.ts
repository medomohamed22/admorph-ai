import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backgroundBriefSchema,
  buildBackgroundBrief,
  buildBackgroundPrompt,
  dominantColors,
  STYLE_GEOMETRY,
  type BackgroundStyle,
} from '../../src/lib/background/brief';
import { paintLocalBackground } from '../../src/lib/background/local';
import { backgroundRequestSchema } from '../../src/lib/ai/image-server';
import { metaBackgroundRequest } from '../../src/lib/ai/meta-runtime';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';

const PALETTE: [string, string, string] = ['#16100C', '#F5EEDF', '#7ED3E0'];

function legacyPayload() {
  const campaign = newCampaign();
  const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
  const { id: _id, approved: _approved, ...fields } = concept;
  void _id;
  void _approved;
  return {
    providerId: 'meta' as const,
    apiKey: crypto.randomUUID(),
    modelId: 'chosen-image-model',
    consent: true as const,
    approved: true as const,
    brand: campaign.brandSnapshot,
    concept: fields,
  };
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('background brief', () => {
  it('parses the PR0 fixture brief', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/auto-ads-sample.json', import.meta.url), 'utf8'),
    );
    const brief = backgroundBriefSchema.parse(fixture.backgroundBrief);
    expect(brief.productCategory).toBe('canned cold brew');
    expect(brief.negativeConstraints).toContain('no product');
  });

  it('derives material and geometry from type and style', () => {
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
      stylePreset: 'hero',
    });
    expect(brief.material).toContain('aluminum');
    expect(brief.reservedProductRect).toEqual(STYLE_GEOMETRY.hero.productRect);
    expect(brief.negativeConstraints).toEqual([
      'no product',
      'no package',
      'no logo',
      'no text',
      'no watermark',
      'no people',
    ]);
  });

  it('keeps every preset geometry inside the canvas with no product/text overlap', () => {
    (Object.keys(STYLE_GEOMETRY) as BackgroundStyle[]).forEach((style) => {
      const { productRect, textRects } = STYLE_GEOMETRY[style];
      expect(productRect.x).toBeGreaterThanOrEqual(0);
      expect(productRect.y).toBeGreaterThanOrEqual(0);
      expect(productRect.x + productRect.width).toBeLessThanOrEqual(1080);
      expect(productRect.y + productRect.height).toBeLessThanOrEqual(1350);
      for (const text of textRects) {
        expect(text.x + text.width).toBeLessThanOrEqual(1080);
        expect(text.y + text.height).toBeLessThanOrEqual(1350);
        expect(overlaps(productRect, text)).toBe(false);
      }
    });
  });

  it('builds a background-only prompt from metadata, never pixels', () => {
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
      stylePreset: 'hero',
    });
    const prompt = buildBackgroundPrompt(brief);
    expect(prompt).toContain('canned cold brew');
    expect(prompt).toContain('#16100C');
    expect(prompt).toContain('no text');
    expect(prompt).toContain('x 200–880');
    expect(prompt).not.toContain('data:image');
    expect(prompt).not.toContain('base64');
  });

  it('accepts legacy background payloads and rejects pixel smuggling', () => {
    const base = legacyPayload();
    expect(backgroundRequestSchema.safeParse(base).success).toBe(true);
    expect(metaBackgroundRequest.safeParse(base).success).toBe(true);
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
    });
    expect(backgroundRequestSchema.safeParse({ ...base, backgroundBrief: brief }).success).toBe(true);
    expect(metaBackgroundRequest.safeParse({ ...base, backgroundBrief: brief }).success).toBe(true);
    // Strict schemas: an image field cannot sneak into a background request.
    expect(
      backgroundRequestSchema.safeParse({
        ...base,
        image: { mimeType: 'image/png', data: 'aGVsbG8=' },
      }).success,
    ).toBe(false);
    expect(
      backgroundBriefSchema.safeParse({
        ...brief,
        image: { mimeType: 'image/png', data: 'aGVsbG8=' },
      }).success,
    ).toBe(false);
  });
});

describe('dominant colors', () => {
  it('returns the most frequent exact colors and ignores transparency', () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const red = i < 60;
      data[i * 4] = red ? 255 : 0;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = red ? 0 : 255;
      data[i * 4 + 3] = 255;
    }
    expect(dominantColors(data, width, height)).toEqual(['#ff0000', '#0000ff']);
    const transparent = new Uint8ClampedArray(width * height * 4);
    expect(dominantColors(transparent, width, height)).toEqual([]);
  });
});

describe('local brand-color background', () => {
  it('paints the brand gradient and disc with a fake canvas context', () => {
    const stops: [number, string][] = [];
    let fillRectArgs: number[] | null = null;
    const arcCalls: number[][] = [];
    let lastFillStyle: unknown = null;
    const ctx = {
      createLinearGradient: () => ({
        addColorStop: (offset: number, color: string) => {
          stops.push([offset, color]);
        },
      }),
      set fillStyle(value: unknown) {
        lastFillStyle = value;
      },
      get fillStyle() {
        return lastFillStyle;
      },
      fillRect: (...args: number[]) => {
        fillRectArgs = args;
      },
      beginPath: () => {},
      arc: (...args: number[]) => {
        arcCalls.push(args);
      },
      fill: () => {},
    } as unknown as CanvasRenderingContext2D;
    paintLocalBackground(ctx, PALETTE);
    expect(stops).toEqual([
      [0, '#F5EEDF'],
      [1, '#7ED3E0'],
    ]);
    expect(fillRectArgs).toEqual([0, 0, 1080, 1350]);
    expect(arcCalls[0].slice(0, 3)).toEqual([830, 780, 580]);
    expect(lastFillStyle).toBe('#16100C22');
  });

  it('paints distinct variants from the same palette', () => {
    const paint = (variant: number) => {
      const stops: [number, string][] = [];
      const gradientCalls: number[][] = [];
      const arcCalls: number[][] = [];
      const ctx = {
        createLinearGradient: (...args: number[]) => {
          gradientCalls.push(args);
          return { addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
        },
        set fillStyle(value: unknown) {},
        get fillStyle() {
          return '';
        },
        fillRect: () => {},
        beginPath: () => {},
        arc: (...args: number[]) => {
          arcCalls.push(args);
        },
        fill: () => {},
      } as unknown as CanvasRenderingContext2D;
      paintLocalBackground(ctx, PALETTE, variant);
      return { stops, gradientArgs: gradientCalls[0], arcArgs: arcCalls[0] };
    };
    const v0 = paint(0);
    expect(v0.stops).toEqual([
      [0, '#F5EEDF'],
      [1, '#7ED3E0'],
    ]);
    expect(v0.gradientArgs).toEqual([0, 0, 1080, 1350]);
    expect(v0.arcArgs.slice(0, 2)).toEqual([830, 780]);
    const v1 = paint(1);
    expect(v1.stops).toEqual([
      [0, '#7ED3E0'],
      [1, '#F5EEDF'],
    ]);
    expect(v1.arcArgs.slice(0, 2)).toEqual([250, 300]);
    const v2 = paint(2);
    expect(v2.gradientArgs).toEqual([0, 0, 0, 1350]);
    expect(v2.arcArgs.slice(0, 2)).toEqual([540, 1100]);
  });
});
