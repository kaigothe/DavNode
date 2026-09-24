import { describe, expect, it } from 'vitest';
import {
  calendarPrivilegeSatisfies,
  expandCalendarPrivilege,
  expandPrivilege,
  privilegeSatisfies,
} from './privilege-aggregation.js';
import {
  ALL_PRIVILEGES,
  CALENDAR_PRIVILEGES,
  type Privilege,
} from './privilege.js';

const ELEMENTARY_PRIVILEGES: readonly Privilege[] = [
  'read',
  'write-properties',
  'write-content',
  'bind',
  'unbind',
  'unlock',
  'read-acl',
  'write-acl',
  'read-current-user-privilege-set',
];

describe('expandPrivilege', () => {
  it("'all' expands to all eleven values with no duplicates", () => {
    const expanded = expandPrivilege('all');
    expect(expanded).toHaveLength(11);
    expect(new Set(expanded)).toEqual(new Set(ALL_PRIVILEGES));
  });

  it("'write' expands to exactly write-properties and write-content", () => {
    expect(expandPrivilege('write')).toEqual([
      'write-properties',
      'write-content',
    ]);
  });

  it.each(ELEMENTARY_PRIVILEGES)(
    'elementary privilege %s expands to only itself',
    (privilege) => {
      expect(expandPrivilege(privilege)).toEqual([privilege]);
    },
  );
});

describe('privilegeSatisfies', () => {
  it("'all' satisfies every privilege", () => {
    for (const requested of ALL_PRIVILEGES) {
      expect(privilegeSatisfies('all', requested)).toBe(true);
    }
  });

  it("'write' satisfies 'write-content' and 'write-properties'", () => {
    expect(privilegeSatisfies('write', 'write-content')).toBe(true);
    expect(privilegeSatisfies('write', 'write-properties')).toBe(true);
  });

  it("'write-content' does not satisfy 'write-properties'", () => {
    expect(privilegeSatisfies('write-content', 'write-properties')).toBe(false);
  });

  it.each(ELEMENTARY_PRIVILEGES)(
    'elementary privilege %s satisfies only itself',
    (privilege) => {
      expect(privilegeSatisfies(privilege, privilege)).toBe(true);
      for (const other of ELEMENTARY_PRIVILEGES) {
        if (other !== privilege) {
          expect(privilegeSatisfies(privilege, other)).toBe(false);
        }
      }
    },
  );
});

describe('expandCalendarPrivilege', () => {
  it("'all' expands to the whole calendar vocabulary, read-free-busy included", () => {
    const expanded = expandCalendarPrivilege('all');

    expect(expanded).toHaveLength(12);
    expect(new Set(expanded)).toEqual(new Set(CALENDAR_PRIVILEGES));
  });

  it("'read' aggregates read-free-busy (RFC 4791 §6.1.1)", () => {
    expect(expandCalendarPrivilege('read')).toEqual(['read', 'read-free-busy']);
  });

  it("'read-free-busy' expands to only itself, so it can be granted without read", () => {
    expect(expandCalendarPrivilege('read-free-busy')).toEqual([
      'read-free-busy',
    ]);
  });

  it("'write' and the elementary privileges expand as in the shared catalog", () => {
    expect(expandCalendarPrivilege('write')).toEqual(expandPrivilege('write'));
    for (const privilege of ELEMENTARY_PRIVILEGES.filter((p) => p !== 'read')) {
      expect(expandCalendarPrivilege(privilege)).toEqual([privilege]);
    }
  });
});

describe('calendarPrivilegeSatisfies', () => {
  it('lets read and all cover read-free-busy', () => {
    expect(calendarPrivilegeSatisfies('read', 'read-free-busy')).toBe(true);
    expect(calendarPrivilegeSatisfies('all', 'read-free-busy')).toBe(true);
    expect(calendarPrivilegeSatisfies('read-free-busy', 'read-free-busy')).toBe(
      true,
    );
  });

  it('does not let read-free-busy cover read or anything else', () => {
    for (const requested of ALL_PRIVILEGES) {
      expect(calendarPrivilegeSatisfies('read-free-busy', requested)).toBe(
        false,
      );
    }
  });

  it('does not let write or the other privileges cover read-free-busy', () => {
    for (const granted of ALL_PRIVILEGES.filter(
      (p) => p !== 'read' && p !== 'all',
    )) {
      expect(calendarPrivilegeSatisfies(granted, 'read-free-busy')).toBe(false);
    }
  });

  it('agrees with privilegeSatisfies on the shared catalog', () => {
    for (const granted of ALL_PRIVILEGES) {
      for (const requested of ALL_PRIVILEGES) {
        expect(calendarPrivilegeSatisfies(granted, requested)).toBe(
          privilegeSatisfies(granted, requested),
        );
      }
    }
  });
});
