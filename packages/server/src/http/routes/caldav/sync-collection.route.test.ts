import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  eventIcs,
  type CalendarWorld,
} from './calendar-route-test.util.js';

function syncBody(syncToken = '', level = '1'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>${syncToken}</D:sync-token>
  <D:sync-level>${level}</D:sync-level>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`;
}

function hrefs(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((m) => m[1] ?? '');
}

function tokenOf(xml: string): string {
  const match = /<D:sync-token>([^<]*)<\/D:sync-token>/.exec(xml);
  if (!match?.[1]) {
    throw new Error('No sync-token in response');
  }
  return match[1];
}

describe('CalDAV sync-collection REPORT', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  function report(
    body: string,
    options: { username?: string; path?: string } = {},
  ): Promise<Response> {
    return world.request('REPORT', options.path ?? world.calendarUrl, {
      username: options.username,
      headers: { 'Content-Type': 'application/xml' },
      body,
    });
  }

  const href = (name: string) => `${world.calendarUrl}/${name}`;

  it('an initial sync returns every event with its ETag as 207 Multi-Status', async () => {
    await world.put(href('b.ics'), eventIcs('uid-b'));

    const response = await report(syncBody());

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(hrefs(body)).toEqual([href('b.ics'), world.eventUrl].sort());
    expect(body).toContain(`<D:getetag>${world.event.etag}</D:getetag>`);
    expect(tokenOf(body)).toMatch(/\S+/);
  });

  it('a token round trip reports new, changed and deleted events — and nothing once caught up', async () => {
    const first = await (await report(syncBody())).text();
    const token = tokenOf(first);

    await world.put(href('new.ics'), eventIcs('uid-n'));
    await world.put(world.eventUrl, eventIcs('uid-1', 'Changed'));
    const second = await (await report(syncBody(token))).text();
    expect(hrefs(second).sort()).toEqual(
      [href('new.ics'), world.eventUrl].sort(),
    );
    expect(second).toContain('HTTP/1.1 200 OK');

    await world.request('DELETE', href('new.ics'));
    const third = await (await report(syncBody(tokenOf(second)))).text();
    expect(hrefs(third)).toEqual([href('new.ics')]);
    expect(third).toContain('HTTP/1.1 404 Not Found');
    expect(third).not.toContain('<D:propstat>');

    const fourth = await (await report(syncBody(tokenOf(third)))).text();
    expect(hrefs(fourth)).toEqual([]);
    expect(tokenOf(fourth)).toBe(tokenOf(third));
  });

  it('percent-encodes an event name in the reported href', async () => {
    await world.put(
      `${world.calendarUrl}/${encodeURIComponent('Team & Friends #1.ics')}`,
      eventIcs('uid-t'),
    );

    const body = await (await report(syncBody())).text();

    expect(hrefs(body)).toContain(
      `${world.calendarUrl}/Team%20%26%20Friends%20%231.ics`,
    );
  });

  it('a user without read on the calendar gets 403, an explicit read grant lets them sync', async () => {
    expect((await report(syncBody(), { username: 'bob' })).status).toBe(403);

    await world.grantOnCalendar(world.bob, 'read');

    const response = await report(syncBody(), { username: 'bob' });
    expect(response.status).toBe(207);
    expect(hrefs(await response.text())).toEqual([world.eventUrl]);
  });

  it('read-free-busy alone is not enough', async () => {
    await world.grantOnCalendar(world.bob, 'read-free-busy');

    expect((await report(syncBody(), { username: 'bob' })).status).toBe(403);
  });

  it('a nonexistent calendar, the home and an event path are 404', async () => {
    for (const path of [`${world.home}/nope`, world.home, world.eventUrl]) {
      expect((await report(syncBody(), { path })).status).toBe(404);
    }
  });

  it('a sync-level other than 1 is 400', async () => {
    expect((await report(syncBody('', 'infinity'))).status).toBe(400);
  });

  it('a token that does not decode, or names another collection, is 403 valid-sync-token', async () => {
    const garbage = await report(syncBody('not-a-token'));
    expect(garbage.status).toBe(403);
    expect(await garbage.text()).toContain('valid-sync-token');

    await world.request('MKCALENDAR', `${world.home}/other`);
    const otherToken = tokenOf(
      await (await report(syncBody(), { path: `${world.home}/other` })).text(),
    );
    const foreign = await report(syncBody(otherToken));
    expect(foreign.status).toBe(403);
    expect(await foreign.text()).toContain('valid-sync-token');
  });

  it('tracks changes made through every write path of the routes', async () => {
    const token = tokenOf(await (await report(syncBody())).text());

    await world.put(href('a.ics'), eventIcs('uid-a'));
    await world.put(href('a.ics'), eventIcs('uid-a', 'v2'));
    await world.request('DELETE', href('a.ics'));

    const body = await (await report(syncBody(token))).text();
    // Added, modified and deleted between two syncs: reported once, as removed (RFC 6578 §3.5.2).
    expect(hrefs(body)).toEqual([href('a.ics')]);
    expect(body).toContain('HTTP/1.1 404 Not Found');
  });
});
