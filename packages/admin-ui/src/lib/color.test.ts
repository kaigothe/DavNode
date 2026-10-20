import { describe, expect, it } from 'vitest';
import {
  contrast,
  DEFAULT_CALENDAR_COLORS,
  ensureContrast,
  luminance,
  mix,
  parseHex,
  solidColors,
  tintedColors,
  toHex,
} from './color';

const LIGHT = { r: 255, g: 255, b: 255 };
const DARK = { r: 20, g: 20, b: 20 };

describe('parseHex / toHex', () => {
  it('read and write colours', () => {
    expect(parseHex('#1badf8')).toEqual({ r: 27, g: 173, b: 248 });
    expect(parseHex('#FA0')).toEqual({ r: 255, g: 170, b: 0 });
    expect(toHex({ r: 27, g: 173, b: 248 })).toBe('#1badf8');
  });

  it.each(['', 'red', '#12', '#1234567', '#gggggg', 'rgb(1,2,3)'])(
    'refuses %j',
    (value) => {
      expect(parseHex(value)).toBeNull();
    },
  );

  it('rounds and clamps when writing', () => {
    expect(toHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080');
  });
});

describe('contrast', () => {
  it('is 21 for black on white and 1 for the same colour', () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, LIGHT)).toBeCloseTo(21, 0);
    expect(contrast(LIGHT, LIGHT)).toBe(1);
  });

  it('does not depend on the order', () => {
    const a = { r: 27, g: 173, b: 248 };
    expect(contrast(a, DARK)).toBe(contrast(DARK, a));
  });

  it('luminance rises with brightness', () => {
    expect(luminance(LIGHT)).toBeGreaterThan(luminance(DARK));
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5)).toEqual({
      r: 50,
      g: 100,
      b: 25,
    });
  });
});

describe('ensureContrast', () => {
  it('leaves a colour that already reads as it is', () => {
    const navy = { r: 0, g: 0, b: 80 };
    expect(ensureContrast(navy, LIGHT, 'dark')).toEqual(navy);
  });

  it('darkens a light colour until it reads on a light background', () => {
    const yellow = { r: 255, g: 204, b: 0 };

    const result = ensureContrast(yellow, LIGHT, 'dark');

    expect(contrast(result, LIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(result.r).toBeLessThan(yellow.r);
  });

  it('lightens a dark colour on a dark background', () => {
    const result = ensureContrast({ r: 20, g: 40, b: 120 }, DARK, 'light');

    expect(contrast(result, DARK)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(DEFAULT_CALENDAR_COLORS)('the colours of %s', (hex) => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)('read in the %s theme (tinted event, 4.5:1)', (mode, surface) => {
    const colors = tintedColors(hex, mode, surface);

    const text = parseHex(colors.text);
    const background = parseHex(colors.background);
    expect(
      text && background && contrast(text, background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(colors.border).toBe(hex.toLowerCase());
  });

  it('read as a solid bar with white text (4.5:1)', () => {
    const colors = solidColors(hex);

    const fill = parseHex(colors.background);
    expect(
      fill && contrast({ r: 255, g: 255, b: 255 }, fill),
    ).toBeGreaterThanOrEqual(4.5);
    expect(colors.text).toBe('#ffffff');
  });
});

describe('a colour that is not valid', () => {
  it('falls back to the first default instead of failing', () => {
    expect(tintedColors('not a colour', 'light', LIGHT).border).toBe(
      DEFAULT_CALENDAR_COLORS[0],
    );
    expect(solidColors('').text).toBe('#ffffff');
  });
});
