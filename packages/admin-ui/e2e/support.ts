import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const TENANT = 'e2e';
const ADMIN = { username: 'admin', password: 'admin-pw' };
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** Signs in through the login form and waits for the overview. */
export async function signIn(
  page: Page,
  username = ADMIN.username,
  password = ADMIN.password,
) {
  await page.goto('/admin-ui/');
  await page.getByLabel('Tenant').fill(TENANT);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Your account')).toBeVisible();
}

/** The Admin API as the bootstrapped administrator. */
export function adminApi(request: APIRequestContext) {
  const headers = {
    Authorization: basic(ADMIN.username, ADMIN.password),
    'Content-Type': 'application/json',
  };
  return {
    async post(path: string, data: unknown) {
      const response = await request.post(`/admin/${TENANT}${path}`, {
        headers,
        data,
      });
      expect(
        response.ok(),
        `${path}: ${response.status()} ${await response.text()}`,
      ).toBe(true);
      return response.json();
    },
    async get(path: string) {
      const response = await request.get(`/admin/${TENANT}${path}`, {
        headers,
      });
      expect(response.ok(), path).toBe(true);
      return response.json();
    },
  };
}

/** Creates a user through the API and returns their ids. */
export async function createUser(
  request: APIRequestContext,
  username: string,
  password = 'pw-' + username,
) {
  const user = await adminApi(request).post('/users', {
    username,
    email: `${username}@example.com`,
    password,
  });
  return { ...user, password } as {
    id: string;
    principalId: string;
    username: string;
    password: string;
  };
}

/** Sends a DAV request as `user` (MKCALENDAR, MKCOL and PUT have no Playwright helper of their own). */
export async function dav(
  request: APIRequestContext,
  user: { username: string; password: string },
  method: string,
  path: string,
  options: { body?: string; contentType?: string } = {},
) {
  const response = await request.fetch(`/dav/${TENANT}${path}`, {
    method,
    headers: {
      Authorization: basic(user.username, user.password),
      ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    },
    data: options.body,
  });
  expect(response.status(), `${method} ${path}`).toBeLessThan(300);
}

const MKCALENDAR = (name: string, color?: string) =>
  `<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/"><D:set><D:prop><D:displayname>${name}</D:displayname>${
    color ? `<A:calendar-color>${color}</A:calendar-color>` : ''
  }</D:prop></D:set></C:mkcalendar>`;

/** One event of a seeded calendar. `start` and `end` are iCalendar values (`20261014T090000Z`, or a date for all-day). */
export interface SeedEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  allDay?: boolean;
  rrule?: string;
  location?: string;
}

/** Creates a calendar for `user`, with an optional Apple colour, and puts `events` in it. */
export async function seedCalendar(
  request: APIRequestContext,
  user: { username: string; password: string; principalId: string },
  calendar: { path: string; name: string; color?: string },
  events: SeedEvent[],
) {
  const home = `/calendars/${user.principalId}/${calendar.path}`;
  await dav(request, user, 'MKCALENDAR', `${home}/`, {
    contentType: 'application/xml',
    body: MKCALENDAR(calendar.name, calendar.color),
  });
  for (const e of events) {
    const date = e.allDay ? ';VALUE=DATE' : '';
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//e2e//EN',
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      'DTSTAMP:20260101T000000Z',
      `DTSTART${date}:${e.start}`,
      `DTEND${date}:${e.end}`,
      ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
      ...(e.location ? [`LOCATION:${e.location}`] : []),
      `SUMMARY:${e.summary}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    await dav(request, user, 'PUT', `${home}/${e.uid}.ics`, {
      contentType: 'text/calendar',
      body,
    });
  }
}

/** `20261014` for a date, in UTC. */
export const ymd = (date: Date) =>
  date.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * `20261014` for today in the browser's time zone (see playwright.config.ts).
 * The UTC date is a day behind or ahead for a few hours every day, and then
 * the calendar opens on a different day than the one the events were put on.
 */
export const todayInBrowserZone = () =>
  new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
    .replace(/-/g, '');
