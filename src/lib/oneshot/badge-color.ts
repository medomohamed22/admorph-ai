const HEX = /^#[\da-f]{6}$/i;

/** Black or white, whichever reads better on a badge color. */
export function textOn(fill: string): string {
  if (!HEX.test(fill)) return '#FFFFFF';
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(fill.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? '#FFFFFF' : '#16100C';
}
