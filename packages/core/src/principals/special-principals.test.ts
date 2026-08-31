import { describe, expect, it } from 'vitest';
import type { Principal } from '../entities/principal.entity.js';
import {
  isSpecialPrincipal,
  SPECIAL_PRINCIPAL_KINDS,
  toSpecialPrincipalXmlElement,
} from './special-principals.js';

function makePrincipal(
  kind: 'user' | 'group' | 'special',
  specialKind: Principal['specialKind'] = null,
): Principal {
  return {
    id: 'a1b2c3',
    tenantId: 'tenant-1',
    kind,
    specialKind,
  } as Principal;
}

describe('special-principals', () => {
  it.each(SPECIAL_PRINCIPAL_KINDS)(
    'maps specialKind "%s" to its own XML element name',
    (specialKind) => {
      expect(toSpecialPrincipalXmlElement(specialKind)).toBe(specialKind);
    },
  );

  it('reports true for a special principal', () => {
    expect(isSpecialPrincipal(makePrincipal('special', 'all'))).toBe(true);
  });

  it('reports false for a regular user principal', () => {
    expect(isSpecialPrincipal(makePrincipal('user'))).toBe(false);
  });

  it('reports false for a regular group principal', () => {
    expect(isSpecialPrincipal(makePrincipal('group'))).toBe(false);
  });
});
