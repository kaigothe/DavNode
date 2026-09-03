import { describe, expect, it } from 'vitest';
import type { Tenant } from '../entities/tenant.entity.js';
import { toAddressbookHomeUrl } from './addressbook-home-url.js';

describe('toAddressbookHomeUrl', () => {
  it('builds the home URL from the tenant slug and user principal id, with no trailing slash', () => {
    const tenant = { slug: 'acme' } as Tenant;

    expect(toAddressbookHomeUrl('user-1', tenant)).toBe(
      '/dav/acme/addressbooks/user-1',
    );
  });
});
