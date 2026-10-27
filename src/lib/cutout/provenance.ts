// Cutout reuse: a cutout asset derived from a campaign product is found by
// provenance, so the same product is never segmented (or billed) twice.
// When both providers exist for one product, SAM wins: it is the precise one.

import type { Asset } from '@/lib/db/schema';

export function findCutoutAsset(assets: Asset[], productId: string): Asset | null {
  const matches = assets.filter(
    (asset) => asset.kind === 'cutout' && asset.meta?.derivedFrom === productId,
  );
  return (
    matches.find((asset) => asset.meta?.provider === 'meta-sam') ?? matches[0] ?? null
  );
}
