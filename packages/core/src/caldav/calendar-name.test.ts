import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  isValidCalendarName,
  MAX_CALENDAR_NAME_LENGTH,
  RESERVED_CALENDAR_NAMES,
} from './calendar-name.js';

describe('isValidCalendarName', () => {
  it.each([
    'work',
    '5f1c7e2a-9b1d-4c53-8a0f-0c6f2d8e9b11',
    'Soccer Team & Friends',
    'Fußball',
    'a.b',
    '.hidden',
    'inbox2',
  ])('accepts %s', (name) => {
    expect(isValidCalendarName(name)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['dot', '.'],
    ['double dot', '..'],
    ['NUL', 'a\u0000b'],
    ['tab', 'a\tb'],
    ['newline', 'a\nb'],
    ['DEL', 'a\u007Fb'],
  ])('rejects %s', (_label, name) => {
    expect(isValidCalendarName(name)).toBe(false);
  });

  it('rejects the names reserved for the scheduling collections, in any case', () => {
    expect(RESERVED_CALENDAR_NAMES).toEqual(['inbox', 'outbox']);
    for (const name of ['inbox', 'outbox', 'Inbox', 'OUTBOX']) {
      expect(isValidCalendarName(name)).toBe(false);
    }
  });

  it('counts Unicode code points, not UTF-16 units, against the length limit', () => {
    const limit = MAX_CALENDAR_NAME_LENGTH;
    expect(isValidCalendarName('a'.repeat(limit))).toBe(true);
    expect(isValidCalendarName('a'.repeat(limit + 1))).toBe(false);
    // Each emoji is two UTF-16 units but one code point (and one MySQL character).
    expect(isValidCalendarName('😀'.repeat(limit))).toBe(true);
    expect(isValidCalendarName('😀'.repeat(limit + 1))).toBe(false);
  });
});

describe('codePointLength', () => {
  it('counts code points', () => {
    expect(codePointLength('')).toBe(0);
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('a😀b')).toBe(3);
  });
});
