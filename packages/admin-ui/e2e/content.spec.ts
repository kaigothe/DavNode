import { expect, test } from '@playwright/test';
import { createUser, dav, signIn } from './support';

const ym = new Date().toISOString().slice(0, 7).replace('-', '');
const ics = (uid: string, body: string, summary: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//e2e//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    body,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
const vcard = (uid: string, fn: string, email: string) =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${fn}\r\nEMAIL;TYPE=WORK:${email}\r\nNOTE:<b>not bold</b>\r\nEND:VCARD\r\n`;

test.describe('calendars and contacts of a user', () => {
  let name: string;

  test.beforeAll(async ({ request }) => {
    name = `cal-${Date.now().toString(36)}`;
    const user = await createUser(request, name);
    const home = `/calendars/${user.principalId}`;
    await dav(request, user, 'MKCALENDAR', `${home}/work/`);
    await dav(request, user, 'PUT', `${home}/work/weekly.ics`, {
      contentType: 'text/calendar',
      body: ics(
        'weekly@e2e',
        `DTSTART:${ym}02T090000Z\r\nDTEND:${ym}02T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=6`,
        'Standup',
      ),
    });
    await dav(request, user, 'PUT', `${home}/work/evil.ics`, {
      contentType: 'text/calendar',
      body: ics(
        'evil@e2e',
        `DTSTART:${ym}10T130000Z\r\nDTEND:${ym}10T140000Z`,
        '<img src=x onerror=window.__pwned=1>Evil',
      ),
    });
    await dav(request, user, 'PUT', `${home}/work/offsite.ics`, {
      contentType: 'text/calendar',
      body: ics(
        'offsite@e2e',
        `DTSTART;VALUE=DATE:${ym}15\r\nDTEND;VALUE=DATE:${ym}18`,
        'Offsite',
      ),
    });
    const book = `/addressbooks/${user.principalId}/contacts/`;
    await dav(request, user, 'MKCOL', book, {
      contentType: 'application/xml',
      body: '<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype><D:displayname>People</D:displayname></D:prop></D:set></D:mkcol>',
    });
    for (const [id, fn, mail] of [
      ['ada', 'Ada Lovelace', 'ada@analytical.example'],
      ['grace', 'Grace Hopper', 'grace@navy.example'],
    ]) {
      await dav(request, user, 'PUT', `${book}${id}.vcf`, {
        contentType: 'text/vcard',
        body: vcard(id as string, fn as string, mail as string),
      });
    }
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page
      .getByRole('textbox', { name: 'Search by name or e-mail' })
      .fill(name);
    await page
      .getByRole('link', { name: new RegExp(`Calendars and contacts ${name}`) })
      .click();
    await expect(
      page.getByText(`Calendars and contacts of ${name}`),
    ).toBeVisible();
  });

  const cell = (page: import('@playwright/test').Page, day: string) =>
    page.locator(
      `.ant-picker-cell[title="${new Date().toISOString().slice(0, 7)}-${day}"]`,
    );

  test('shows recurring and all-day events on the right days', async ({
    page,
  }) => {
    for (const day of ['02', '09', '16']) {
      await expect(cell(page, day)).toContainText('Standup');
    }
    for (const day of ['15', '16', '17']) {
      await expect(cell(page, day)).toContainText('Offsite');
    }
    await expect(cell(page, '18')).not.toContainText('Offsite');
  });

  test('shows times in the browser’s time zone', async ({ page }) => {
    await cell(page, '16').click();
    // 09:00 UTC in Europe/Berlin (the test's zone) is 11:00 (summer) or 10:00 (winter).
    await expect(
      page
        .getByText(/1[01]:00 [AP]M – 1[12]:00 [AP]M · /)
        .or(page.getByText(/1[01]:00 AM – (11:00 AM|12:00 PM)/)),
    ).toBeVisible();
  });

  test('renders event text as text and never runs it', async ({ page }) => {
    await cell(page, '10').click();
    await expect(
      page.getByText('<img src=x onerror=window.__pwned=1>Evil').first(),
    ).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __pwned?: number }).__pwned,
      ),
    ).toBeUndefined();
  });

  test('opens an event and shows its stored text on request', async ({
    page,
  }) => {
    await cell(page, '16').click();
    await page.getByRole('button', { name: /Details: Offsite/ }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('All day')).toBeVisible();
    await drawer
      .getByRole('button', { name: 'Show the stored iCalendar' })
      .click();
    await expect(drawer.getByLabel('Stored text')).toHaveValue(
      /UID:offsite@e2e/,
    );
  });

  test('lists, searches and opens contacts, notes as text', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Contacts' }).click();
    await expect(page.getByText('Grace Hopper')).toBeVisible();
    await page
      .getByRole('textbox', { name: /Search by name/ })
      .fill('lovelace');
    await expect(page.getByText('Grace Hopper')).toHaveCount(0);
    await page.getByText('Ada Lovelace').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('ada@analytical.example')).toBeVisible();
    await expect(drawer.getByText('<b>not bold</b>')).toBeVisible();
    await expect(drawer.locator('b')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Show the stored vCard' }).click();
    await expect(drawer.getByLabel('Stored text')).toHaveValue(/UID:ada/);
  });
});
