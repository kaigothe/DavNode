import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  type CalendarWorld,
} from './calendar-route-test.util.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

/** [href, status] for each <D:response> of a multistatus body — the response-level status (a bare `<D:status>`, e.g. 404), not a `<D:propstat>`'s own. */
function outcomes(xml: string): Array<[string, string]> {
  return [...xml.matchAll(/<D:response>(.*?)<\/D:response>/gs)].map(
    ([, inner]) => [
      /<D:href>([^<]*)<\/D:href>/.exec(inner ?? '')?.[1] ?? '',
      inner?.includes('<D:propstat>')
        ? ''
        : (/<D:status>([^<]*)<\/D:status>/.exec(inner ?? '')?.[1] ?? ''),
    ],
  );
}

describe('CalDAV REPORT routes', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  function report(
    path: string,
    body: string,
    username?: string,
  ): Promise<Response> {
    return world.request('REPORT', path, {
      username,
      headers: { 'Content-Type': 'application/xml' },
      body,
    });
  }

  describe('calendar-multiget', () => {
    it('returns calendar-data for a known event and 404 for an unknown one, over real HTTP', async () => {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <D:href>${world.eventUrl}</D:href>
  <D:href>${world.calendarUrl}/nope.ics</D:href>
</C:calendar-multiget>`;

      const response = await report(world.calendarUrl, body);

      expect(response.status).toBe(207);
      expect(response.headers.get('content-type')).toContain('application/xml');
      const xml = await response.text();
      const resolved = outcomes(xml).find(([href]) => href === world.eventUrl);
      expect(resolved?.[1]).toBeFalsy(); // 200 responses use propstat, no response-level status
      expect(xml).toContain(world.eventIcs.trim().split('\r\n')[3]); // the UID line, round-tripped
      const missing = outcomes(xml).find(([href]) => href.endsWith('nope.ics'));
      expect(missing?.[1]).toContain('404');
    });

    it('is gated by calendar ACL', async () => {
      const body = `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop/><D:href>${world.eventUrl}</D:href></C:calendar-multiget>`;

      const stranger = await report(world.calendarUrl, body, 'bob');

      expect(stranger.status).toBe(403);
    });
  });

  describe('calendar-query', () => {
    it('finds an event by time-range, over real HTTP', async () => {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}">
  <D:prop><D:getetag/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
    <C:time-range start="20260924T000000Z" end="20260925T000000Z"/>
  </C:comp-filter></C:comp-filter></C:filter>
</C:calendar-query>`;

      const response = await report(world.calendarUrl, body);

      expect(response.status).toBe(207);
      expect(
        outcomes(await response.text()).some(
          ([href]) => href === world.eventUrl,
        ),
      ).toBe(true);
    });

    it('answers 403 supported-filter for an unsupported prop-filter, over real HTTP', async () => {
      const body = `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop/><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:prop-filter name="LOCATION"><C:text-match>Room</C:text-match></C:prop-filter></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`;

      const response = await report(world.calendarUrl, body);

      expect(response.status).toBe(403);
      expect(await response.text()).toContain('supported-filter');
    });

    it('is gated by calendar ACL', async () => {
      const body = `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop/><C:filter><C:comp-filter name="VCALENDAR"/></C:filter></C:calendar-query>`;

      const stranger = await report(world.calendarUrl, body, 'bob');

      expect(stranger.status).toBe(403);
    });
  });

  describe('free-busy-query', () => {
    it('answers text/calendar with a VFREEBUSY, over real HTTP', async () => {
      const body = `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20260924T000000Z" end="20260925T000000Z"/></C:free-busy-query>`;

      const response = await report(world.calendarUrl, body);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/calendar');
      const body2 = await response.text();
      expect(body2).toContain('BEGIN:VFREEBUSY');
      expect(body2).toContain('FREEBUSY:20260924T100000Z/');
      expect(body2).not.toContain('<D:multistatus');
    });

    it('a stranger without any grant gets 404, not 403', async () => {
      const body = `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20260924T000000Z" end="20260925T000000Z"/></C:free-busy-query>`;

      const response = await report(world.calendarUrl, body, 'bob');

      expect(response.status).toBe(404);
    });

    it('a stranger granted only read-free-busy gets the answer', async () => {
      await world.grantOnCalendar(world.bob, 'read-free-busy');
      const body = `<C:free-busy-query xmlns:C="${CALDAV}"><C:time-range start="20260924T000000Z" end="20260925T000000Z"/></C:free-busy-query>`;

      const response = await report(world.calendarUrl, body, 'bob');

      expect(response.status).toBe(200);
    });
  });

  it('multiget round-trips an expanded recurring series created through the real PUT route', async () => {
    const series = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260105T090000Z',
      'DTEND:20260105T100000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const put = await world.put(`${world.calendarUrl}/series.ics`, series);
    expect(put.status).toBe(201);

    const body = `<C:calendar-multiget xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop><C:calendar-data><C:expand start="20260101T000000Z" end="20260201T000000Z"/></C:calendar-data></D:prop><D:href>${world.calendarUrl}/series.ics</D:href></C:calendar-multiget>`;

    const response = await report(world.calendarUrl, body);

    expect(response.status).toBe(207);
    const xml = await response.text();
    expect((xml.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4);
    expect(xml).not.toContain('RRULE');
  });
});
