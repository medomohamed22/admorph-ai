import { contrastRatio } from '../editor/checks';
export function themeColors(colors: [string, string, string]) {
  const dark = '#000000', white = '#ffffff';
  return {
    primary: colors[0], secondary: colors[1], accent: colors[2],
    foreground: contrastRatio(dark, colors[0]) >= contrastRatio(white, colors[0]) ? dark : white,
    secondaryForeground: contrastRatio(dark, colors[1]) >= contrastRatio(white, colors[1]) ? dark : white,
    readableAccent: contrastRatio(colors[0], '#f8f7f3') >= 4.5 ? colors[0] : dark,
    outline: contrastRatio(colors[0], '#f8f7f3') >= 3 ? colors[0] : dark,
    accentLine: contrastRatio(colors[2], '#f8f7f3') >= 3 ? colors[2] : dark,
  };
}
