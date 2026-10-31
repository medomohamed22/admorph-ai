/**
 * Publish-ready rules added to every image the site asks Muse Image for, so
 * an ad can go straight to Instagram or Facebook. They are the same checks
 * the critic scores afterwards (readability and clearance), so a picture
 * that breaks one gets a concrete repair note instead of a vague retry.
 */
export const TEXT_QUALITY_RULES = [
  'Every word must stay readable at phone size: light text only over dark, calm areas and dark text only over light, calm areas; where the area behind the words is busy or mid-tone, put the words on a solid or softly blurred panel.',
  'Never let any text, price tag or button touch, overlap or hide the product; keep a clear gap of at least 4% of the frame around the product.',
  'The headline sits in its own quiet zone, at most two balanced lines, at least 6% away from every edge, never crossing the product.',
  'A price tag or a button is a solid rounded shape sized to its own words with even padding, in the brand palette and matching the scene\'s style, never a plain black blob or a circle that the words spill out of.',
];

export const IMAGE_QUALITY_RULES = [
  'Publish-ready quality: the product is sharp, fully visible, well lit and the clear hero; realistic contact shadows; no cropping of the product by the frame.',
  'No borders, frames, watermarks, extra logos, stray letters, garbled text or duplicated objects.',
];

/** The rules as prompt sentences; `withText` adds the text rules for ads that carry words. */
export function qualityRules(withText: boolean): string {
  return [...IMAGE_QUALITY_RULES, ...(withText ? TEXT_QUALITY_RULES : [])].join(' ');
}
