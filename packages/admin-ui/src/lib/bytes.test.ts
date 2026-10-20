import { describe, expect, it } from 'vitest';
import { formatBytes, splitBytes, toBytes, usagePercent } from './bytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [5 * 1024 ** 3, '5 GB'],
  ])('formats %i as %s', (bytes, text) => {
    expect(formatBytes(bytes, 'en')).toBe(text);
  });

  it('uses the locale’s decimal separator', () => {
    expect(formatBytes(1536, 'de')).toBe('1,5 KB');
  });
});

describe('toBytes / splitBytes', () => {
  it('convert between amounts and bytes', () => {
    expect(toBytes(2, 'GB')).toBe(2 * 1024 ** 3);
    expect(toBytes(0.5, 'MB')).toBe(524288);
  });

  it('picks the largest unit that divides evenly', () => {
    expect(splitBytes(2 * 1024 ** 3)).toEqual({ amount: 2, unit: 'GB' });
    expect(splitBytes(1024 ** 4)).toEqual({ amount: 1, unit: 'TB' });
    expect(splitBytes(1536 * 1024 ** 2)).toEqual({ amount: 1536, unit: 'MB' });
  });

  it('falls back to a fractional MB value for odd sizes', () => {
    expect(splitBytes(1000)).toEqual({ amount: 0.001, unit: 'MB' });
  });

  it('round-trips', () => {
    for (const bytes of [1024 ** 2, 7 * 1024 ** 3, 3 * 1024 ** 4]) {
      const { amount, unit } = splitBytes(bytes);
      expect(toBytes(amount, unit)).toBe(bytes);
    }
  });
});

describe('usagePercent', () => {
  it('is null without a limit', () => {
    expect(usagePercent(5, null)).toBeNull();
  });

  it('rounds and caps at 100', () => {
    expect(usagePercent(1, 3)).toBe(33);
    expect(usagePercent(500, 100)).toBe(100);
  });

  it('treats a limit of zero as full once anything is used', () => {
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(1, 0)).toBe(100);
  });
});
