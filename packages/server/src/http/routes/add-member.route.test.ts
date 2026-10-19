import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  eventIcs,
  type CalendarWorld,
} from './caldav/calendar-route-test.util.js';

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:c1',
  'FN:Ann Example',
  'END:VCARD',
  '',
].join('\r\n');

describe('RFC 5995 add-member (POST to a collection)', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  it('stores a POSTed event under a server-chosen name and answers its Location', async () => {
    const ics = eventIcs('posted');

    const response = await world.request('POST', world.calendarUrl, {
      headers: { 'Content-Type': 'text/calendar' },
      body: ics,
    });

    expect(response.status).toBe(201);
    const location = response.headers.get('location') ?? '';
    expect(location).toMatch(new RegExp(`^${world.calendarUrl}/[^/]+\\.ics$`));
    expect(await (await world.request('GET', location)).text()).toBe(ics);
  });

  it('stores a POSTed contact in an addressbook', async () => {
    const book =
      world.home.replace('/calendars/', '/addressbooks/') + '/Contacts';
    const made = await world.request('MKCOL', book, {
      headers: { 'Content-Type': 'application/xml' },
      body: '<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype></D:prop></D:set></D:mkcol>',
    });
    expect(made.status).toBe(201);

    const response = await world.request('POST', book, {
      headers: { 'Content-Type': 'text/vcard' },
      body: VCARD,
    });

    expect(response.status).toBe(201);
    const location = response.headers.get('location') ?? '';
    expect(location).toMatch(/\.vcf$/);
    expect(await (await world.request('GET', location)).text()).toBe(VCARD);
  });

  it('applies the normal write rules: an invalid body is refused and nothing is stored', async () => {
    const response = await world.request('POST', world.calendarUrl, {
      headers: { 'Content-Type': 'text/calendar' },
      body: 'not a calendar',
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
  });

  it('each POST creates a new member', async () => {
    const post = (): Promise<Response> =>
      world.request('POST', world.calendarUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: eventIcs(`u-${Math.random()}`),
      });

    const first = (await post()).headers.get('location');
    const second = (await post()).headers.get('location');

    expect(first).not.toBe(second);
  });

  it('is gated by the same ACL as PUT', async () => {
    const response = await world.request('POST', world.calendarUrl, {
      username: 'bob',
      headers: { 'Content-Type': 'text/calendar' },
      body: eventIcs('x'),
    });

    expect([403, 404]).toContain(response.status);
  });

  it('exposes DAV:add-member on the collection and advertises the token', async () => {
    const found = await world.request('PROPFIND', world.calendarUrl, {
      headers: { Depth: '0', 'Content-Type': 'application/xml' },
      body: '<D:propfind xmlns:D="DAV:"><D:prop><D:add-member/></D:prop></D:propfind>',
    });
    const options = await world.request('OPTIONS', world.calendarUrl);

    expect(await found.text()).toContain(world.calendarUrl);
    expect(options.headers.get('dav')).toContain('add-member');
  });
});
