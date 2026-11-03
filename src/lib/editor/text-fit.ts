/**
 * Owner report (3 Nov): a long headline on the mockup lost its last word
 * ("24 hours of ice-cold in one" with "bottle" cut off) because two lines at
 * the set size did not fit the text box. The canvas now lowers the size until
 * every word fits the box, so the mockup (and the ad painted from it) always
 * shows the whole headline.
 */
export type MeasureText = (text: string, fontSize: number) => number;

/** Number of lines the words take at this size, or Infinity when one word alone is wider than the box. */
export function wrappedLines(text: string, maxWidth: number, fontSize: number, measure: MeasureText): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1, line = '';
  for (const word of words) {
    if (measure(word, fontSize) > maxWidth) return Infinity;
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, fontSize) > maxWidth) { lines += 1; line = word; } else line = next;
  }
  return lines;
}

/** The largest size, at most `preferred`, at which the text fits inside the box. */
export function fitFontSize(text: string, box: { width: number; height: number }, options: { preferred: number; padding: number; lineHeight: number; min?: number }, measure: MeasureText): number {
  const min = Math.max(8, options.min ?? 20);
  const width = box.width - options.padding * 2, height = box.height - options.padding * 2;
  if (!text.trim() || width <= 0 || height <= 0) return options.preferred;
  for (let size = Math.round(options.preferred); size > min; size -= 2) {
    const lines = wrappedLines(text, width, size, measure);
    if (Number.isFinite(lines) && lines * size * options.lineHeight <= height) return size;
  }
  return min;
}
