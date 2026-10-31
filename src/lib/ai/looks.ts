/**
 * Light and mood looks that fit any place. Three are picked at random on the
 * device for every round of ideas (one per idea), so two runs, or two users
 * with similar products, rarely get the same picture. No request, no wait.
 */
export const LOOK_LIBRARY: readonly string[] = [
  'soft morning window light, eye-level, airy and fresh',
  'warm golden-hour side light with long soft shadows',
  'cool blue hour outside with a warm lamp glow inside',
  'bright midday light with crisp, clean shadows',
  'cozy evening candle and lamp light, intimate close-up',
  'overcast diffused daylight, calm and even, top-down view',
  'moody low-key light from one source, deep shadows',
  'dappled light through leaves or blinds, playful patterns',
  'backlit glow with a gentle rim around the product',
  'high-key bright and clean, soft pastel mood',
  'warm tungsten interior light, nostalgic film look',
  'fresh rainy-day light by a wet window, soft reflections',
  'sunset warmth with a peach and lilac sky tone',
  'crisp winter morning light, cool and quiet',
  'festive warm string lights out of focus behind',
  'neon city glow at night with colorful reflections',
  'natural shade on a bright day, soft and even',
  'low-angle hero shot with dramatic sky or ceiling',
  'macro close-up with shallow depth of field and soft bokeh',
  'wide establishing shot showing the whole place, product in front',
  'over-the-shoulder lifestyle angle, hands in frame',
  '45-degree tabletop angle with a gentle vignette',
  'symmetrical front view, calm and balanced',
  'early morning haze with soft volumetric light rays',
  'saturated summer brightness, bold and cheerful',
  'muted earthy tones, slow and mindful mood',
  'luxurious dark tones with a single warm highlight',
  'clean Scandinavian daylight, light woods and whites',
  'warm Mediterranean sun with white walls and blue accents',
  'soft spotlight on the product, surroundings slightly darker',
];

export function pickLooks(count: number, random: () => number = Math.random): string[] {
  const copy = [...LOOK_LIBRARY];
  for (let index = copy.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap], copy[index]]; }
  return copy.slice(0, Math.max(0, count));
}
