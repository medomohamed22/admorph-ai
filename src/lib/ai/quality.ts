/**
 * Publish-ready rules added to every image the site asks Muse Image for, so
 * an ad can go straight to Instagram or Facebook. They are the same checks
 * the critic scores afterwards (readability, clearance, a clean full frame),
 * so a picture that breaks one gets a concrete repair note, not a vague retry.
 *
 * The style target is the best ad the owner made: one continuous editorial
 * photograph from edge to edge, the headline set in a calm part of that same
 * scene, two or three real props, soft natural light.
 */
export const FRAME_RULES = [
  'The scene fills the entire frame edge to edge as one continuous photograph. The mockup\'s flat light-gray background is only a placeholder: replace all of it with the scene.',
  'Never leave any flat gray, white or black area, band, bar, letterbox, border, box or frame around the photo, behind the headline or around the product.',
];

export const STYLE_RULES = [
  'Style: premium editorial product photography, soft natural light, a simple uncluttered surface, two or three real props that suit the product, and generous calm space around the product and the headline.',
];

export const PRODUCT_RULES = [
  'Show the product as a brand-new retail unit: remove creases, dents, crumples, dust, stains, scratches, glare and worn edges, and give it clean even lighting and crisp printing, while keeping its exact shape, proportions, colors, logo and every printed word and detail identical.',
  'The product is sharp, fully visible and the clear hero, with realistic contact shadows, never cropped by the frame.',
  'No watermarks, extra logos, stray letters, garbled text or duplicated objects.',
];

export const TEXT_QUALITY_RULES = [
  'Set the headline directly in a calm, even, object-free part of the scene itself (a plain wall, sky, soft-focus background or empty table area composed for it), never over a mirror, window, plant, person or busy texture, and never on a solid band or box.',
  'Every word must stay readable at phone size: dark text over a light calm area or light text over a dark calm area; if contrast is still weak, add only a soft natural shadow behind the letters.',
  'Never let any text, price tag or button touch, overlap or hide the product; keep a clear gap of at least 4% of the frame around the product.',
  'The headline is bold and clean, at most two balanced lines, at least 6% away from every edge.',
  'A price tag or a button is a solid rounded shape sized to its own words with even padding, in the brand palette and matching the scene\'s style, never a plain black blob or a circle that the words spill out of.',
];

/** The rules as prompt sentences; `withText` adds the text rules for ads that carry words. */
export function qualityRules(withText: boolean): string {
  return [...FRAME_RULES, ...STYLE_RULES, ...PRODUCT_RULES, ...(withText ? TEXT_QUALITY_RULES : [])].join(' ');
}
