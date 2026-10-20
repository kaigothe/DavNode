import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminMe,
  apiError,
  baseRoutes,
  chooseOption,
  renderApp,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const withContent = { ...adminMe, capabilities: { contentView: true } };
const alice = user();

const today = () => dayjs().startOf('day');
const event = (over: Record<string, unknown> = {}) => ({
  objectId: '00000000-0000-4000-8000-000000000093',
  uid: 'standup@test',
  name: 'standup.ics',
  summary: 'Standup',
  location: 'Room 1',
  description: 'Daily sync\nBring notes',
  start: today().add(9, 'hour').toISOString(),
  end: today().add(10, 'hour').toISOString(),
  isAllDay: false,
  isRecurring: true,
  isOverride: false,
  status: null,
  transparency: 'opaque',
  ...over,
});
const work = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: 'work',
  displayName: 'Work',
  description: null,
  timezone: null,
  objectCount: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const private_ = {
  ...work,
  id: '00000000-0000-4000-8000-0000000000f2',
  name: 'private',
  displayName: 'Private',
  objectCount: 1,
};

const calendarRoutes = (
  extra: Routes = {},
  me: object = withContent,
): Routes => ({
  ...baseRoutes(me),
  'GET /users/00000000-0000-4000-8000-0000000000a2': () => Response.json(alice),
  'GET /users/00000000-0000-4000-8000-0000000000a2/calendars': () =>
    Response.json({ calendars: [work, private_] }),
  'GET /users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f1/events':
    () => Response.json({ events: [event()], truncated: false, skipped: 0 }),
  'GET /users/00000000-0000-4000-8000-0000000000a2/addressbooks': () =>
    Response.json({ addressbooks: [] }),
  ...extra,
});

describe('opening the content view', () => {
  it('is offered in the users list only when the server has it on', async () => {
    signedInAs();
    stubApi({
      ...baseRoutes(withContent),
      'GET /users': () => Response.json({ users: [alice], total: 1 }),
    });
    await renderApp('/users');

    const link = await screen.findByRole('link', {
      name: /Calendars and contacts alice/,
    });
    expect(link).toHaveAttribute(
      'href',
      '/users/00000000-0000-4000-8000-0000000000a2/content',
    );
  });

  it('is not offered when it is off', async () => {
    signedInAs();
    stubApi({
      ...baseRoutes(adminMe),
      'GET /users': () => Response.json({ users: [alice], total: 1 }),
    });
    await renderApp('/users');
    await screen.findByText('alice');

    expect(
      screen.queryByRole('link', { name: /Calendars and contacts/ }),
    ).not.toBeInTheDocument();
  });

  it('says so when someone opens the address anyway', async () => {
    signedInAs();
    const calls = stubApi(baseRoutes(adminMe));
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');

    expect(await screen.findByText('Not enabled')).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/calendars'))).toBe(false);
  });

  it('shows "not found" for an unknown user', async () => {
    signedInAs();
    stubApi(
      calendarRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2': () =>
          apiError(404, 'user_not_found'),
      }),
    );
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('warns that every access is logged', async () => {
    signedInAs();
    stubApi(calendarRoutes());
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');

    expect(
      await screen.findByText(
        /Every access to a user’s data is written to the server log/,
      ),
    ).toBeInTheDocument();
  });
});

describe('calendars', () => {
  async function open(routes: Routes = calendarRoutes()) {
    signedInAs();
    const calls = stubApi(routes);
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');
    await screen.findByText('Standup');
    return { calls, user: userEvent.setup() };
  }

  it('lists the events of the selected day with time and place', async () => {
    await open();

    const item = screen.getByText('Standup').closest('li') as HTMLElement;
    expect(within(item).getByText(/09:00.*10:00.*Room 1/)).toBeInTheDocument();
  });

  it('asks for a window around the month, in whole days', async () => {
    const { calls } = await open();

    const call = calls.find(
      (c) =>
        c.path ===
        '/users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f1/events',
    );
    const params = new URL(call?.full ?? '', 'http://x').searchParams;
    expect(new Date(params.get('to') ?? '').getTime()).toBeGreaterThan(
      new Date(params.get('from') ?? '').getTime(),
    );
    expect(
      new Date(params.get('to') ?? '').getTime() -
        new Date(params.get('from') ?? '').getTime(),
    ).toBeLessThan(366 * 86_400_000);
  });

  it('shows event text as text, never as markup', async () => {
    await open(
      calendarRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f1/events':
          () =>
            Response.json({
              events: [
                event({
                  summary:
                    '<img src=x onerror=alert(1)><script>alert(2)</script>',
                }),
              ],
              truncated: false,
              skipped: 0,
            }),
      }),
    ).catch(() => undefined);
    await screen.findByText(
      '<img src=x onerror=alert(1)><script>alert(2)</script>',
    );

    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('script:not([src])')).toBeNull();
  });

  it('switches to another calendar', async () => {
    const { calls, user: u } = await open();

    await u.click(screen.getByRole('combobox', { name: 'Calendar' }));
    await chooseOption(u, 'Private (1 entry)');

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path ===
            '/users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f2/events',
        ),
      ).toBe(true),
    );
  });

  it('opens the details of an event', async () => {
    const { user: u } = await open();

    await u.click(screen.getByRole('button', { name: 'Details: Standup' }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Room 1')).toBeInTheDocument();
    expect(within(drawer).getByText(/Daily sync/)).toBeInTheDocument();
    expect(within(drawer).getByText('Recurring')).toBeInTheDocument();
    expect(within(drawer).getByText('Busy')).toBeInTheDocument();
  });

  it('loads the stored iCalendar only when asked', async () => {
    const { calls, user: u } = await open(calendarRoutes());
    await u.click(screen.getByRole('button', { name: 'Details: Standup' }));
    const drawer = await screen.findByRole('dialog');
    expect(calls.some((c) => c.full.includes('raw=true'))).toBe(false);

    stubApiRaw();
    await u.click(
      within(drawer).getByRole('button', { name: 'Show the stored iCalendar' }),
    );

    const stored = (await within(drawer).findByLabelText(
      'Stored text',
    )) as HTMLTextAreaElement;
    expect(stored.value).toContain('BEGIN:VCALENDAR');
  });

  it('explains when events were cut off or unreadable', async () => {
    await open(
      calendarRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f1/events':
          () =>
            Response.json({ events: [event()], truncated: true, skipped: 2 }),
      }),
    );

    expect(
      await screen.findByText(/only the first ones are shown/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 entries could not be read and are not shown.'),
    ).toBeInTheDocument();
  });

  it('says when a user has no calendars', async () => {
    signedInAs();
    stubApi(
      calendarRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/calendars': () =>
          Response.json({ calendars: [] }),
      }),
    );
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');

    expect(
      await screen.findByText('This user has no calendars.'),
    ).toBeInTheDocument();
  });

  it('shows a failure to load the events with a retry', async () => {
    signedInAs();
    stubApi(
      calendarRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/calendars/00000000-0000-4000-8000-0000000000f1/events':
          () => apiError(400, 'range_too_large'),
      }),
    );
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');

    expect(
      await screen.findByText('The time range is too long.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});

/** Makes every events request answer with the stored text as well. */
function stubApiRaw() {
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', (input: URL | string, init?: RequestInit) => {
    const url = new URL(input.toString(), 'http://localhost');
    if (
      url.pathname.endsWith(
        '/calendars/00000000-0000-4000-8000-0000000000f1/events',
      ) &&
      url.searchParams.get('raw') === 'true'
    ) {
      return Promise.resolve(
        Response.json({
          events: [
            event({
              raw: 'BEGIN:VCALENDAR\r\nUID:standup@test\r\nEND:VCALENDAR\r\n',
            }),
          ],
          truncated: false,
          skipped: 0,
        }),
      );
    }
    return original(input, init);
  });
}

describe('contacts', () => {
  const ada = {
    id: '00000000-0000-4000-8000-000000000092',
    uid: 'ada1',
    name: 'ada.vcf',
    displayName: 'Ada Lovelace',
    organization: 'Analytical Engines',
    title: 'Programmer',
    emails: [{ value: 'ada@analytical.example', types: ['work'] }],
    phones: [{ value: '+49 170 1', types: ['cell'] }],
    addresses: ['1 Main St, London'],
    birthday: '1815-12-10',
    notes: 'First line\nSecond <b>line</b>',
    hasPhoto: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const book = {
    id: '00000000-0000-4000-8000-000000000091',
    displayName: 'Contacts',
    description: null,
    contactCount: 2,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const contactRoutes = (extra: Routes = {}): Routes => ({
    ...calendarRoutes(),
    'GET /users/00000000-0000-4000-8000-0000000000a2/calendars': () =>
      Response.json({ calendars: [] }),
    'GET /users/00000000-0000-4000-8000-0000000000a2/addressbooks': () =>
      Response.json({ addressbooks: [book] }),
    'GET /users/00000000-0000-4000-8000-0000000000a2/addressbooks/00000000-0000-4000-8000-000000000091/contacts':
      () => Response.json({ contacts: [ada], total: 1 }),
    ...extra,
  });

  async function open(routes: Routes = contactRoutes()) {
    signedInAs();
    const calls = stubApi(routes);
    const u = userEvent.setup();
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');
    await u.click(await screen.findByRole('tab', { name: 'Contacts' }));
    await screen.findByText('Ada Lovelace');
    return { calls, user: u };
  }

  it('lists the contacts of the first address book, paged', async () => {
    const { calls } = await open();

    expect(
      calls.find(
        (c) =>
          c.path ===
          '/users/00000000-0000-4000-8000-0000000000a2/addressbooks/00000000-0000-4000-8000-000000000091/contacts',
      )?.full,
    ).toContain('limit=50');
  });

  it('searches on the server', async () => {
    const { calls, user: u } = await open();

    await u.type(
      screen.getByRole('textbox', { name: /Search by name/ }),
      'lovel',
    );

    await waitFor(() =>
      expect(calls.some((c) => c.full.includes('q=lovel'))).toBe(true),
    );
  });

  it('shows all details of a contact, notes as text', async () => {
    const { user: u } = await open();

    await u.click(screen.getByText('Ada Lovelace'));

    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText('ada@analytical.example'),
    ).toBeInTheDocument();
    expect(within(drawer).getByText('work')).toBeInTheDocument();
    expect(within(drawer).getByText('1 Main St, London')).toBeInTheDocument();
    expect(within(drawer).getByText(/Second <b>line<\/b>/)).toBeInTheDocument();
    expect(drawer.querySelector('b')).toBeNull();
  });

  it('fetches the stored vCard by name, only on request', async () => {
    const { calls, user: u } = await open(
      contactRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/addressbooks/00000000-0000-4000-8000-000000000091/contacts?q=Ada+Lovelace&limit=500&raw=true':
          () =>
            Response.json({
              contacts: [
                { ...ada, raw: 'BEGIN:VCARD\r\nUID:ada1\r\nEND:VCARD\r\n' },
              ],
              total: 1,
            }),
      }),
    );
    await u.click(screen.getByText('Ada Lovelace'));
    const drawer = await screen.findByRole('dialog');
    expect(calls.some((c) => c.full.includes('raw=true'))).toBe(false);

    await u.click(
      within(drawer).getByRole('button', { name: 'Show the stored vCard' }),
    );

    const stored = (await within(drawer).findByLabelText(
      'Stored text',
    )) as HTMLTextAreaElement;
    expect(stored.value).toContain('UID:ada1');
  });

  it('says when a user has no address books', async () => {
    signedInAs();
    stubApi(
      contactRoutes({
        'GET /users/00000000-0000-4000-8000-0000000000a2/addressbooks': () =>
          Response.json({ addressbooks: [] }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/users/00000000-0000-4000-8000-0000000000a2/content');
    await u.click(await screen.findByRole('tab', { name: 'Contacts' }));

    expect(
      await screen.findByText('This user has no address books.'),
    ).toBeInTheDocument();
  });
});
