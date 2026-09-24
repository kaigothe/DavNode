import { describe, expect, it } from 'vitest';
import type { Tenant } from '../entities/tenant.entity.js';
import {
  toCalendarHomeUrl,
  toCalendarObjectUrl,
  toCalendarUrl,
} from './calendar-home-url.js';

describe('toCalendarHomeUrl', () => {
  it('builds the home URL from the tenant slug and user principal id, with no trailing slash', () => {
    const tenant = { slug: 'acme' } as Tenant;

    expect(toCalendarHomeUrl('user-1', tenant)).toBe(
      '/dav/acme/calendars/user-1',
    );
  });
});

describe('toCalendarUrl and toCalendarObjectUrl', () => {
  const tenant = { slug: 'acme' } as Tenant;
  const calendar = { ownerPrincipalId: 'user-1', name: 'work' };

  it('append the calendar name and the object name to the home URL', () => {
    expect(toCalendarUrl(calendar, tenant)).toBe(
      '/dav/acme/calendars/user-1/work',
    );
    expect(toCalendarObjectUrl(calendar, 'event.ics', tenant)).toBe(
      '/dav/acme/calendars/user-1/work/event.ics',
    );
  });

  it('percent-encode each name as a single path segment', () => {
    expect(
      toCalendarObjectUrl(
        { ownerPrincipalId: 'user-1', name: 'Soccer & Friends' },
        'a/b #1.ics',
        tenant,
      ),
    ).toBe(
      '/dav/acme/calendars/user-1/Soccer%20%26%20Friends/a%2Fb%20%231.ics',
    );
  });
});
