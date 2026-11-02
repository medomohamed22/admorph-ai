/**
 * Live test (six ads, 2 Nov): three of three English headlines opened with
 * "Meet ..." and the Gulf one with "تعرفوا على ...", so the ads read alike.
 * The planners are told to avoid these stock openers and to give each
 * headline its own hook.
 */
export const GENERIC_OPENERS_EN = ['Meet', 'Discover', 'Introducing', 'Say hello to', 'Experience', 'Unleash', 'Elevate', 'Your new', 'Get ready', 'Unlock'] as const;
export const GENERIC_OPENERS_AR = ['تعرف على', 'تعرفوا على', 'تعرّف على', 'تعرّفوا على', 'اكتشف', 'اكتشفوا', 'اكتشفي', 'نقدم لكم', 'نقدّم لكم', 'نقدم لك', 'إليكم', 'اليكم', 'استمتع ب', 'استمتعوا ب'] as const;

export const HEADLINE_HOOK_RULE = `Headlines must not open with stock openers such as ${GENERIC_OPENERS_EN.map(word => `"${word}"`).join(', ')}, ${GENERIC_OPENERS_AR.slice(0, 8).map(word => `"${word}"`).join(', ')} or any greeting or introduction. Lead with something concrete about the product or the customer's moment instead, and give each headline its own kind of hook (a benefit, a short question, a number, a vivid moment or a short command), so no two headlines start the same way.`;

/** True when a headline opens with one of the stock openers (used to measure and log, never to reject copy). */
export function opensGenerically(headline: string): boolean {
  const text = headline.trim().replace(/^[^\p{L}\p{N}]+/u, '');
  const lower = text.toLowerCase();
  return GENERIC_OPENERS_EN.some(word => lower === word.toLowerCase() || lower.startsWith(word.toLowerCase() + ' '))
    || GENERIC_OPENERS_AR.some(word => text.startsWith(word));
}
