import { describe, expect, it } from 'vitest';
import type { Tenant } from '../entities/tenant.entity.js';
import { toCalendarHomeUrl } from './calendar-home-url.js';

describe('toCalendarHomeUrl', () => {
  it('builds the home URL from the tenant slug and user principal id, with no trailing slash', () => {
    const tenant = { slug: 'acme' } as Tenant;

    expect(toCalendarHomeUrl('user-1', tenant)).toBe(
      '/dav/acme/calendars/user-1',
    );
  });
});
