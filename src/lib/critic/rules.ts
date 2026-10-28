import type { Creative } from '../editor/schema';
import { contrastRatio } from '../editor/checks';
import { detectDirection, hasMixedScripts, hasStrongDirection } from '../editor/direction';
import { dimensionsFor } from '../editor/sizes';
import type { Finding, RuleResult, TextMetrics } from './schema';
import {placementFindings} from '../editor/safe-zones';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function normalizeFingerprint(value: string): string { try { return JSON.stringify(canonical(JSON.parse(value))); } catch { return value; } }
export function fingerprint(creative: Creative) { return JSON.stringify(canonical({ id: creative.id, layers: creative.layers, caption: creative.caption, ...(creative.placement?{placement:creative.placement}:{}), ...(creative.polish?{polish:creative.polish}:{}), inputRevision: creative.inputRevision })); }
export function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5;
}
export function checkCreative(creative: Creative, measurements: TextMetrics, assetIds: Set<string>, dimensions = { width: 1080, height: 1350 }, brandColors?: readonly string[]): RuleResult {
  const issues: Finding[] = [];
  const add = (code: Finding['code'], severity: Finding['severity'], layerIds: string[], evidence: Finding['evidence'] = {}) => issues.push({ id: `${code}:${layerIds.join(':')}:${evidence.kind ?? ''}`, code, severity, layerIds, evidence });
  const visible = creative.layers.filter(layer => layer.visible);
  for (const layer of visible) {
    if (![layer.x, layer.y, layer.width, layer.height].every(Number.isFinite) || layer.x < 0 || layer.y < 0 || layer.width <= 0 || layer.height <= 0 || layer.x + layer.width > dimensions.width + 0.01 || layer.y + layer.height > dimensions.height + 0.01) add('bounds', 'error', [layer.id]);
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
    // One language per text layer: a Latin brand name must stay in its own
    // layer, never mixed with Arabic text in the same layer.
    if (hasMixedScripts(layer.text)) add('mixed_scripts', 'warning', [layer.id]);
    // Forced opposite direction: an Arabic-script layer forced LTR (or a
    // Latin layer forced RTL) renders backwards. Auto and directionless
    // text (digits, punctuation) never trigger this.
    if (layer.dir && layer.dir !== 'auto' && hasStrongDirection(layer.text) && layer.dir !== detectDirection(layer.text)) add('direction_mismatch', 'warning', [layer.id]);
  }
  for (const kind of ['headline', 'brand', 'cta'] as const) if (!visible.some(layer => layer.kind === kind && layer.text.trim())) add('copy_missing', 'error', creative.layers.filter(layer => layer.kind === kind).map(layer => layer.id), { kind });
  if (!creative.layers.some(layer => layer.kind === 'product' && layer.assetId)) add('asset_missing', 'error', creative.layers.filter(layer => layer.kind === 'product').map(layer => layer.id), { kind: 'product' });
  for (const logo of visible.filter(layer => layer.kind === 'logo')) for (const headline of visible.filter(layer => layer.kind === 'headline')) if (intersects(logo, headline)) add('logo_overlap', 'warning', [logo.id, headline.id]);
  if (dimensions.width !== dimensionsFor(creative.format).width || dimensions.height !== dimensionsFor(creative.format).height) add('dimensions', 'error', [], dimensions);
  const groups: Record<RuleResult['checks'][number]['key'], Finding['code'][]> = { bounds: ['bounds'], text: ['text_clipped', 'measurement_unavailable'], copy: ['copy_missing', 'mixed_scripts', 'direction_mismatch'], contrast: ['contrast', 'contrast_unavailable'], overlap: ['logo_overlap'], brand: ['cta_off_brand'], assets: ['asset_missing'], dimensions: ['dimensions'] };
  issues.push(...placementFindings(creative));
  for(const logo of visible.filter(layer=>layer.kind==='logo'))for(const product of visible.filter(layer=>layer.kind==='product'))if(intersects(logo,product))add('logo_product_overlap','warning',[logo.id,product.id]);
  // CTA identity lock: the button must wear brand colors only. A gold or
  // hardcoded accent (the bug in the user's TALJ export) is a warning
  // with a one-click fix to the darkest/lightest brand pair.
  if (brandColors) {
    const palette = new Set(brandColors.map(color => color.toLowerCase()));
    for (const cta of visible.filter(layer => layer.kind === 'cta')) if (cta.fill !== 'transparent' && (!palette.has(cta.fill.toLowerCase()) || !palette.has(cta.color.toLowerCase()))) add('cta_off_brand', 'warning', [cta.id], { fill: cta.fill, color: cta.color });
  }
  return { issues, checks: Object.entries(groups).map(([key, codes]) => {
    const found = issues.filter(issue => codes.includes(issue.code));
    if ((key === 'text' || key === 'contrast') && !visible.some(layer => ['headline', 'brand', 'cta'].includes(layer.kind) && layer.text.trim()) || key === 'overlap' && !visible.some(layer => layer.kind === 'logo') || key === 'brand' && !visible.some(layer => layer.kind === 'cta')) return { key: key as keyof typeof groups, status: 'partial' };
    return { key: key as keyof typeof groups, status: found.some(issue => issue.severity !== 'info') ? 'fail' : found.length ? 'partial' : 'pass' };
  }) };
}
