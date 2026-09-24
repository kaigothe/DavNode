import { describe, expect, it } from 'vitest';
import { epochMillisDateTransformer } from './epoch-millis-date.transformer.js';

describe('epochMillisDateTransformer', () => {
  const to = epochMillisDateTransformer.to as (
    value: Date | null | undefined,
  ) => number | null | undefined;
  const from = epochMillisDateTransformer.from as (
    value: string | number | Date | null,
  ) => Date | null;

  it('stores a Date as epoch milliseconds, keeping millisecond precision', () => {
    expect(to(new Date('2026-10-25T01:30:00.123Z'))).toBe(1792891800123);
    expect(to(new Date(0))).toBe(0);
  });

  it('reads back what Postgres/MySQL (a string) and SQLite (a number) return for a bigint', () => {
    const date = new Date('2026-10-25T01:30:00.123Z');
    expect(from('1792891800123')).toEqual(date);
    expect(from(1792891800123)).toEqual(date);
  });

  it('round-trips two instants that share a wall-clock time in a DST zone without merging them', () => {
    // 02:30 CEST and 02:30 CET, one hour apart, on the night the clocks go back.
    const first = new Date('2026-10-25T00:30:00Z');
    const second = new Date('2026-10-25T01:30:00Z');

    expect(to(first)).not.toBe(to(second));
    expect(from(String(to(first)))).toEqual(first);
    expect(from(String(to(second)))).toEqual(second);
  });

  it('tolerates a value that is already a Date — TypeORM re-runs `from` over freshly inserted entity values', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(from(date)).toBe(date);
  });

  it('passes null and undefined through', () => {
    expect(to(null)).toBeNull();
    expect(to(undefined)).toBeUndefined();
    expect(from(null)).toBeNull();
  });

  it('refuses to store an invalid Date', () => {
    expect(() => to(new Date('not a date'))).toThrow(/invalid Date/);
  });
});
