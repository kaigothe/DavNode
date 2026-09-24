import { describe, expect, it } from 'vitest';
import type { CalendarObject } from '../entities/calendar-object.entity.js';
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { CalendarObjectLiveProperties } from './calendar-object-live-properties.js';

describe('CalendarObjectLiveProperties', () => {
  const provider = new CalendarObjectLiveProperties();
  const context = {} as PropertyProviderContext;
  const object = {
    name: 'a & b.ics',
    etag: 'abc123',
    createdAt: new Date('2026-09-24T10:00:00Z'),
    updatedAt: new Date('2026-09-25T11:30:00Z'),
  } as CalendarObject;

  it('reports the strong ETag, iCalendar content type, name and dates of an object', async () => {
    const properties = await provider.listLiveProperties(object, context);
    const value = (name: string) =>
      properties.find((p) => p.name === name)?.value;

    expect(value('getetag')).toBe('abc123');
    expect(value('getcontenttype')).toBe('text/calendar; charset=utf-8');
    expect(value('displayname')).toBe('a &amp; b.ics');
    expect(value('resourcetype')).toBe('');
    expect(value('creationdate')).toBe('2026-09-24T10:00:00.000Z');
    expect(value('getlastmodified')).toBe('Fri, 25 Sep 2026 11:30:00 GMT');
    expect(properties.every((p) => p.namespace === 'DAV:')).toBe(true);
  });

  it('recognizes only its own DAV: property names as live', () => {
    for (const name of [
      'creationdate',
      'displayname',
      'getcontenttype',
      'getetag',
      'getlastmodified',
      'resourcetype',
    ]) {
      expect(provider.isLiveProperty('DAV:', name)).toBe(true);
    }
    expect(provider.isLiveProperty('DAV:', 'getcontentlength')).toBe(false);
    expect(
      provider.isLiveProperty('urn:ietf:params:xml:ns:caldav', 'calendar-data'),
    ).toBe(false);
  });
});
