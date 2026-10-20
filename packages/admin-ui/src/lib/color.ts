/** An sRGB colour, each channel 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Reads `#rgb` or `#rrggbb`; `null` for anything else. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }
  const full =
    digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** `#rrggbb`. */
export function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `amount` of `a` and the rest of `b` (`amount` 0–1). */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r * amount + b.r * (1 - amount),
    g: a.g * amount + b.g * (1 - amount),
    b: a.b * amount + b.b * (1 - amount),
  };
}

/** Relative luminance (WCAG 2). */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio of two colours (WCAG 2), 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Whole-number channels, as they will be written: contrast must hold for what is shown. */
function rounded({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * `foreground`, moved toward black or white in 1 % steps until it has at
 * least `minimum` contrast on `background`. Keeps the hue as long as it can.
 */
export function ensureContrast(
  foreground: Rgb,
  background: Rgb,
  toward: 'dark' | 'light',
  minimum = 4.5,
): Rgb {
  const target = toward === 'dark' ? BLACK : WHITE;
  for (let step = 0; step <= 100; step += 1) {
    const candidate = rounded(mix(target, foreground, step / 100));
    if (contrast(candidate, background) >= minimum) {
      return candidate;
    }
  }
  return target;
}

/** The colours of one event, all as CSS colours. */
export interface EventColors {
  background: string;
  border: string;
  text: string;
}

/** What Apple's palette suggests for a calendar that has no colour of its own. */
export const DEFAULT_CALENDAR_COLORS = [
  '#1badf8',
  '#63da38',
  '#ff9500',
  '#cc73e1',
  '#ff2968',
  '#ffcc00',
  '#a2845e',
  '#7d7d7d',
];

/**
 * The colours of a timed event in a calendar of colour `hex`: a tint of the
 * colour as the background, the colour itself as a bar, and the text in a
 * shade of the colour that still reads on the tint (WCAG AA, 4.5:1).
 * `surface` is the colour of the page behind it.
 */
export function tintedColors(
  hex: string,
  mode: 'light' | 'dark',
  surface: Rgb,
): EventColors {
  const color =
    parseHex(hex) ?? parseHex(DEFAULT_CALENDAR_COLORS[0] ?? '#1badf8') ?? BLACK;
  const background = rounded(
    mix(color, surface, mode === 'light' ? 0.2 : 0.32),
  );
  const text = ensureContrast(
    color,
    background,
    mode === 'light' ? 'dark' : 'light',
  );
  return {
    background: toHex(background),
    border: toHex(color),
    text: toHex(text),
  };
}

/**
 * The colours of an all-day or multi-day event, drawn as a solid bar: the
 * calendar colour, darkened until white text on it has 4.5:1.
 */
export function solidColors(hex: string): EventColors {
  const color =
    parseHex(hex) ?? parseHex(DEFAULT_CALENDAR_COLORS[0] ?? '#1badf8') ?? BLACK;
  const fill = ensureContrast(color, WHITE, 'dark');
  return { background: toHex(fill), border: toHex(fill), text: '#ffffff' };
}
