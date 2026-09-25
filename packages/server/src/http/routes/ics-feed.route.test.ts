import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  type CalendarWorld,
} from './caldav/calendar-route-test.util.js';

describe('ICS feed route', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  async function generateToken(): Promise<string> {
    const response = await world.request(
      'POST',
      `${world.calendarUrl}/feed-token`,
    );
    const body = (await response.json()) as { token: string };
    return body.token;
  }

  function feedUrl(token: string): string {
    return `${world.baseUrl}${world.calendarUrl}/feed/${token}.ics`;
  }

  it('answers 404 for a calendar whose feed was never generated', async () => {
    const response = await fetch(feedUrl('never-generated'));

    expect(response.status).toBe(404);
  });

  it('serves the aggregated calendar with no Authorization header at all', async () => {
    const token = await generateToken();

    const response = await fetch(feedUrl(token));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    const body = await response.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain(world.eventIcs.trim().split('\r\n')[3]); // the UID line
  });

  it('answers 404 once the token has been regenerated (the old one revoked)', async () => {
    const oldToken = await generateToken();
    await generateToken();

    const response = await fetch(feedUrl(oldToken));

    expect(response.status).toBe(404);
  });

  it('answers 304 for a second request with If-None-Match, when nothing changed', async () => {
    const token = await generateToken();
    const first = await fetch(feedUrl(token));
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await fetch(feedUrl(token), {
      headers: { 'If-None-Match': etag ?? '' },
    });

    expect(second.status).toBe(304);
  });

  it("answers 304 for If-Modified-Since at or after the feed's Last-Modified", async () => {
    const token = await generateToken();
    const first = await fetch(feedUrl(token));
    const lastModified = first.headers.get('last-modified');
    expect(lastModified).toBeTruthy();

    const response = await fetch(feedUrl(token), {
      headers: { 'If-Modified-Since': lastModified ?? '' },
    });

    expect(response.status).toBe(304);
  });

  it('answers 200 with fresh content after a new event is added (cache invalidation)', async () => {
    const token = await generateToken();
    const first = await fetch(feedUrl(token));
    const etag = first.headers.get('etag');

    const newEvent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//EN',
      'BEGIN:VEVENT',
      'UID:new-event',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20261001T090000Z',
      'SUMMARY:New',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const put = await world.put(`${world.calendarUrl}/new.ics`, newEvent);
    expect(put.status).toBe(201);

    const second = await fetch(feedUrl(token), {
      headers: { 'If-None-Match': etag ?? '' },
    });

    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).not.toBe(etag);
    const body = await second.text();
    expect(body).toContain('UID:new-event');
    expect(body).toContain('UID:uid-1'); // the original event is still there
  });
});
