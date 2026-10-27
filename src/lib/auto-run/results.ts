// Results for one auto run: the hero plus up to three variants. Copy
// candidates are local templates from the user's own brand words only —
// they permute brand, category, mood and description, and never invent
// offers, prices or claims. Variants differ by layout preset and tagline;
// they share the run's background until a per-result regenerate replaces
// it. A variant that fails to compose is skipped; the hero always stays.

import { z } from 'zod';
import { creativeSchema, type Creative } from '../editor/schema';
import { backgroundStyleSchema, buildBackgroundBrief, type BackgroundBrief } from '../background/brief';
import { composeAutoAd } from './compose';

export const autoResultSchema = z
  .object({
    id: z.string().uuid(),
    preset: backgroundStyleSchema,
    tagline: z.string(),
    caption: z.string().max(1200),
    hero: creativeSchema,
    backgroundAssetId: z.string().uuid(),
    backgroundVariant: z.number().int().min(0).max(2),
  })
  .strict();

export type AutoResult = z.infer<typeof autoResultSchema>;

/** Three distinct tagline candidates from user words only. */
export function buildTaglineCandidates(
  brandName: string,
  productCategory: string,
  sceneMood: string,
  brandDescription?: string,
): string[] {
  const forms = [
    `${brandName} · ${productCategory}`,
    brandDescription?.trim() ? `${brandName} — ${brandDescription.trim()}` : `${brandName} · ${sceneMood}`,
    `${productCategory} · ${sceneMood}`,
    `${brandName}: ${productCategory}`,
    `${sceneMood} · ${brandName}`,
  ];
  const unique: string[] = [];
  for (const form of forms) {
    if (!unique.includes(form)) unique.push(form);
    if (unique.length === 3) break;
  }
  return unique;
}

export interface BuildResultsInput {
  brandName: string;
  brandColors: [string, string, string];
  brandDescription: string;
  productCategory: string;
  stylePreset: z.infer<typeof backgroundStyleSchema>;
  hero: Creative;
  tagline: string;
  caption: string;
  cta: string;
  cutoutAssetId: string;
  backgroundAssetId: string;
  sceneMood: string;
}

function nextPreset(preset: z.infer<typeof backgroundStyleSchema>, step: number) {
  const order: Array<z.infer<typeof backgroundStyleSchema>> = ['hero', 'dynamic', 'minimal'];
  return order[(order.indexOf(preset) + step) % 3];
}

export function buildResults(input: BuildResultsInput): AutoResult[] {
  const candidates = buildTaglineCandidates(
    input.brandName,
    input.productCategory,
    input.sceneMood,
    input.brandDescription,
  );
  const heroResult: AutoResult = {
    id: crypto.randomUUID(),
    preset: input.stylePreset,
    tagline: input.tagline,
    caption: input.caption.slice(0, 1200),
    hero: input.hero,
    backgroundAssetId: input.backgroundAssetId,
    backgroundVariant: 0,
  };
  const results: AutoResult[] = [heroResult];
  const specs: Array<{ preset: z.infer<typeof backgroundStyleSchema>; tagline: string }> = [
    { preset: input.stylePreset, tagline: candidates[1] ?? candidates[0] },
    { preset: nextPreset(input.stylePreset, 1), tagline: candidates[2] ?? candidates[0] },
    { preset: nextPreset(input.stylePreset, 2), tagline: candidates[0] },
  ];
  for (const spec of specs) {
    try {
      const brief: BackgroundBrief = buildBackgroundBrief({
        productCategory: input.productCategory,
        brandColors: input.brandColors,
        stylePreset: spec.preset,
      });
      const hero = composeAutoAd({
        brandName: input.brandName,
        brandColors: input.brandColors,
        brief,
        cutoutAssetId: input.cutoutAssetId,
        backgroundAssetId: input.backgroundAssetId,
        tagline: spec.tagline,
        caption: input.caption.slice(0, 1200),
        cta: input.cta,
      });
      results.push({
        id: crypto.randomUUID(),
        preset: spec.preset,
        tagline: spec.tagline,
        caption: input.caption.slice(0, 1200),
        hero,
        backgroundAssetId: input.backgroundAssetId,
        backgroundVariant: 0,
      });
    } catch {
      // Partial failure: keep the hero and the variants that composed.
    }
  }
  return results;
}
