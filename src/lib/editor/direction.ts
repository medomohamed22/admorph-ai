// Text direction for editable layers (pure, no rendering).
//
// The old rule keyed direction off the font (Cairo = RTL), which misrendered
// both cases the user hit: an Arabic headline in Inter rendered LTR, and a
// Latin brand name (e.g. TALJ) in Cairo rendered RTL. Direction now comes
// from content: the first strong directional character wins. An explicit
// per-layer setting overrides auto; for empty text the font heuristic is
// kept only as a harmless fallback (nothing renders anyway).

import type { EditableLayer } from './schema';

export type LayerDirection = 'ltr' | 'rtl';
export type LayerDirSetting = 'auto' | LayerDirection;

const RTL_RANGE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_LETTER = /[A-Za-z]/;

/** First strong character decides; digits, spaces and punctuation are neutral. */
export function detectDirection(text: string): LayerDirection {
  for (const char of text) {
    if (RTL_RANGE.test(char)) return 'rtl';
    if (LTR_LETTER.test(char)) return 'ltr';
  }
  return 'ltr';
}

/** True when one layer mixes Arabic-script and Latin letters. */
export function hasMixedScripts(text: string): boolean {
  let arabic = false;
  let latin = false;
  for (const char of text) {
    if (RTL_RANGE.test(char)) arabic = true;
    if (LTR_LETTER.test(char)) latin = true;
    if (arabic && latin) return true;
  }
  return false;
}

/** True when the text has at least one strong directional character. Digits, spaces and punctuation alone must not trigger a direction rule. */
export function hasStrongDirection(text: string): boolean {
  for (const char of text) {
    if (RTL_RANGE.test(char) || LTR_LETTER.test(char)) return true;
  }
  return false;
}

/** Explicit setting wins; otherwise content wins; empty text keeps the font hint. */
export function resolveLayerDirection(layer: {
  dir?: LayerDirSetting;
  text: string;
  fontFamily: EditableLayer['fontFamily'];
}): LayerDirection {
  if (layer.dir && layer.dir !== 'auto') return layer.dir;
  for (const char of layer.text) {
    if (RTL_RANGE.test(char)) return 'rtl';
    if (LTR_LETTER.test(char)) return 'ltr';
  }
  return layer.fontFamily === 'Cairo' ? 'rtl' : 'ltr';
}
