import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  type CalendarWorld,
} from './calendar-route-test.util.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

function todo(uid: string, lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    'DTSTAMP:20260601T000000Z',
    ...lines,
    'END:VTODO',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

describe('tasks in a CalDAV calendar', () => {
  let world: CalendarWorld;
  let tasksUrl: string;

  beforeEach(async () => {
    world = await createCalendarWorld();
    tasksUrl = `${world.home}/tasks`;
    const created = await world.request('MKCALENDAR', tasksUrl, {
      headers: { 'Content-Type': 'application/xml' },
      body: `<C:mkcalendar xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:set><D:prop><C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>`,
    });
    expect(created.status).toBe(201);
  });

  afterEach(async () => {
    await world.close();
  });

  function query(path: string, filter: string): Promise<Response> {
    return world.request('REPORT', path, {
      headers: { 'Content-Type': 'application/xml' },
      body: `<C:calendar-query xmlns:D="DAV:" xmlns:C="${CALDAV}"><D:prop><D:getetag/></D:prop><C:filter><C:comp-filter name="VCALENDAR">${filter}</C:comp-filter></C:filter></C:calendar-query>`,
    });
  }

  it('stores a VTODO and serves it back unchanged', async () => {
    const ics = todo('t1', ['SUMMARY:Buy milk', 'DUE:20260701T120000Z']);

    const put = await world.put(`${tasksUrl}/t1.ics`, ics);
    const get = await world.request('GET', `${tasksUrl}/t1.ics`);

    expect(put.status).toBe(201);
    expect(await get.text()).toBe(ics);
  });

  it('refuses a VTODO in a calendar that only holds events', async () => {
    const response = await world.put(
      `${world.calendarUrl}/t1.ics`,
      todo('t1', ['SUMMARY:x']),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('supported-calendar-component');
  });

  it('calendar-query selects tasks by component and by DUE range', async () => {
    await world.put(
      `${tasksUrl}/due.ics`,
      todo('due', ['SUMMARY:Due soon', 'DUE:20260701T120000Z']),
    );
    await world.put(
      `${tasksUrl}/later.ics`,
      todo('later', ['SUMMARY:Later', 'DUE:20260901T120000Z']),
    );
    await world.put(`${tasksUrl}/open.ics`, todo('open', ['SUMMARY:Open']));

    const all = await (
      await query(tasksUrl, '<C:comp-filter name="VTODO"/>')
    ).text();
    const ranged = await (
      await query(
        tasksUrl,
        '<C:comp-filter name="VTODO"><C:time-range start="20260630T000000Z" end="20260702T000000Z"/></C:comp-filter>',
      )
    ).text();
    const events = await (
      await query(tasksUrl, '<C:comp-filter name="VEVENT"/>')
    ).text();
    const named = await (
      await query(
        tasksUrl,
        '<C:comp-filter name="VTODO"><C:prop-filter name="SUMMARY"><C:text-match>milk</C:text-match></C:prop-filter></C:comp-filter>',
      )
    ).text();

    expect(all).toContain('due.ics');
    expect(all).toContain('later.ics');
    expect(all).toContain('open.ics');
    expect(ranged).toContain('due.ics');
    expect(ranged).not.toContain('later.ics');
    expect(events).not.toContain('.ics');
    expect(named).not.toContain('.ics');
  });
});
