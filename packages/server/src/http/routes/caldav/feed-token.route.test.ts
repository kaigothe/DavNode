import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCalendarWorld,
  type CalendarWorld,
} from './calendar-route-test.util.js';

describe('feed-token route', () => {
  let world: CalendarWorld;

  beforeEach(async () => {
    world = await createCalendarWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  it("generates a token for the calendar's owner and returns it as JSON", async () => {
    const response = await world.request(
      'POST',
      `${world.calendarUrl}/feed-token`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThanOrEqual(40);
  });

  it('returns a different token, invalidating the previous one, on a second call', async () => {
    const first = (await (
      await world.request('POST', `${world.calendarUrl}/feed-token`)
    ).json()) as { token: string };
    const second = (await (
      await world.request('POST', `${world.calendarUrl}/feed-token`)
    ).json()) as { token: string };

    expect(second.token).not.toBe(first.token);
  });

  it('requires write-acl, not just read', async () => {
    await world.grantOnCalendar(world.bob, 'read');

    const response = await world.request(
      'POST',
      `${world.calendarUrl}/feed-token`,
      { username: 'bob' },
    );

    expect(response.status).toBe(403);
  });

  it('succeeds for a user granted write-acl (without owning the calendar)', async () => {
    await world.grantOnCalendar(world.bob, 'write-acl');

    const response = await world.request(
      'POST',
      `${world.calendarUrl}/feed-token`,
      { username: 'bob' },
    );

    expect(response.status).toBe(200);
  });

  it('requires authentication, like any other DAV route', async () => {
    const response = await fetch(
      `${world.baseUrl}${world.calendarUrl}/feed-token`,
      {
        method: 'POST',
      },
    );

    expect(response.status).toBe(401);
  });
});
