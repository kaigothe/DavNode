import { CalendarLock, CalendarObjectLock } from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  lockInfoBody,
  type CalendarWorld,
} from './calendar-route-test.util.js';

describe('CalDAV LOCK and UNLOCK routes', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  const objectLocks = () =>
    world.dataSource
      .getRepository(CalendarObjectLock)
      .findBy({ calendarObjectId: world.event.id });
  const calendarLocks = () =>
    world.dataSource
      .getRepository(CalendarLock)
      .findBy({ calendarId: world.calendar.id });

  function lock(
    path: string,
    options: {
      scope?: 'exclusive' | 'shared';
      depth?: string;
      username?: string;
      timeout?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/xml',
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    if (options.timeout !== undefined) {
      headers.Timeout = options.timeout;
    }
    return world.request('LOCK', path, {
      username: options.username,
      headers,
      body: lockInfoBody(options.scope),
    });
  }

  function unlock(
    path: string,
    token: string | null,
    username?: string,
  ): Promise<Response> {
    return world.request('UNLOCK', path, {
      username,
      headers: token === null ? {} : { 'Lock-Token': `<${token}>` },
    });
  }

  async function lockToken(path: string, depth?: string): Promise<string> {
    const response = await lock(path, { depth });
    expect(response.status).toBe(200);
    return response.headers.get('Lock-Token')!.slice(1, -1);
  }

  describe('LOCK', () => {
    it('on an unlocked event returns 200 with a Lock-Token header and a lockdiscovery body', async () => {
      const response = await lock(world.eventUrl);

      expect(response.status).toBe(200);
      const token = response.headers.get('Lock-Token');
      expect(token).toMatch(/^<urn:uuid:[0-9a-f-]{36}>$/);
      expect(response.headers.get('Timeout')).toBe('Second-3600');
      const body = await response.text();
      expect(body).toContain('<D:lockdiscovery>');
      expect(body).toContain('<D:exclusive/>');
      expect(body).toContain(token!.slice(1, -1));
      const stored = await objectLocks();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.principalId).toBe(world.alice.principalId);
    });

    it('a second exclusive LOCK on the same event is 423 no-conflicting-lock', async () => {
      await lock(world.eventUrl);

      const second = await lock(world.eventUrl);

      expect(second.status).toBe(423);
      expect(await second.text()).toContain('no-conflicting-lock');
      expect(await objectLocks()).toHaveLength(1);
    });

    it('two shared LOCKs succeed, but a shared one after an exclusive one conflicts', async () => {
      expect((await lock(world.eventUrl, { scope: 'shared' })).status).toBe(
        200,
      );
      expect((await lock(world.eventUrl, { scope: 'shared' })).status).toBe(
        200,
      );
      expect(await objectLocks()).toHaveLength(2);

      await world.dataSource.getRepository(CalendarObjectLock).clear();
      expect((await lock(world.eventUrl, { scope: 'exclusive' })).status).toBe(
        200,
      );
      expect((await lock(world.eventUrl, { scope: 'shared' })).status).toBe(
        423,
      );
    });

    it('on the calendar stores a CalendarLock with the requested depth', async () => {
      const response = await lock(world.calendarUrl, { depth: '0' });

      expect(response.status).toBe(200);
      const stored = await calendarLocks();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.depth).toBe('zero');
    });

    it('Depth: infinity on the calendar also covers its events', async () => {
      expect(
        (await lock(world.calendarUrl, { depth: 'infinity' })).status,
      ).toBe(200);

      const eventLock = await lock(world.eventUrl);

      expect(eventLock.status).toBe(423);
      expect(await objectLocks()).toHaveLength(0);
    });

    it('a Depth: 0 lock on the calendar leaves its events lockable', async () => {
      await lock(world.calendarUrl, { depth: '0' });

      expect((await lock(world.eventUrl)).status).toBe(200);
    });

    it('Depth: infinity on a calendar with an already-locked event is 423 and creates no lock', async () => {
      await lock(world.eventUrl);

      const response = await lock(world.calendarUrl, { depth: 'infinity' });

      expect(response.status).toBe(423);
      expect(await calendarLocks()).toHaveLength(0);
    });

    it('Depth: 1 is 400, an unparseable body is 400', async () => {
      expect((await lock(world.eventUrl, { depth: '1' })).status).toBe(400);
      const garbage = await world.request('LOCK', world.eventUrl, {
        headers: { 'Content-Type': 'application/xml' },
        body: '<not-lockinfo',
      });
      expect(garbage.status).toBe(400);
    });

    it('of several concurrent exclusive LOCKs on one event exactly one is granted', async () => {
      const statuses = (
        await Promise.all([1, 2, 3, 4, 5, 6].map(() => lock(world.eventUrl)))
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([200, 423, 423, 423, 423, 423]);
      expect(await objectLocks()).toHaveLength(1);
    });

    it('of concurrent Depth: infinity calendar LOCKs and event LOCKs at most one side wins', async () => {
      const statuses = (
        await Promise.all([
          lock(world.calendarUrl, { depth: 'infinity' }),
          lock(world.eventUrl),
        ])
      ).map((response) => response.status);

      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 423)).toHaveLength(1);
      expect(
        (await objectLocks()).length + (await calendarLocks()).length,
      ).toBe(1);
    });

    it('a target that does not exist is 404 for its owner and 403 for anyone else', async () => {
      const missing = `${world.calendarUrl}/missing.ics`;

      expect((await lock(missing)).status).toBe(404);
      expect((await lock(missing, { username: 'bob' })).status).toBe(403);
      expect(
        (await lock(`${world.home}/nope`, { username: 'bob' })).status,
      ).toBe(403);
    });

    it('a path below an event is 404', async () => {
      expect((await lock(`${world.eventUrl}/deeper`)).status).toBe(404);
    });

    it('a user without write-content is refused an exclusive lock, and one without bind on the calendar too', async () => {
      expect((await lock(world.eventUrl, { username: 'bob' })).status).toBe(
        403,
      );
      await world.grantOnCalendar(world.bob, 'write-content');
      expect((await lock(world.eventUrl, { username: 'bob' })).status).toBe(
        200,
      );
      expect(
        (await lock(world.calendarUrl, { username: 'bob', depth: '0' })).status,
      ).toBe(403);
    });

    it('a shared lock only requires read', async () => {
      await world.grantOnCalendar(world.bob, 'read');

      expect(
        (await lock(world.eventUrl, { username: 'bob', scope: 'shared' }))
          .status,
      ).toBe(200);
      expect(
        (await lock(world.eventUrl, { username: 'bob', scope: 'exclusive' }))
          .status,
      ).toBe(403);
    });

    it('honours a requested Timeout and caps Infinite at 24 hours', async () => {
      const short = await lock(world.eventUrl, {
        scope: 'shared',
        timeout: 'Second-120',
      });
      const infinite = await lock(world.eventUrl, {
        scope: 'shared',
        timeout: 'Infinite',
      });

      expect(short.headers.get('Timeout')).toBe('Second-120');
      expect(infinite.headers.get('Timeout')).toBe('Second-86400');
    });

    it('an expired lock no longer conflicts', async () => {
      await lock(world.eventUrl);
      await world.dataSource
        .getRepository(CalendarObjectLock)
        .update(
          { calendarObjectId: world.event.id },
          { expiresAt: new Date(Date.now() - 1000) },
        );

      expect((await lock(world.eventUrl)).status).toBe(200);
    });
  });

  describe('LOCK refresh', () => {
    function refresh(
      path: string,
      token: string,
      options: { username?: string; timeout?: string } = {},
    ): Promise<Response> {
      const headers: Record<string, string> = { If: `(<${token}>)` };
      if (options.timeout !== undefined) {
        headers.Timeout = options.timeout;
      }
      return world.request('LOCK', path, {
        username: options.username,
        headers,
      });
    }

    it('extends expiresAt and returns the same token without a Lock-Token header', async () => {
      const token = await lockToken(world.eventUrl);
      const [before] = await objectLocks();

      const response = await refresh(world.eventUrl, token, {
        timeout: 'Second-7200',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Lock-Token')).toBeNull();
      expect(response.headers.get('Timeout')).toBe('Second-7200');
      const [after] = await objectLocks();
      expect(after?.token).toBe(before?.token);
      expect(after!.expiresAt!.getTime()).toBeGreaterThan(
        before!.expiresAt!.getTime(),
      );
    });

    it('by someone other than the holder is 403, with an unknown token 412, without a token 400', async () => {
      const token = await lockToken(world.eventUrl);

      expect(
        (await refresh(world.eventUrl, token, { username: 'bob' })).status,
      ).toBe(403);
      const unknown = await refresh(
        world.eventUrl,
        'urn:uuid:00000000-0000-0000-0000-000000000000',
      );
      expect(unknown.status).toBe(412);
      expect(await unknown.text()).toContain('lock-token-matches-request-uri');
      expect((await world.request('LOCK', world.eventUrl)).status).toBe(400);
    });
  });

  describe('UNLOCK', () => {
    it('by the holder removes the lock and frees the event for a new one', async () => {
      const token = await lockToken(world.eventUrl);

      expect((await unlock(world.eventUrl, token)).status).toBe(204);

      expect(await objectLocks()).toHaveLength(0);
      expect((await lock(world.eventUrl)).status).toBe(200);
    });

    it('by another principal without the unlock privilege is 403 and keeps the lock', async () => {
      const token = await lockToken(world.eventUrl);

      expect((await unlock(world.eventUrl, token, 'bob')).status).toBe(403);
      expect(await objectLocks()).toHaveLength(1);
    });

    it('by another principal with the unlock privilege succeeds', async () => {
      const token = await lockToken(world.eventUrl);
      await world.grantOnCalendar(world.bob, 'unlock');

      expect((await unlock(world.eventUrl, token, 'bob')).status).toBe(204);
      expect(await objectLocks()).toHaveLength(0);
    });

    it('with an unknown token is 409, without a Lock-Token header 400', async () => {
      await lockToken(world.eventUrl);

      const unknown = await unlock(
        world.eventUrl,
        'urn:uuid:00000000-0000-0000-0000-000000000000',
      );
      expect(unknown.status).toBe(409);
      expect(await unknown.text()).toContain('lock-token-matches-request-uri');
      expect((await unlock(world.eventUrl, null)).status).toBe(400);
      expect(await objectLocks()).toHaveLength(1);
    });

    it('on an event whose lock is inherited from a Depth: infinity calendar lock removes the calendar lock', async () => {
      const token = await lockToken(world.calendarUrl, 'infinity');

      expect((await unlock(world.eventUrl, token)).status).toBe(204);
      expect(await calendarLocks()).toHaveLength(0);
    });

    it('on a target that does not exist is 404 for its owner and 403 for anyone else', async () => {
      const missing = `${world.calendarUrl}/missing.ics`;
      const token = 'urn:uuid:00000000-0000-0000-0000-000000000000';

      expect((await unlock(missing, token)).status).toBe(404);
      expect((await unlock(missing, token, 'bob')).status).toBe(403);
    });
  });
});
