import { z } from 'zod';

/**
 * The home page showcase. Ads listed here must be real outputs of the site,
 * each with its certificate score; `sample: true` marks bundled artwork that
 * is not a model output, and the page labels it as such.
 */
const localPath = z.string().regex(/^\/(?:showcase|demo)\/[\w.-]+\.(?:png|jpe?g|webp)$/);
export const showcaseSchema = z.object({
  hero: z.object({ before: localPath, after: localPath, sample: z.boolean(), /** Frame shape; both images should have it. */ ratio: z.enum(['1:1', '4:5']).optional(), /** Name shown on the post preview. */ brand: z.string().trim().min(1).max(40).optional(), /** Caption under the post preview. */ caption: z.string().trim().max(120).optional() }).strict(),
  ads: z.array(z.object({
    src: localPath,
    category: z.enum(['food', 'electronics', 'fashion', 'perfume', 'beauty', 'other']),
    ratio: z.enum(['1:1', '4:5', '9:16']),
    headline: z.string().max(120),
    score: z.number().int().min(0).max(100).nullable(),
  }).strict()).max(12),
}).strict();
export type Showcase = z.infer<typeof showcaseSchema>;

export const EMPTY_SHOWCASE: Showcase = { hero: { before: '/showcase/headphones-photo.webp', after: '/showcase/headphones-ad.webp', sample: false }, ads: [] };

export function parseShowcase(raw: unknown): Showcase {
  const parsed = showcaseSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_SHOWCASE;
}
