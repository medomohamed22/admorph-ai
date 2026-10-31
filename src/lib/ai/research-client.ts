import { metaFetch } from './meta-fetch';
import { requireMetaSuccess } from './meta-client-error';
import { researchResultSchema, type ResearchResult } from './research';
import { encodeProduct, fitProductImage } from '../campaign/client';

/** Web search runs on Meta's side; one research call took 47–52 s live. */
export const RESEARCH_TIMEOUT_MS = 95_000;

export async function requestResearch(input: { apiKey: string; modelId: string; image: Blob; language: 'en' | 'ar'; season?: 'ramadan' | 'eid' | 'black-friday' | 'summer'; avoid?: string[] }, signal?: AbortSignal): Promise<ResearchResult> {
  const image = await encodeProduct(await fitProductImage(input.image));
  const body = { providerId: 'meta', modelId: input.modelId, apiKey: input.apiKey, consent: true, imageConsent: true, image, language: input.language, ...(input.season ? { season: input.season } : {}), ...(input.avoid?.length ? { avoid: input.avoid.slice(0, 8) } : {}) };
  const response = await metaFetch('vision', '/api/ai/market-research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(RESEARCH_TIMEOUT_MS)]) : AbortSignal.timeout(RESEARCH_TIMEOUT_MS) });
  await requireMetaSuccess(response);
  return researchResultSchema.parse(await response.json());
}

export { savedResearchSchema, pickTrends, pickStyles, researchBrief, sourceHost, STYLE_LIBRARY, type SavedResearch } from './research-picks';
