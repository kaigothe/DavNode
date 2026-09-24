import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalendarObject } from '@davnode/core';
import {
  createCalendarWorld,
  eventIcs,
  lockInfoBody,
  type CalendarWorld,
} from './calendar-route-test.util.js';

describe('lock enforcement on calendar object PUT and DELETE', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  async function lock(path: string, depth?: string): Promise<string> {
    const response = await world.request('LOCK', path, {
      headers: {
        'Content-Type': 'application/xml',
        ...(depth === undefined ? {} : { Depth: depth }),
      },
      body: lockInfoBody(),
    });
    expect(response.status).toBe(200);
    return response.headers.get('Lock-Token')!.slice(1, -1);
  }

  const changed = eventIcs('uid-1', 'Changed');
  const objects = () => world.dataSource.getRepository(CalendarObject);

  it('a locked event cannot be overwritten without the token: 423 lock-token-submitted', async () => {
    await lock(world.eventUrl);

    const response = await world.put(world.eventUrl, changed);

    expect(response.status).toBe(423);
    expect(await response.text()).toContain('lock-token-submitted');
    expect((await objects().findOneByOrFail({ name: 'event.ics' })).etag).toBe(
      world.event.etag,
    );
  });

  it('the lock token in the If header lets the overwrite through', async () => {
    const token = await lock(world.eventUrl);

    const response = await world.put(world.eventUrl, changed, undefined, {
      If: `(<${token}>)`,
    });

    expect(response.status).toBe(204);
  });

  it('another token does not', async () => {
    await lock(world.eventUrl);

    const response = await world.put(world.eventUrl, changed, undefined, {
      If: '(<urn:uuid:00000000-0000-0000-0000-000000000000>)',
    });

    expect(response.status).toBe(423);
  });

  it('a locked event cannot be deleted without the token, and can with it', async () => {
    const token = await lock(world.eventUrl);

    expect((await world.request('DELETE', world.eventUrl)).status).toBe(423);
    expect(await objects().count()).toBe(1);
    const deleted = await world.request('DELETE', world.eventUrl, {
      headers: { If: `(<${token}>)` },
    });
    expect(deleted.status).toBe(204);
    expect(await objects().count()).toBe(0);
  });

  it('a Depth: infinity lock on the calendar covers overwrite and delete of its events, and creating new ones', async () => {
    const token = await lock(world.calendarUrl, 'infinity');

    expect((await world.put(world.eventUrl, changed)).status).toBe(423);
    expect((await world.request('DELETE', world.eventUrl)).status).toBe(423);
    expect(
      (await world.put(`${world.calendarUrl}/new.ics`, eventIcs('uid-2')))
        .status,
    ).toBe(423);
    const created = await world.put(
      `${world.calendarUrl}/new.ics`,
      eventIcs('uid-2'),
      undefined,
      { If: `(<${token}>)` },
    );
    expect(created.status).toBe(201);
  });

  it('a Depth: 0 lock on the calendar guards creation of new events but not existing ones', async () => {
    await lock(world.calendarUrl, '0');

    expect((await world.put(world.eventUrl, changed)).status).toBe(204);
    expect(
      (await world.put(`${world.calendarUrl}/new.ics`, eventIcs('uid-2')))
        .status,
    ).toBe(423);
  });

  it('deleting an unlocked event in a Depth: 0-locked calendar is guarded by the calendar lock', async () => {
    await lock(world.calendarUrl, '0');

    expect((await world.request('DELETE', world.eventUrl)).status).toBe(423);
  });

  it('a lock on another event does not get in the way', async () => {
    await world.put(`${world.calendarUrl}/other.ics`, eventIcs('uid-2'));
    await lock(`${world.calendarUrl}/other.ics`);

    expect((await world.put(world.eventUrl, changed)).status).toBe(204);
  });

  it('a missing privilege is 403, not 423, even on a locked event', async () => {
    await lock(world.eventUrl);

    expect((await world.put(world.eventUrl, changed, 'bob')).status).toBe(403);
    expect(
      (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
        .status,
    ).toBe(403);
  });

  it('an expired lock no longer blocks', async () => {
    await lock(world.eventUrl);
    await world.dataSource.query(
      "UPDATE calendar_object_locks SET expires_at = '2000-01-01 00:00:00'",
    );

    expect((await world.put(world.eventUrl, changed)).status).toBe(204);
  });

  it('UNLOCK frees the event again', async () => {
    const token = await lock(world.eventUrl);
    await world.request('UNLOCK', world.eventUrl, {
      headers: { 'Lock-Token': `<${token}>` },
    });

    expect((await world.put(world.eventUrl, changed)).status).toBe(204);
  });
});
