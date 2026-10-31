import { z } from 'zod';
import { researchResultSchema, type ResearchTrend } from './research';

/**
 * Pure helpers for web research (no network, no browser APIs): choosing
 * directions with variety, the fallback style library, and folding them
 * into the planner brief within its limit.
 */
const PLAN_BRIEF_LIMIT = 2000;

/** What a saved ad keeps of its research, so copies and seasons reuse it instead of searching again. */
export const savedResearchSchema = researchResultSchema.extend({ used: z.array(z.string().max(80)).max(12).default([]) });
export type SavedResearch = z.infer<typeof savedResearchSchema>;

const shuffle = <T,>(items: readonly T[], random: () => number = Math.random): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]]; }
  return copy;
};

/**
 * Pick `count` directions, unused ones first and in random order, so two runs
 * (or two users with similar products) rarely land on the same look.
 */
export function pickTrends(trends: readonly ResearchTrend[], count: number, used: readonly string[] = [], random: () => number = Math.random): ResearchTrend[] {
  const fresh = shuffle(trends.filter(trend => !used.includes(trend.name)), random);
  const seen = shuffle(trends.filter(trend => used.includes(trend.name)), random);
  return [...fresh, ...seen].slice(0, Math.max(0, count));
}

/**
 * Used when research is off or failed: a wide library of current looks, three
 * picked at random per request, so ideas still vary between runs and users.
 */
export const STYLE_LIBRARY: readonly string[] = [
  'quiet editorial still life on linen with soft window light', 'bold color-block backdrop with a hard graphic shadow', 'golden-hour street scene with warm lens flare',
  'moody low-key studio with a single rim light', 'sunlit kitchen counter with everyday props', 'terrazzo surface with pastel props and top-down angle',
  'outdoor picnic on grass with dappled shade', 'minimal stone plinth in a desert-toned set', 'rain-wet city window at blue hour',
  'retro 70s set with warm oranges and film grain', 'Scandinavian bedroom with morning haze', 'botanical greenhouse with deep greens',
  'clean bathroom shelf with glossy tiles and steam', 'beach towel and sand with crisp noon shadows', 'library desk with old books and lamp glow',
  'neon-lit night market with bokeh', 'concrete loft with industrial texture', 'mountain cabin table with wool and wood',
  'marble café table with an espresso cup', 'paper-craft set with layered colored paper', 'water splash frozen mid-air on a dark backdrop',
  'gym bench with chalk dust and hard light', 'balcony at sunset over a city skyline', 'flat-lay on kraft paper with hand-written tags',
  'floating product with soft cloud forms', 'mirror-tile set with playful reflections', 'souk spice stall with warm tones',
  'Mediterranean white wall with bougainvillea shadow', 'snowy window ledge with cool morning light', 'desk setup with a laptop and plant, overhead',
];
export function pickStyles(count: number, random: () => number = Math.random): string[] {
  return shuffle(STYLE_LIBRARY, random).slice(0, count);
}

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * Fold the chosen directions into the planner's brief, inside its 2000-char
 * limit: the user's own direction first (it always wins), then one research
 * direction per idea, then a couple of fresh library looks.
 */
export function researchBrief(userBrief: string, trends: readonly ResearchTrend[], styles: readonly string[] = [], limit = PLAN_BRIEF_LIMIT): string {
  const own = clip(userBrief.trim(), 500);
  const parts: string[] = own ? [own] : [];
  if (trends.length) {
    parts.push(`Current ad trends researched on the web for this product (learn the style, never copy a brand). Make each idea follow a different one: ${trends.map((trend, index) => `(${index + 1}) ${trend.name}: ${clip(trend.visual, 320)} Copy: ${clip(trend.copy, 160)}`).join(' ')}`);
  }
  if (styles.length) parts.push(`Fresh looks to consider: ${styles.join('; ')}.`);
  let brief = parts.join('\n');
  // Trim the research part, never the user's own words, until it fits.
  if (brief.length > limit && trends.length > 1) return researchBrief(userBrief, trends.slice(0, -1), styles, limit);
  if (brief.length > limit) brief = brief.slice(0, limit);
  return brief;
}

/** The hostname shown for a source link ("behance.net"). */
export const sourceHost = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
