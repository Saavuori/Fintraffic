const DARK_INK = '#0b1220';
const LIGHT_INK = '#ffffff';

/**
 * The glyph colour that reads on a given fill: dark on the bright category
 * colours the dark theme uses, white on the deeper ones the light theme swaps
 * in. Takes `#rgb` or `#rrggbb`; anything else gets dark ink.
 */
export function inkOn(fill: string): string {
  const hex = fill.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return DARK_INK;

  // WCAG relative luminance.
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Whichever ink has the higher contrast ratio against the fill. 0.179 is the
  // luminance at which the two ratios are equal.
  return luminance > 0.179 ? DARK_INK : LIGHT_INK;
}
