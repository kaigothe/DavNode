import { describe, expect, it } from 'vitest';
import { ALL_PRIVILEGES, CALENDAR_PRIVILEGES } from './privilege.js';

describe('CALENDAR_PRIVILEGES', () => {
  it('is the shared catalog plus read-free-busy, in that order', () => {
    expect(CALENDAR_PRIVILEGES).toEqual([...ALL_PRIVILEGES, 'read-free-busy']);
  });

  it('leaves the shared catalog — and with it the other domains — without read-free-busy', () => {
    expect(ALL_PRIVILEGES).not.toContain('read-free-busy');
    expect(ALL_PRIVILEGES).toHaveLength(11);
  });

  it('has no duplicates', () => {
    expect(new Set(CALENDAR_PRIVILEGES).size).toBe(CALENDAR_PRIVILEGES.length);
  });
});
