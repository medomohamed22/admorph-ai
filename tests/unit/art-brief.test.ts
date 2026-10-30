import { describe, expect, it } from 'vitest';
import { artBriefSchema, artBriefToScene, rememberScene, settingOf, artBriefInstruction, VARIANT_AXES, RECENT_SCENES_LIMIT } from '../../src/lib/ai/art-brief';
import { planSchema, planRequestSchema } from '../../src/lib/campaign/schema';
import { brandFontStylesheetUrl, fontsForScript, resolveBrandFontFamily } from '../../src/lib/brand/fonts';
import { buildResizePrompt, resizeRequestSchema } from '../../src/lib/ai/oneshot';
import { frameRect, closeToFormat } from '../../src/lib/oneshot/reframe';

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

describe('sizes', () => {
  it('places a 4:5 ad whole on square and story canvases', () => {
    expect(frameRect(1080, 1350, '1080x1080')).toEqual({ width: 1080, height: 1080, x: 108, y: 0, w: 864, h: 1080 });
    expect(frameRect(1080, 1350, '1080x1920')).toEqual({ width: 1080, height: 1920, x: 0, y: 285, w: 1080, h: 1350 });
  });
  it('cover-fits only results that are already close to the shape', () => {
    expect(closeToFormat(1024, 1024, '1080x1080')).toBe(true);
    expect(closeToFormat(1080, 1920, '1080x1920')).toBe(true);
    expect(closeToFormat(1024, 1024, '1080x1920')).toBe(false);
  });
  it('asks for the bands to be filled and nothing new written', () => {
    const prompt = buildResizePrompt('1080x1920', ['Cold, smooth, yours'], 'en');
    expect(prompt).toContain('tall 9:16 story');
    expect(prompt).toContain('top and bottom');
    expect(prompt).toContain('"Cold, smooth, yours"');
    expect(buildResizePrompt('1080x1080', [], 'ar')).toContain('right to left');
  });
  it('accepts only the two extra sizes', () => {
    const base = { providerId: 'meta', apiKey: 'k', modelId: 'muse-image-1.0', consent: true, imageConsent: true, image: { mimeType: 'image/png', data: 'AAAA' }, words: [], language: 'en' };
    expect(resizeRequestSchema.safeParse({ ...base, format: '1080x1920' }).success).toBe(true);
    expect(resizeRequestSchema.safeParse({ ...base, format: '1080x1350' }).success).toBe(false);
  });
});
