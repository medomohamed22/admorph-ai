import type { Creative } from '../editor/schema';
import { contrastRatio } from '../editor/checks';
import type { Finding, RuleResult, TextMetrics } from './schema';
import {placementFindings} from '../editor/safe-zones';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function normalizeFingerprint(value: string): string { try { return JSON.stringify(canonical(JSON.parse(value))); } catch { return value; } }
export function fingerprint(creative: Creative) { return JSON.stringify(canonical({ id: creative.id, layers: creative.layers, caption: creative.caption, ...(creative.placement?{placement:creative.placement}:{}), inputRevision: creative.inputRevision })); }
export function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5;
}
export function checkCreative(creative: Creative, measurements: TextMetrics, assetIds: Set<string>, dimensions = { width: 1080, height: 1350 }): RuleResult {
  const issues: Finding[] = [];
  const add = (code: Finding['code'], severity: Finding['severity'], layerIds: string[], evidence: Finding['evidence'] = {}) => issues.push({ id: `${code}:${layerIds.join(':')}:${evidence.kind ?? ''}`, code, severity, layerIds, evidence });
  const visible = creative.layers.filter(layer => layer.visible);
  for (const layer of visible) {
    if (![layer.x, layer.y, layer.width, layer.height].every(Number.isFinite) || layer.x < 0 || layer.y < 0 || layer.width <= 0 || layer.height <= 0 || layer.x + layer.width > 1080.01 || layer.y + layer.height > 1350.01) add('bounds', 'error', [layer.id]);
    if (layer.assetId && !assetIds.has(layer.assetId)) add('asset_missing', 'error', [layer.id]);
    if (!['headline', 'brand', 'cta'].includes(layer.kind) || !layer.text.trim()) continue;
    const metrics = measurements[layer.id];
    if (!metrics || !Number.isFinite(metrics.neededHeight)) add('measurement_unavailable', 'info', [layer.id]);
    else if (metrics.unrenderable || metrics.neededHeight > layer.height + 1) add('text_clipped', 'error', [layer.id], { needed: Math.ceil(metrics.neededHeight), available: Math.round(layer.height) });
    const above = visible.slice(visible.indexOf(layer) + 1).some(other => intersects(layer, other));
    if (layer.assetId || above) add('contrast_unavailable', 'info', [layer.id]);
    else {
      try { const ratio = contrastRatio(layer.color, layer.fill); if (ratio < 4.5) add('contrast', 'warning', [layer.id], { ratio: ratio.toFixed(2), target: '4.5' }); }
      catch { add('contrast_unavailable', 'info', [layer.id]); }
    }
  }
  for (const kind of ['headline', 'brand', 'cta'] as const) if (!visible.some(layer => layer.kind === kind && layer.text.trim())) add('copy_missing', 'error', creative.layers.filter(layer => layer.kind === kind).map(layer => layer.id), { kind });
  if (!creative.layers.some(layer => layer.kind === 'product' && layer.assetId)) add('asset_missing', 'error', creative.layers.filter(layer => layer.kind === 'product').map(layer => layer.id), { kind: 'product' });
  for (const logo of visible.filter(layer => layer.kind === 'logo')) for (const headline of visible.filter(layer => layer.kind === 'headline')) if (intersects(logo, headline)) add('logo_overlap', 'warning', [logo.id, headline.id]);
  if (dimensions.width !== 1080 || dimensions.height !== 1350) add('dimensions', 'error', [], dimensions);
  const groups: Record<RuleResult['checks'][number]['key'], Finding['code'][]> = { bounds: ['bounds'], text: ['text_clipped', 'measurement_unavailable'], copy: ['copy_missing'], contrast: ['contrast', 'contrast_unavailable'], overlap: ['logo_overlap'], assets: ['asset_missing'], dimensions: ['dimensions'] };
  issues.push(...placementFindings(creative));
  for(const logo of visible.filter(layer=>layer.kind==='logo'))for(const product of visible.filter(layer=>layer.kind==='product'))if(intersects(logo,product))add('logo_product_overlap','warning',[logo.id,product.id]);
  return { issues, checks: Object.entries(groups).map(([key, codes]) => {
    const found = issues.filter(issue => codes.includes(issue.code));
    if ((key === 'text' || key === 'contrast') && !visible.some(layer => ['headline', 'brand', 'cta'].includes(layer.kind) && layer.text.trim()) || key === 'overlap' && !visible.some(layer => layer.kind === 'logo')) return { key: key as keyof typeof groups, status: 'partial' };
    return { key: key as keyof typeof groups, status: found.some(issue => issue.severity !== 'info') ? 'fail' : found.length ? 'partial' : 'pass' };
  }) };
}
