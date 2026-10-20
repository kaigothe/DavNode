import { describe, expect, it } from 'vitest';
import { colorFor, initials } from './Avatar';

describe('initials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['ada lovelace byron', 'AB'],
    ['alice', 'AL'],
    ['x', 'X'],
    ['  Jürgen   Müller ', 'JM'],
    ['maria.schmidt', 'MS'],
    ['Éloïse', 'ÉL'],
    ['', '?'],
    ['()', '?'],
  ])('takes %j as %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('colorFor', () => {
  it('is stable for a name and differs between some names', () => {
    expect(colorFor('Ada Lovelace')).toBe(colorFor('Ada Lovelace'));
    const colors = new Set(
      ['Ada', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank'].map(colorFor),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
