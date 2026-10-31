import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';

/**
 * Market research before ideas: Muse Spark looks at the product photo and,
 * with Meta's built-in web search tool, reads what current ads and product
 * photography for this kind of product look like. It returns a handful of
 * distinct style directions plus the pages it read, so the ideas that follow
 * are fresher, closer to the product's category, and different from one run
 * (and one user) to the next. Styles are learned, never copied.
 */
export const RESEARCH_SEASONS = ['ramadan', 'eid', 'black-friday', 'summer'] as const;

export const researchRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  language: z.enum(['en', 'ar']),
  /** Research a seasonal look for this product instead of its everyday look. */
  season: z.enum(RESEARCH_SEASONS).optional(),
  /** Directions already used for this product, to steer away from. */
  avoid: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
}).strict();
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

const text = (max: number) => z.string().trim().min(1).transform(value => value.slice(0, max));
export const researchTrendSchema = z.object({ name: text(80), visual: text(700), copy: text(400) });
export const researchSourceSchema = z.object({ url: z.string().url().max(400), title: z.string().max(160).optional() });
export const researchResultSchema = z.object({
  productType: text(120),
  audience: z.string().trim().max(200).default(''),
  trends: z.array(researchTrendSchema).min(1).max(6),
  sources: z.array(researchSourceSchema).max(8),
  /** False when the answer came without any web search (the tool was refused): say so, never pretend. */
  searched: z.boolean(),
});
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type ResearchTrend = z.infer<typeof researchTrendSchema>;

const SEASON_WORDS: Record<(typeof RESEARCH_SEASONS)[number], string> = {
  ramadan: 'Ramadan', eid: 'Eid', 'black-friday': 'Black Friday / White Friday sales', summer: 'summer',
};

export function buildResearchPrompt(input: Pick<ResearchRequest, 'language' | 'season' | 'avoid'>, year = new Date().getUTCFullYear()): string {
  const season = input.season ? ` for ${SEASON_WORDS[input.season]} campaigns` : '';
  return [
    'You research ad styles for an art director. First look at the product photo: say what the product is and who it is for.',
    `Then use web search to find what current (${year - 1}-${year}) advertising, social media posts and product photography${season} for this kind of product look like: on Pinterest, Behance, Instagram ad galleries, design blogs and brand campaign roundups.`,
    'From what you read, give 5 distinct, modern style directions. Each direction differs from the others in setting, light, color mood and copy tone. Describe the visual (setting, surface, props, light, colors, camera angle) in at most 70 words and the headline style (tone, length, pattern) in at most 40 words.',
    'Learn styles only: never copy a specific brand\'s ad, slogan, logo, mascot or character, and never name a real brand in the directions.',
    input.avoid?.length ? `Avoid directions close to these, already used for this product: ${input.avoid.map(item => JSON.stringify(item)).join('; ')}.` : '',
    `Write the copy notes so they fit ${input.language === 'ar' ? 'Arabic' : 'English'} headlines.`,
    'Answer with only one JSON object and nothing else: {"productType": "...", "audience": "...", "trends": [{"name": "...", "visual": "...", "copy": "...", "source": "https URL of a page you used"}]}',
  ].filter(Boolean).join(' ');
}

/** Only public https pages are shown as sources; never a local, IP or credential-carrying address. */
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 400) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || /^\d+(\.\d+){3}$/.test(host) || host.includes(':')) return null;
  url.hash = '';
  return url.toString();
}

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null;

/** The first balanced JSON object inside a text answer (models sometimes wrap it in prose or a code fence). */
export function firstJsonObject(value: string): unknown {
  const start = value.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) { try { return JSON.parse(value.slice(start, index + 1)); } catch { return null; } }
  }
  return null;
}

/**
 * Read a Responses API answer: the text of every output message, the url
 * citations attached to it, and whether a web search ran. Unknown item types
 * are ignored, so a new envelope field never breaks the feature.
 */
export function parseResearchResponse(json: unknown, searchedTool: boolean): ResearchResult | null {
  const output = Array.isArray(asRecord(json)?.output) ? asRecord(json)!.output as unknown[] : [];
  let answer = '';
  let searchCalls = 0;
  const cited: { url: string; title?: string }[] = [];
  for (const raw of output) {
    const item = asRecord(raw); if (!item) continue;
    if (typeof item.type === 'string' && item.type.includes('search')) searchCalls++;
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content as unknown[]) {
      const content = asRecord(part); if (!content) continue;
      if (typeof content.text === 'string') answer += `${content.text}\n`;
      for (const note of Array.isArray(content.annotations) ? content.annotations as unknown[] : []) {
        const annotation = asRecord(note); if (!annotation) continue;
        const nested = asRecord(annotation.url_citation);
        const url = safeSourceUrl(annotation.url ?? nested?.url);
        if (url) cited.push({ url, ...(typeof (annotation.title ?? nested?.title) === 'string' ? { title: String(annotation.title ?? nested?.title).slice(0, 160) } : {}) });
      }
    }
  }
  if (!answer && typeof asRecord(json)?.output_text === 'string') answer = String(asRecord(json)!.output_text);
  const body = asRecord(firstJsonObject(answer));
  if (!body) return null;
  const trends: ResearchTrend[] = [];
  const fromTrends: { url: string }[] = [];
  for (const raw of Array.isArray(body.trends) ? body.trends.slice(0, 6) : []) {
    const parsed = researchTrendSchema.safeParse(raw);
    if (parsed.success) trends.push(parsed.data);
    const url = safeSourceUrl(asRecord(raw)?.source);
    if (url) fromTrends.push({ url });
  }
  // Citations Meta attached are real pages; URLs the model typed are used only when a search ran
  // and nothing was cited. Without a search, no source is shown at all.
  const seen = new Set<string>();
  const picked = !searchedTool ? [] : cited.length ? cited : searchCalls > 0 ? fromTrends : [];
  const sources = picked.filter(source => !seen.has(source.url) && seen.add(source.url)).slice(0, 8);
  const result = researchResultSchema.safeParse({
    productType: typeof body.productType === 'string' && body.productType.trim() ? body.productType : 'product',
    audience: typeof body.audience === 'string' ? body.audience.slice(0, 200) : '',
    trends,
    sources,
    searched: searchedTool && (searchCalls > 0 || cited.length > 0 || fromTrends.length > 0),
  });
  return result.success ? result.data : null;
}
