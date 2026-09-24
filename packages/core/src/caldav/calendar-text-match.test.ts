import { describe, expect, it } from 'vitest';
import { calendarTextMatches } from './calendar-text-match.js';
import type { CalendarTextMatch } from './calendar-query-request.js';

function match(
  value: string,
  overrides: Partial<CalendarTextMatch> = {},
): CalendarTextMatch {
  return { value, negate: false, collation: 'i;ascii-casemap', ...overrides };
}

describe('calendarTextMatches', () => {
  it('is a substring test, not equals/starts-with/ends-with', () => {
    expect(calendarTextMatches('Team Standup', match('Standup'))).toBe(true);
    expect(calendarTextMatches('Standup Team', match('Standup'))).toBe(true);
    expect(calendarTextMatches('Team Standup Notes', match('Standup'))).toBe(
      true,
    );
    expect(calendarTextMatches('Team Standup', match('team standup'))).toBe(
      true,
    );
  });

  it('i;ascii-casemap folds ASCII letters only', () => {
    expect(calendarTextMatches('STANDUP', match('standup'))).toBe(true);
    expect(calendarTextMatches('café', match('CAFÉ'))).toBe(false);
    expect(calendarTextMatches('café', match('café'))).toBe(true);
  });

  it('i;octet is exact and case-sensitive', () => {
    expect(
      calendarTextMatches(
        'Standup',
        match('standup', { collation: 'i;octet' }),
      ),
    ).toBe(false);
    expect(
      calendarTextMatches(
        'Standup',
        match('Standup', { collation: 'i;octet' }),
      ),
    ).toBe(true);
  });

  it('default behaves like i;ascii-casemap', () => {
    expect(
      calendarTextMatches(
        'STANDUP',
        match('standup', { collation: 'default' }),
      ),
    ).toBe(true);
  });

  it('negate-condition inverts the result', () => {
    expect(
      calendarTextMatches('Standup', match('Standup', { negate: true })),
    ).toBe(false);
    expect(
      calendarTextMatches('Standup', match('Meeting', { negate: true })),
    ).toBe(true);
  });

  it('returns false for a substring not present', () => {
    expect(calendarTextMatches('Standup', match('Retro'))).toBe(false);
  });
});
