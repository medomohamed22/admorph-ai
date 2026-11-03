/**
 * Live test (six ads, 2 Nov): three of three English headlines opened with
 * "Meet ..." and the Gulf one with "تعرفوا على ...", so the ads read alike.
 * The planners are told to avoid these stock openers and to give each
 * headline its own hook.
 */
export const GENERIC_OPENERS_EN = ['Meet', 'Discover', 'Introducing', 'Say hello to', 'Experience', 'Unleash', 'Elevate', 'Your new', 'Get ready', 'Unlock'] as const;
export const GENERIC_OPENERS_AR = ['تعرف على', 'تعرفوا على', 'تعرّف على', 'تعرّفوا على', 'اكتشف', 'اكتشفوا', 'اكتشفي', 'نقدم لكم', 'نقدّم لكم', 'نقدم لك', 'إليكم', 'اليكم', 'استمتع ب', 'استمتعوا ب'] as const;

export const HEADLINE_HOOK_RULE = `Headlines must not open with stock openers such as ${GENERIC_OPENERS_EN.map(word => `"${word}"`).join(', ')}, ${GENERIC_OPENERS_AR.slice(0, 8).map(word => `"${word}"`).join(', ')} or any greeting or introduction. Lead with something concrete about the product or the customer's moment instead, and give each headline its own kind of hook (a benefit, a short question, a vivid moment, a playful word pair or a short command), so no two headlines start the same way. Never put a number, duration, percentage or price in a headline unless that exact fact is in the brand description, the written brief or printed on the product.`;

/**
 * Owner feedback (3 Nov): idea headlines were too long, often led with an
 * invented number ("24 hours of ice-cold in one bottle") and read alike from
 * run to run. Ideas now ask for three or four words, and each run draws its
 * own hook styles at random so a new round brings new headlines.
 */
export const HOOK_STYLES = [
  'a playful pun on what the product does',
  'a two- or three-word feeling the product gives',
  'a short, friendly command',
  'a short question the customer would ask themselves',
  'a vivid everyday moment where the product is used',
  'a contrast: this, not that',
  'a sensory word pair (touch, taste, smell, sound or look)',
  'a warm compliment to the customer',
  'a bold promise about the product\'s main use',
  'a local expression people really say',
] as const;

/** Picks `count` different hook styles at random (one per idea). */
export function pickHookStyles(count: number, random: () => number = Math.random): string[] {
  const pool: string[] = [...HOOK_STYLES];
  const picked: string[] = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length) % pool.length, 1)[0]);
  return picked;
}

/** The headline rule for ad ideas: short, about this product, in the chosen dialect, new each run. */
export function ideaHeadlineRule(angles: readonly string[], styles: readonly string[], dialectName?: string): string {
  const plan = angles.map((angle, index) => `the ${angle} idea uses ${styles[index] ?? 'its own hook'}`).join('; ');
  return `Every headline is three or four words, never more than five, and is about this exact product as seen in the photo (what it is, what it does or how it feels), not a general slogan that would fit any product. ${dialectName ? `Write it the way people really speak ${dialectName}, natural and catchy, never a word-for-word translation. ` : ''}Hook style for this round: ${plan}. Write fresh lines for this round instead of the first headline that comes to mind, so asking again gives new ideas. The title is two or three words.`;
}


/** True when a headline opens with one of the stock openers (used to measure and log, never to reject copy). */
export function opensGenerically(headline: string): boolean {
  const text = headline.trim().replace(/^[^\p{L}\p{N}]+/u, '');
  const lower = text.toLowerCase();
  return GENERIC_OPENERS_EN.some(word => lower === word.toLowerCase() || lower.startsWith(word.toLowerCase() + ' '))
    || GENERIC_OPENERS_AR.some(word => text.startsWith(word));
}
