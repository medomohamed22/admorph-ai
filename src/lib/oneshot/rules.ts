import { contrastFromLuminance, luminanceOfHex } from '../critic/pixels';
import type { OneshotCanvasElement } from '../ai/oneshot';

/** Version stamped into the evidence manifest, so a certificate always
 * names the rule set that produced it. */
export const INSPECT_RULE_VERSION = '1';
/** The neutral mockup sheet the canvas draws text on. */
export const MOCKUP_SHEET = '#e9e9e9';
/** Text closer than this to any frame edge risks app-UI overlap. */
export const SAFE_MARGIN = 60;
/** WCAG AA floor for normal text. */
export const TEXT_CONTRAST_MIN = 4.5;

export type InspectCode = 'overlap_product' | 'overlap_text' | 'overlap_logo' | 'low_contrast' | 'outside_safe_zone';
export type InspectFinding = { id: string; code: InspectCode; severity: 'error' | 'warning'; elementIds: string[]; detail: string };

type Box = { x: number; y: number; width: number; height: number };
function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Deterministic mockup check: geometry and pixel contrast only. It never
 * calls a model, never fixes anything, and never touches the product
 * pixels — it only reports what is measurably wrong. Blank text boxes
 * render nothing, so they are excluded from every rule.
 */
export function inspectOneshotLayout(elements: OneshotCanvasElement[]): InspectFinding[] {
  const findings: InspectFinding[] = [];
  const texts = elements.filter(item => (item.kind === 'text' || item.kind === 'phone') && item.text?.trim());
  const product = elements.find(item => item.kind === 'product');
  if (product) for (const item of elements) {
    if (item.id === product.id) continue;
    if ((item.kind === 'text' || item.kind === 'phone') && !item.text?.trim()) continue;
    if (intersects(item, product)) findings.push({ id: `overlap_product:${item.id}`, code: 'overlap_product', severity: 'error', elementIds: [item.id, product.id], detail: '' });
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (intersects(texts[i], texts[j])) findings.push({ id: `overlap_text:${texts[i].id}:${texts[j].id}`, code: 'overlap_text', severity: 'warning', elementIds: [texts[i].id, texts[j].id], detail: '' });
  }
  for (const logo of elements.filter(item => item.kind === 'logo')) for (const text of texts) {
    if (intersects(logo, text)) findings.push({ id: `overlap_logo:${logo.id}:${text.id}`, code: 'overlap_logo', severity: 'warning', elementIds: [logo.id, text.id], detail: '' });
  }
  for (const text of texts) {
    const ratio = contrastFromLuminance(luminanceOfHex(text.color ?? '#16100C'), luminanceOfHex(MOCKUP_SHEET));
    if (ratio < TEXT_CONTRAST_MIN) findings.push({ id: `low_contrast:${text.id}`, code: 'low_contrast', severity: 'warning', elementIds: [text.id], detail: ratio.toFixed(2) });
  }
  for (const text of texts) {
    const margin = Math.min(text.x, text.y, 1080 - (text.x + text.width), 1350 - (text.y + text.height));
    if (margin < SAFE_MARGIN) findings.push({ id: `outside_safe_zone:${text.id}`, code: 'outside_safe_zone', severity: 'warning', elementIds: [text.id], detail: `${margin}px` });
  }
  return findings;
}
