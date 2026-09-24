import { describe, expect, it } from 'vitest';
import { componentSetColumnTransformer } from './component-set-column.transformer.js';

describe('componentSetColumnTransformer', () => {
  const to = componentSetColumnTransformer.to as (
    value: readonly string[] | null | undefined,
  ) => string | null | undefined;
  const from = componentSetColumnTransformer.from as (
    value: string | readonly string[] | null,
  ) => string[] | null;

  it('joins a set into one comma-separated string and splits it back', () => {
    expect(to(['VEVENT', 'VTODO'])).toBe('VEVENT,VTODO');
    expect(from('VEVENT,VTODO')).toEqual(['VEVENT', 'VTODO']);
    expect(from(to(['VEVENT']) as string)).toEqual(['VEVENT']);
  });

  it('maps the empty set to the empty string and back', () => {
    expect(to([])).toBe('');
    expect(from('')).toEqual([]);
  });

  it('tolerates a value that is already an array — TypeORM re-runs `from` over freshly inserted entity values', () => {
    expect(from(['VEVENT', 'VTODO'])).toEqual(['VEVENT', 'VTODO']);
    expect(from([])).toEqual([]);
  });

  it('passes null and undefined through', () => {
    expect(to(null)).toBeNull();
    expect(to(undefined)).toBeUndefined();
    expect(from(null)).toBeNull();
  });
});
