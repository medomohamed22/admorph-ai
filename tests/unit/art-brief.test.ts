import { describe, expect, it } from 'vitest';
import { artBriefSchema, artBriefToScene, rememberScene, settingOf, artBriefInstruction, VARIANT_AXES, RECENT_SCENES_LIMIT } from '../../src/lib/ai/art-brief';
import { planSchema, planRequestSchema } from '../../src/lib/campaign/schema';
import { brandFontStylesheetUrl, fontsForScript, resolveBrandFontFamily } from '../../src/lib/brand/fonts';
import { buildOneshotPrompt, oneshotRequestSchema, reflowLayout, zoneOf, type OneshotElement } from '../../src/lib/ai/oneshot';

const brand = { name: 'Sora', description: 'tea', colors: ['#52633C', '#DCE5BB', '#F2D1BC'] as [string, string, string] };
const brief = { setting: 'a sunlit marble kitchen counter', props: ['a bowl of lemons', 'a linen towel'], lighting: 'warm morning side light', camera: 'low angle, 50mm', composition: 'product right third, headline top left', palette: ['#F2E8D5', 'olive green'], typeStyle: 'bold condensed white sans', avoid: ['plain backdrop'] };

describe('art brief', () => {
  it('turns a brief into one readable scene under 1000 characters', () => {
    const scene = artBriefToScene(artBriefSchema.parse(brief));
    expect(scene).toContain('a sunlit marble kitchen counter, with a bowl of lemons, a linen towel');
    expect(scene).toContain('Light: warm morning side light');
    expect(scene).toContain('Headline style: bold condensed white sans');
    expect(scene).toContain('Avoid: plain backdrop');
    const long = artBriefToScene({ ...brief, setting: 'x'.repeat(300), composition: 'y'.repeat(300), lighting: 'z'.repeat(200), camera: 'w'.repeat(200) });
    expect(long.length).toBeLessThanOrEqual(1000);
  });
  it('remembers the last five settings, newest first, without repeats', () => {
    let recent: string[] = [];
    for (const place of ['beach', 'kitchen', 'desk', 'garden', 'rooftop', 'cafe']) recent = rememberScene(recent, place);
    expect(recent).toEqual(['cafe', 'rooftop', 'garden', 'desk', 'kitchen']);
    expect(recent).toHaveLength(RECENT_SCENES_LIMIT);
    expect(rememberScene(recent, 'Garden!')).toEqual(['Garden!', 'cafe', 'rooftop', 'desk', 'kitchen']);
    expect(rememberScene(recent, '   ')).toEqual(recent);
  });
  it('reads the setting from a scene paragraph', () => {
    expect(settingOf(artBriefToScene(brief))).toBe('a sunlit marble kitchen counter');
    expect(settingOf('A rooftop at dusk. Light: neon')).toBe('A rooftop at dusk');
  });
  it('tells the planner which settings to avoid', () => {
    expect(artBriefInstruction([])).not.toContain('Recent ads');
    expect(artBriefInstruction(['a beach'])).toContain('"a beach"');
    expect(VARIANT_AXES.map(axis => axis.id)).toEqual(['setting', 'light', 'palette']);
  });
  it('lets the plan carry an art brief and caps the avoided scenes at five', () => {
    const concept = (angle: string, n: number) => ({ angle, title: `t${n}`, audienceAngle: 'a', headline: `h${n}`, caption: `c${n}`, visualDirection: `v${n}`, artBrief: brief });
    expect(planSchema.safeParse({ concepts: [concept('offer', 1), concept('benefit', 2), concept('lifestyle', 3)] }).success).toBe(true);
    const shape = planRequestSchema.shape.avoidScenes;
    expect(shape.safeParse(['a', 'b', 'c', 'd', 'e']).success).toBe(true);
    expect(shape.safeParse(['a', 'b', 'c', 'd', 'e', 'f']).success).toBe(false);
  });
});

describe('curated fonts', () => {
  it('asks Google Fonts only for the weights a family ships', () => {
    expect(brandFontStylesheetUrl('Bebas Neue')).toBe('https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&display=swap');
    expect(brandFontStylesheetUrl('El Messiri')).toContain('wght@400;700');
  });
  it('splits the list by script', () => {
    expect(fontsForScript('arabic').every(font => font.script === 'arabic')).toBe(true);
    expect(fontsForScript('arabic').map(font => font.family)).toContain('Lalezar');
    expect(fontsForScript('latin').map(font => font.family)).toContain('Archivo Black');
    expect(resolveBrandFontFamily('reem kufi')).toBe('Reem Kufi');
  });
});

describe('ad size picked before painting', () => {
  const layout: OneshotElement[] = [
    { id: 'product', kind: 'product', x: 340, y: 380, width: 400, height: 600 },
    { id: 'headline', kind: 'text', x: 140, y: 120, width: 800, height: 120, text: 'Hi' },
  ];
  it('moves the layout to a new frame without squashing the product', () => {
    const square = reflowLayout(layout, 1350, 1080);
    const product = square.find(item => item.id === 'product')!;
    expect(product.y + product.height).toBeLessThanOrEqual(1080);
    expect(product.width / product.height).toBeCloseTo(400 / 600);
    const story = reflowLayout(layout, 1350, 1920);
    expect(story.find(item => item.id === 'headline')!.y).toBeCloseTo((120 + 60) * 1920 / 1350 - 60);
    expect(reflowLayout(layout, 1350, 1350)).toBe(layout);
  });
  it('tells the painter the exact size and reads zones in that frame', () => {
    expect(buildOneshotPrompt(brand, 'a cafe', layout, 'en', [], '1080x1920')).toContain('1080x1920, a 9:16 full-screen story');
    expect(buildOneshotPrompt(brand, 'a cafe', layout, 'en')).toContain('1080x1350');
    expect(zoneOf({ x: 0, y: 1500, width: 100, height: 100 }, 1920)).toBe('bottom left');
  });
  it('rejects a layout that does not fit the picked frame', () => {
    const base = { providerId: 'meta', apiKey: 'k', modelId: 'muse-image-1.0', consent: true, imageConsent: true, mockup: { mimeType: 'image/png', data: 'AAAA' }, brand, scene: 'a cafe', language: 'en' };
    const tall = [{ id: 'p', kind: 'product', x: 100, y: 1500, width: 300, height: 300 }];
    expect(oneshotRequestSchema.safeParse({ ...base, layout: tall, format: '1080x1920' }).success).toBe(true);
    expect(oneshotRequestSchema.safeParse({ ...base, layout: tall, format: '1080x1080' }).success).toBe(false);
    expect(oneshotRequestSchema.safeParse({ ...base, layout: tall }).success).toBe(false);
  });
});
