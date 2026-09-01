import { describe, expect, it } from 'vitest';
import { expandPrivilege, privilegeSatisfies } from './privilege-aggregation.js';
import { ALL_PRIVILEGES, type Privilege } from './privilege.js';

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
    expect(privilegeSatisfies('write-content', 'write-properties')).toBe(
      false,
    );
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
