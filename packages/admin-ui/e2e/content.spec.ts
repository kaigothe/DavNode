import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  dav,
  seedCalendar,
  signIn,
  todayInBrowserZone,
} from './support';

const today = todayInBrowserZone();
const ym = today.slice(0, 6);
const vcard = (uid: string, fn: string, email: string) =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${fn}\r\nEMAIL;TYPE=WORK:${email}\r\nNOTE:<b>not bold</b>\r\nEND:VCARD\r\n`;

test.describe('calendars and contacts of a user', () => {
  let name: string;

  test.beforeAll(async ({ request }) => {
    name = `cal-${Date.now().toString(36)}`;
    const user = await createUser(request, name);
    await seedCalendar(request, user, { path: 'work', name: 'Work' }, [
      {
        uid: 'weekly@e2e',
        summary: 'Standup',
        start: `${ym}02T090000Z`,
        end: `${ym}02T100000Z`,
        rrule: 'FREQ=WEEKLY;COUNT=8',
      },
      {
        uid: 'evil@e2e',
        summary: '<img src=x onerror=window.__pwned=1>Evil',
        start: `${ym}10T130000Z`,
        end: `${ym}10T140000Z`,
      },
      {
        uid: 'offsite@e2e',
        summary: 'Offsite',
        start: `${ym}15`,
        end: `${ym}18`,
        allDay: true,
      },
      {
        uid: 'a@e2e',
        summary: 'Overlap A',
        start: `${today}T140000Z`,
        end: `${today}T153000Z`,
        location: 'Room 1',
      },
      {
        uid: 'b@e2e',
        summary: 'Overlap B',
        start: `${today}T150000Z`,
        end: `${today}T160000Z`,
      },
    ]);
    await seedCalendar(
      request,
      user,
      { path: 'home', name: 'Home', color: '#FF2968FF' },
      [
        {
          uid: 'lunch@e2e',
          summary: 'Lunch',
          start: `${today}T110000Z`,
          end: `${today}T120000Z`,
        },
        {
          uid: 'dentist@e2e',
          summary: 'Dentist',
          start: `${ym}09T110000Z`,
          end: `${ym}09T114500Z`,
        },
      ],
    );
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

  const event = (page: Page, title: string) =>
    page.getByLabel(new RegExp(`(^|, )${title}, `)).first();
  const day = (page: Page, iso: string) => page.locator(`[data-day="${iso}"]`);
  const monthDay = (n: string) => `${ym.slice(0, 4)}-${ym.slice(4)}-${n}`;

  test('opens on the week of today, with today marked and the current time drawn', async ({
    page,
  }) => {
    await expect(event(page, 'Lunch')).toBeVisible();
    await expect(page.locator('[aria-current="date"]').first()).toBeVisible();
    await expect(page.getByTestId('now-line')).toHaveCount(1);
    await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();
  });

  test('shows overlapping events side by side, not on top of each other', async ({
    page,
  }) => {
    const a = await event(page, 'Overlap A').boundingBox();
    const b = await event(page, 'Overlap B').boundingBox();

    expect(a && b).toBeTruthy();
    // A runs 14:00–15:30 and B 15:00–16:00: they share the time from 15:00, so
    // each takes half of the column and they do not overlap horizontally.
    expect((a?.x ?? 0) + (a?.width ?? 0)).toBeLessThanOrEqual((b?.x ?? 0) + 1);
    expect(a?.width).toBeCloseTo(b?.width ?? 0, 0);
  });

  test('colours an event with the colour of its calendar', async ({ page }) => {
    // #ff2968 mixed 20 % into white, the tint of a block in the light theme.
    await expect(event(page, 'Lunch')).toHaveCSS(
      'background-color',
      'rgb(255, 212, 225)',
    );
  });

  test('shows times in the browser’s time zone (Europe/Berlin)', async ({
    page,
  }) => {
    // 11:00 UTC is 12:00 or 13:00 in Berlin.
    await expect(event(page, 'Lunch')).toHaveAttribute(
      'aria-label',
      /(12|1):00 PM/,
    );
  });

  test('opens the details of an event in the drawer from the right', async ({
    page,
  }) => {
    await event(page, 'Overlap A').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Room 1')).toBeVisible();
    await expect(drawer.getByText('Work', { exact: true })).toBeVisible();
    // It slides in; once it has stopped its right edge is the window's edge.
    // (Measuring the left edge mid-slide only passes while it is still early.)
    const width = page.viewportSize()?.width ?? 1280;
    await expect
      .poll(async () => {
        const box = await drawer.boundingBox();
        return box ? Math.round(box.x + box.width) : 0;
      })
      .toBe(width);

    await drawer
      .getByRole('button', { name: 'Show the stored iCalendar' })
      .click();
    await expect(drawer.getByLabel('Stored text')).toHaveValue(/UID:a@e2e/);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('switches a calendar off and on in the sidebar', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Home' }).uncheck();
    await expect(event(page, 'Lunch')).toHaveCount(0);
    await expect(event(page, 'Overlap A')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Home' }).check();
    await expect(event(page, 'Lunch')).toBeVisible();
  });

  test('shows the month with recurring and all-day events on the right days', async ({
    page,
  }) => {
    await page.getByText('Month', { exact: true }).click();
    for (const n of ['02', '09', '16']) {
      await expect(
        day(page, monthDay(n)).getByLabel(/(^|, )Standup, /),
      ).toBeVisible();
    }
    await expect(
      day(page, monthDay('09')).getByLabel(/(^|, )Dentist, /),
    ).toBeVisible();
    const offsite = await event(page, 'Offsite').boundingBox();
    const cell = await day(page, monthDay('15')).boundingBox();
    // The all-day event is one bar over three days.
    expect(offsite?.width).toBeGreaterThan((cell?.width ?? 0) * 2.5);
  });

  test('renders event text as text and never runs it', async ({ page }) => {
    await page.getByText('Month', { exact: true }).click();
    const evil = day(page, monthDay('10')).getByLabel(/Evil, /);
    await expect(evil).toContainText(
      '<img src=x onerror=window.__pwned=1>Evil',
    );
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __pwned?: number }).__pwned,
      ),
    ).toBeUndefined();
  });

  test('opens a day from the month and moves through the days', async ({
    page,
  }) => {
    await page.getByText('Month', { exact: true }).click();
    await page
      .getByRole('region', { name: 'Month', exact: true })
      .getByRole('button', {
        name: new RegExp(`^\\w+, \\w+ 9, ${ym.slice(0, 4)}$`),
      })
      .click();
    await expect(page.getByRole('radio', { name: 'Day' })).toBeChecked();
    await expect(
      day(page, monthDay('09')).getByLabel(/(^|, )Dentist, /),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(day(page, monthDay('10')).getByLabel(/Evil, /)).toBeVisible();
  });

  test('jumps with the mini month', async ({ page }) => {
    const mini = page.getByRole('region', { name: 'Month navigation' });
    await mini.getByRole('button', { name: 'Next month' }).click();
    await mini
      .getByRole('button', { name: /, \w+ 1, / })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(event(page, 'Lunch')).toHaveCount(0);
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
    const card = drawer.getByRole('article', { name: 'Business card' });
    await expect(card.getByText('Ada Lovelace')).toBeVisible();
    await expect(card.getByText('ada@analytical.example (work)')).toBeVisible();
    await expect(
      drawer.getByText('ada@analytical.example').first(),
    ).toBeVisible();
    await expect(drawer.getByText('<b>not bold</b>')).toBeVisible();
    await expect(drawer.locator('b')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Show the stored vCard' }).click();
    await expect(drawer.getByLabel('Stored text')).toHaveValue(/UID:ada/);
  });
});
