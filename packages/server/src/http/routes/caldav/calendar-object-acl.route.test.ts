import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
} from '@davnode/core';
import {
  createCalendarWorld,
  eventIcs,
  type CalendarWorld,
} from './calendar-route-test.util.js';

describe('calendar object routes: real ACL', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  const objects = () => world.dataSource.getRepository(CalendarObject);
  const ics = (uid: string) => eventIcs(uid);

  describe('a user without any ACE on the calendar', () => {
    it('gets 403 for GET, PUT (overwrite and create) and DELETE — and nothing changes', async () => {
      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(403);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);

      expect(await objects().count()).toBe(1);
      const stored = await objects().findOneByOrFail({ name: 'event.ics' });
      expect(stored.etag).toBe(world.event.etag);
    });

    it('gets 403, not 404, for an object that does not exist in an existing calendar', async () => {
      const missing = `${world.calendarUrl}/nope.ics`;

      expect(
        (await world.request('GET', missing, { username: 'bob' })).status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', missing, { username: 'bob' })).status,
      ).toBe(403);
      expect((await world.request('GET', missing)).status).toBe(404);
    });

    it("gets 403 for a calendar that does not exist under someone else's home, 404/409 under their own", async () => {
      const foreignMissing = `${world.home}/nope/x.ics`;

      expect(
        (await world.request('GET', foreignMissing, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', foreignMissing, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (await world.put(foreignMissing, ics('uid-9'), 'bob')).status,
      ).toBe(403);

      const ownHome = `/dav/acme/calendars/${world.bob.principalId}/nope/x.ics`;
      expect(
        (await world.request('GET', ownHome, { username: 'bob' })).status,
      ).toBe(404);
      expect(
        (await world.request('DELETE', ownHome, { username: 'bob' })).status,
      ).toBe(404);
      expect((await world.put(ownHome, ics('uid-9'), 'bob')).status).toBe(409);
    });

    it('cannot tell an existing calendar from a missing one by the answer', async () => {
      const existing = await world.request(
        'GET',
        `${world.home}/work/nope.ics`,
        { username: 'bob' },
      );
      const missing = await world.request(
        'GET',
        `${world.home}/other/nope.ics`,
        { username: 'bob' },
      );

      expect(existing.status).toBe(missing.status);
    });
  });

  describe('explicit grants on the calendar', () => {
    it('read lets a user GET but not write or delete', async () => {
      await world.grantOnCalendar(world.bob, 'read');

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(200);
      expect(
        (
          await world.request('GET', `${world.calendarUrl}/nope.ics`, {
            username: 'bob',
          })
        ).status,
      ).toBe(404);
      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(403);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
    });

    it('bind lets a user create objects but not overwrite or read existing ones', async () => {
      await world.grantOnCalendar(world.bob, 'bind');

      const created = await world.put(
        `${world.calendarUrl}/new.ics`,
        ics('uid-2'),
        'bob',
      );
      expect(created.status).toBe(201);
      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(403);
      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
    });

    it("gives the creator of an object in someone else's calendar the default ACE on it, and the calendar owner keeps access", async () => {
      await world.grantOnCalendar(world.bob, 'bind');
      await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob');

      const created = await objects().findOneByOrFail({ name: 'new.ics' });
      expect(created.ownerPrincipalId).toBe(world.bob.principalId);
      // Bob holds `all` on his own object, so he can read and overwrite it...
      expect(
        (
          await world.request('GET', `${world.calendarUrl}/new.ics`, {
            username: 'bob',
          })
        ).status,
      ).toBe(200);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(204);
      // ...and the calendar's owner still reaches it through the calendar's ACEs.
      expect(
        (await world.request('GET', `${world.calendarUrl}/new.ics`)).status,
      ).toBe(200);
      expect(
        (
          await world.dataSource
            .getRepository(CalendarObjectAce)
            .findBy({ calendarObjectId: created.id })
        ).map((ace) => ace.principalId),
      ).toEqual([world.bob.principalId]);
    });

    it('write-content lets a user overwrite existing objects but not create new ones', async () => {
      await world.grantOnCalendar(world.bob, 'write-content');

      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(204);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(403);
    });

    it('write aggregates write-content', async () => {
      await world.grantOnCalendar(world.bob, 'write');

      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(204);
    });

    it('unbind lets a user delete objects, and nothing else', async () => {
      await world.grantOnCalendar(world.bob, 'unbind');

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(204);
      expect(await objects().count()).toBe(0);
    });

    it('all grants everything', async () => {
      await world.grantOnCalendar(world.bob, 'all');

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(200);
      expect(
        (await world.put(world.eventUrl, ics('uid-1'), 'bob')).status,
      ).toBe(204);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(201);
      expect(
        (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(204);
    });

    it('read-free-busy alone lets a user do none of it', async () => {
      await world.grantOnCalendar(world.bob, 'read-free-busy');

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (await world.put(`${world.calendarUrl}/new.ics`, ics('uid-2'), 'bob'))
          .status,
      ).toBe(403);
      expect(
        (await world.request('DELETE', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
    });

    it('a deny ACE ahead of a grant wins', async () => {
      await world.grantOnCalendar(world.bob, 'read', 'deny', 5);
      await world.grantOnCalendar(world.bob, 'all', 'grant', 6);

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
    });
  });

  describe('ACEs on a single object', () => {
    it("an object's own deny overrides the calendar's grant for that object only", async () => {
      await world.grantOnCalendar(world.bob, 'read');
      const other = await world.put(
        `${world.calendarUrl}/other.ics`,
        ics('uid-2'),
      );
      expect(other.status).toBe(201);
      await world.dataSource.getRepository(CalendarObjectAce).save(
        world.dataSource.getRepository(CalendarObjectAce).create({
          calendarObjectId: world.event.id,
          principalId: world.bob.principalId,
          privilege: 'read',
          grantDeny: 'deny',
          position: 0,
        }),
      );

      expect(
        (await world.request('GET', world.eventUrl, { username: 'bob' }))
          .status,
      ).toBe(403);
      expect(
        (
          await world.request('GET', `${world.calendarUrl}/other.ics`, {
            username: 'bob',
          })
        ).status,
      ).toBe(200);
    });
  });

  it('the owner keeps working access to a calendar created the way MKCALENDAR does (no lockout)', async () => {
    const created = await world.request('MKCALENDAR', `${world.home}/fresh`);
    expect(created.status).toBe(201);

    expect(
      (await world.put(`${world.home}/fresh/e.ics`, ics('uid-f'))).status,
    ).toBe(201);
    expect(
      (await world.request('GET', `${world.home}/fresh/e.ics`)).status,
    ).toBe(200);
    expect(
      (await world.request('DELETE', `${world.home}/fresh/e.ics`)).status,
    ).toBe(204);
    expect(
      await world.dataSource
        .getRepository(CalendarCollection)
        .countBy({ name: 'fresh' }),
    ).toBe(1);
  });

  it("a grant on one calendar doesn't open another calendar of the same owner", async () => {
    await world.request('MKCALENDAR', `${world.home}/private`);
    await world.put(`${world.home}/private/p.ics`, ics('uid-p'));
    await world.grantOnCalendar(world.bob, 'all');

    expect(
      (
        await world.request('GET', `${world.home}/private/p.ics`, {
          username: 'bob',
        })
      ).status,
    ).toBe(403);
  });
});
