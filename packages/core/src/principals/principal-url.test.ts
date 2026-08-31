import { describe, expect, it } from 'vitest';
import type { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { parsePrincipalUrl, toPrincipalUrl } from './principal-url.js';

const tenant = { id: 'tenant-1', slug: 'acme' } as Tenant;

function makePrincipal(kind: 'user' | 'group' | 'special'): Principal {
  return {
    id: 'a1b2c3',
    tenantId: tenant.id,
    kind,
    specialKind: kind === 'special' ? 'all' : null,
  } as Principal;
}

describe('toPrincipalUrl / parsePrincipalUrl', () => {
  it('round-trips a user principal', () => {
    const principal = makePrincipal('user');
    const url = toPrincipalUrl(principal, tenant);

    expect(url).toBe('/dav/acme/principals/users/a1b2c3');
    expect(parsePrincipalUrl(url)).toEqual({
      tenantSlug: tenant.slug,
      kind: 'user',
      id: principal.id,
    });
  });

  it('round-trips a group principal', () => {
    const principal = makePrincipal('group');
    const url = toPrincipalUrl(principal, tenant);

    expect(url).toBe('/dav/acme/principals/groups/a1b2c3');
    expect(parsePrincipalUrl(url)).toEqual({
      tenantSlug: tenant.slug,
      kind: 'group',
      id: principal.id,
    });
  });

  it('throws for a special principal', () => {
    expect(() => toPrincipalUrl(makePrincipal('special'), tenant)).toThrow();
  });

  it.each([
    ['wrong prefix', '/webdav/acme/principals/users/a1b2c3'],
    ['missing id segment', '/dav/acme/principals/users'],
    ['missing id segment with trailing slash', '/dav/acme/principals/users/'],
    ['unknown kind segment', '/dav/acme/principals/robots/a1b2c3'],
    ['missing principals segment', '/dav/acme/users/a1b2c3'],
    ['empty string', ''],
    ['trailing slash', '/dav/acme/principals/users/a1b2c3/'],
    ['uppercase tenant slug', '/dav/ACME/principals/users/a1b2c3'],
  ])('returns null for an invalid URL (%s)', (_label, url) => {
    expect(parsePrincipalUrl(url)).toBeNull();
  });
});
