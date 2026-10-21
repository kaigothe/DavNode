import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminMe,
  baseRoutes,
  renderApp,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

const alice = user();
const withContent = {
  ...adminMe,
  capabilities: { contentView: true, logView: false },
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const calendar = (n: number, name: string, color: string | null) => ({
  id: id(n),
  name: name.toLowerCase(),
  displayName: name,
  description: null,
  timezone: null,
  color,
  objectCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const work = calendar(10, 'Work', null);
const personal = calendar(11, 'Personal', '#ff2968');

const event = (over: Record<string, unknown> = {}) => ({
  objectId: id(100),
  uid: 'u@test',
  name: 'e.ics',
  summary: 'Event',
  location: null,
  description: null,
  start: '2026-10-14T09:00:00.000Z',
  end: '2026-10-14T10:00:00.000Z',
  isAllDay: false,
  isRecurring: false,
  isOverride: false,
  status: null,
  transparency: 'opaque',
  ...over,
});
const at = (
  n: number,
  summary: string,
  start: string,
  end: string,
  extra = {},
) =>
  event({
    objectId: id(100 + n),
    summary,
    start: `2026-10-${start}:00.000Z`,
    end: `2026-10-${end}:00.000Z`,
    ...extra,
  });

const workEvents = [
  at(1, 'Standup', '14T09:00', '14T09:30', {
    location: 'Room 1',
    description: 'Daily sync',
  }),
  at(2, 'Design review', '14T14:00', '14T15:30'),
  at(3, 'Workshop', '14T15:00', '14T16:00'),
  at(4, 'Offsite', '15T00:00', '18T00:00', { isAllDay: true }),
  at(5, 'Night shift', '14T22:00', '15T02:00'),
];
const personalEvents = [at(6, 'Dentist', '14T11:00', '14T11:45')];

const routes = (extra: Routes = {}): Routes => ({
  ...baseRoutes(withContent),
  [`GET /users/${alice.id}`]: () => Response.json(alice),
  [`GET /users/${alice.id}/calendars`]: () =>
    Response.json({ calendars: [personal, work] }),
  [`GET /users/${alice.id}/calendars/${work.id}/events`]: () =>
    Response.json({ events: workEvents, truncated: false, skipped: 0 }),
  [`GET /users/${alice.id}/calendars/${personal.id}/events`]: () =>
    Response.json({ events: personalEvents, truncated: false, skipped: 0 }),
  [`GET /users/${alice.id}/addressbooks`]: () =>
    Response.json({ addressbooks: [] }),
  ...extra,
});

beforeEach(() => {
  // "Now" is Wednesday 14 October 2026, 10:30 UTC; timers keep running.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T10:30:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open(extra: Routes = {}, path = `/users/${alice.id}/content`) {
  signedInAs();
  const calls = stubApi(routes(extra));
  await renderApp(path);
  await screen.findByLabelText(/(^|, )Standup, /);
  return { calls, user: userEvent.setup({ advanceTimers: () => undefined }) };
}

/** The narrow layout keeps the calendars in a collapsed panel. */
async function openSidebar(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole('button', { name: /Calendars/ }));
}

const heading = () =>
  screen.getByRole('heading', { level: 2, name: /20|Oct|October/ });
const view = (name: string) =>
  screen.getByText(name, { selector: '.ant-segmented-item-label' });
const checked = (name: string) => screen.getByRole('radio', { name });

describe('calendar view', () => {
  it('opens on the week of today, with Week selected', async () => {
    await open();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /^Oct 11\s*–\s*17, 2026$/,
      }),
    ).toBeInTheDocument();
    expect(checked('Week')).toBeChecked();
  });

  it('shows events as buttons that say what, when and which calendar', async () => {
    await open();

    expect(
      screen.getByRole('button', {
        name: 'Standup, 9:00 AM – 9:30 AM, Room 1, calendar Work',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/(^|, )Dentist, .*, calendar Personal$/),
    ).toBeInTheDocument();
  });

  it('marks today and draws the line for the current time', async () => {
    await open();

    expect(
      screen.getByRole('button', {
        name: /^Wed 14, Wednesday, October 14, 2026$/,
      }),
    ).toHaveAttribute('aria-current', 'date');
    expect(screen.getAllByTestId('now-line')).toHaveLength(1);
  });

  it('puts an event at its time and gives it its length', async () => {
    await open();

    const standup = screen.getByLabelText(/(^|, )Standup, /);

    // 09:00 is 9 hours down at 48 px an hour; 30 minutes is 24 px less the 2 px gap.
    expect(standup.style.top).toBe('432px');
    expect(standup.style.height).toBe('22px');
  });

  it('shows overlapping events side by side', async () => {
    await open();

    const review = screen.getByLabelText(/(^|, )Design review, /);
    const workshop = screen.getByLabelText(/(^|, )Workshop, /);

    expect(review.style.width).toBe('calc(50% - 4px)');
    expect(workshop.style.width).toBe('calc(50% - 4px)');
    expect(review.style.insetInlineStart).not.toBe(
      workshop.style.insetInlineStart,
    );
  });

  it('draws an all-day event as a bar over its days, in the strip above the grid', async () => {
    await open();

    const offsite = screen.getByLabelText(/(^|, )Offsite, All day/);

    // Thursday to Saturday of the week starting Sunday 11: columns 5 to 7.
    expect(offsite.style.gridColumn).toBe('5 / 8');
  });

  it('shows an event that crosses midnight on both days', async () => {
    await open();

    expect(screen.getAllByLabelText(/(^|, )Night shift, /)).toHaveLength(2);
  });

  it('colours events with the colour of their calendar', async () => {
    await open();

    const dentist = screen.getByLabelText(/(^|, )Dentist, /);

    // The tint of #ff2968 on white.
    expect(dentist.getAttribute('style')).toMatch(/255, 212, 225|#ffd4e1/i);
  });

  it('uses a default colour for a calendar that has none', async () => {
    await open();

    const standup = screen.getByLabelText(/(^|, )Standup, /);

    // Work is the second calendar, so it gets the second default colour, #63da38 (tinted on white).
    expect(standup.getAttribute('style')).toMatch(/224, 248, 215|#e0f8d7/i);
  });
});

describe('opening an event', () => {
  it('shows its details in the drawer from the right', async () => {
    const { user: u } = await open();

    await u.click(screen.getByLabelText(/(^|, )Standup, /));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Room 1')).toBeInTheDocument();
    expect(within(drawer).getByText(/Daily sync/)).toBeInTheDocument();
    expect(within(drawer).getByText('Work')).toBeInTheDocument();
    expect(document.querySelector('.ant-drawer-right')).not.toBeNull();
  });

  it('works for a bar in the all-day strip and for an event in the month view', async () => {
    const { user: u } = await open();

    await u.click(screen.getByLabelText(/(^|, )Offsite, /));
    expect(
      await within(await screen.findByRole('dialog')).findByText('All day'),
    ).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await u.click(view('Month'));
    await u.click(await screen.findByLabelText(/(^|, )Standup, /));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('loads the stored iCalendar only when asked', async () => {
    const { calls, user: u } = await open({
      [`GET /users/${alice.id}/calendars/${work.id}/events?from=2026-10-14T09%3A00%3A00.000Z&to=2026-10-14T09%3A30%3A00.000Z&raw=true`]:
        () =>
          Response.json({
            events: [
              {
                ...workEvents[0],
                raw: 'BEGIN:VCALENDAR\r\nUID:standup@test\r\nEND:VCALENDAR\r\n',
              },
            ],
            truncated: false,
            skipped: 0,
          }),
    });
    await u.click(screen.getByLabelText(/(^|, )Standup, /));
    const drawer = await screen.findByRole('dialog');
    expect(calls.some((c) => c.full.includes('raw=true'))).toBe(false);

    await u.click(
      within(drawer).getByRole('button', { name: 'Show the stored iCalendar' }),
    );

    const stored = (await within(drawer).findByLabelText(
      'Stored text',
    )) as HTMLTextAreaElement;
    expect(stored.value).toContain('UID:standup@test');
  });
});

describe('navigation', () => {
  it('moves by a week and back to today', async () => {
    const { user: u } = await open();

    await u.click(screen.getByRole('button', { name: 'Next week' }));
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /^Oct 18\s*–\s*24, 2026$/,
      }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Previous week' }));
    await u.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(
      screen.getByRole('heading', { level: 2, name: /^Oct 4\s*–\s*10, 2026$/ }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Today' }));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /^Oct 11\s*–\s*17, 2026$/,
      }),
    ).toBeInTheDocument();
  });

  it('asks for the events of the week that is shown, for each calendar', async () => {
    const { calls, user: u } = await open();
    const asked = () =>
      calls.filter((c) => c.path.endsWith('/events')).map((c) => c.full);

    await u.click(screen.getByRole('button', { name: 'Next week' }));

    await waitFor(() =>
      expect(asked().some((f) => f.includes('from=2026-10-18'))).toBe(true),
    );
    expect(asked().filter((f) => f.includes('from=2026-10-18'))).toHaveLength(
      2,
    );
  });

  it('shows one day, with its full date as the title', async () => {
    const { user: u } = await open();

    await u.click(view('Day'));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Wednesday, October 14, 2026',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Next day' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/(^|, )Offsite, /)).not.toBeInTheDocument();
  });

  it('shows the month, with a date that opens that day', async () => {
    const { user: u } = await open();

    await u.click(view('Month'));
    expect(
      screen.getByRole('heading', { level: 2, name: 'October 2026' }),
    ).toBeInTheDocument();
    await u.click(
      screen.getByRole('button', { name: 'Thursday, October 15, 2026' }),
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Thursday, October 15, 2026',
      }),
    ).toBeInTheDocument();
    expect(checked('Day')).toBeChecked();
  });

  it('moves a month at a time in the month view', async () => {
    const { user: u } = await open();

    await u.click(view('Month'));
    await u.click(screen.getByRole('button', { name: 'Next month' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'November 2026' }),
    ).toBeInTheDocument();
  });

  it('starts the week on Monday in German', async () => {
    signedInAs();
    stubApi(routes());
    await renderApp(`/users/${alice.id}/content`);
    await screen.findByLabelText(/(^|, )Standup, /);
    const { setLanguage } = await import('../../i18n');

    await setLanguage('de');

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: /12\.? – 18\.? Okt\.? 2026|12.–18. Okt. 2026/,
      }),
    ).toBeInTheDocument();
    await setLanguage('en');
  });
});

describe('month view', () => {
  it('lists single-day events with their time and shows multi-day ones as bars', async () => {
    const { user: u } = await open();

    await u.click(view('Month'));

    expect(await screen.findByLabelText(/(^|, )Standup, /)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/(^|, )Offsite, All day/).style.gridColumn,
    ).toBe('5 / 8');
    expect(screen.getByLabelText(/(^|, )Night shift, /)).toBeInTheDocument();
  });

  it('says "+n more" in a crowded day and opens the day from it', async () => {
    const crowded = Array.from({ length: 7 }, (_, n) =>
      at(
        20 + n,
        `Meeting ${n}`,
        `14T${String(8 + n).padStart(2, '0')}:00`,
        `14T${String(8 + n).padStart(2, '0')}:30`,
      ),
    );
    const { user: u } = await open({
      [`GET /users/${alice.id}/calendars/${work.id}/events`]: () =>
        Response.json({
          events: [...workEvents, ...crowded],
          truncated: false,
          skipped: 0,
        }),
    });

    await u.click(view('Month'));
    const more = await screen.findByRole('button', { name: /more$/ });
    await u.click(more);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Wednesday, October 14, 2026',
      }),
    ).toBeInTheDocument();
  });
});

describe('the sidebar', () => {
  it('lists the calendars; switching one off hides its events and stops asking for them', async () => {
    const { calls, user: u } = await open();
    await openSidebar(u);

    await u.click(await screen.findByRole('checkbox', { name: 'Personal' }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText(/(^|, )Dentist, /),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/(^|, )Standup, /)).toBeInTheDocument();
    const before = calls.filter((c) => c.path.includes(personal.id)).length;
    await u.click(screen.getByRole('button', { name: 'Next week' }));
    await screen.findByRole('heading', {
      level: 2,
      name: /^Oct 18\s*–\s*24, 2026$/,
    });
    expect(calls.filter((c) => c.path.includes(personal.id)).length).toBe(
      before,
    );
  });

  it('shows the calendars again when they are switched back on', async () => {
    const { user: u } = await open();
    await openSidebar(u);

    await u.click(await screen.findByRole('checkbox', { name: 'Personal' }));
    await waitFor(() =>
      expect(
        screen.queryByLabelText(/(^|, )Dentist, /),
      ).not.toBeInTheDocument(),
    );
    await u.click(screen.getByRole('checkbox', { name: 'Personal' }));

    expect(await screen.findByLabelText(/(^|, )Dentist, /)).toBeInTheDocument();
  });

  it('has a mini month that jumps to a date', async () => {
    // The days are found by their label: a role query with a name has to work
    // out the name of every button in the month, which takes seconds in jsdom.
    const { user: u } = await open();
    await openSidebar(u);

    const mini = await screen.findByRole('region', {
      name: 'Month navigation',
    });
    await u.click(within(mini).getByLabelText('Friday, October 23, 2026'));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /^Oct 18\s*–\s*24, 2026$/,
      }),
    ).toBeInTheDocument();
    expect(
      within(mini).getByLabelText('Friday, October 23, 2026'),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(mini).getByLabelText('Wednesday, October 14, 2026'),
    ).toHaveAttribute('aria-current', 'date');
  });

  it('moves the mini month by a month', async () => {
    const { user: u } = await open();
    await openSidebar(u);

    const mini = await screen.findByRole('region', {
      name: 'Month navigation',
    });
    await u.click(within(mini).getByRole('button', { name: 'Next month' }));

    expect(within(mini).getByText('November 2026')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('says when a user has no calendars', async () => {
    signedInAs();
    stubApi(
      routes({
        [`GET /users/${alice.id}/calendars`]: () =>
          Response.json({ calendars: [] }),
      }),
    );
    await renderApp(`/users/${alice.id}/content`);

    expect(
      await screen.findByText('This user has no calendars.'),
    ).toBeInTheDocument();
  });

  it('explains when events were cut off or unreadable', async () => {
    await open({
      [`GET /users/${alice.id}/calendars/${work.id}/events`]: () =>
        Response.json({ events: workEvents, truncated: true, skipped: 2 }),
    });

    expect(
      await screen.findByText(/only the first ones are shown/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 entries could not be read and are not shown.'),
    ).toBeInTheDocument();
  });

  it('shows a failure to load events with a retry', async () => {
    signedInAs();
    stubApi(
      routes({
        [`GET /users/${alice.id}/calendars/${work.id}/events`]: () =>
          Response.json(
            { error: { code: 'range_too_large', message: 'x' } },
            { status: 400 },
          ),
      }),
    );
    await renderApp(`/users/${alice.id}/content`);

    expect(
      await screen.findByText('The time range is too long.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('shows event text as text, never as markup', async () => {
    await open({
      [`GET /users/${alice.id}/calendars/${work.id}/events`]: () =>
        Response.json({
          events: [
            at(30, '<img src=x onerror=alert(1)>Evil', '14T13:00', '14T14:00'),
          ],
          truncated: false,
          skipped: 0,
        }),
    }).catch(() => undefined);

    const evil = await screen.findByLabelText(/Evil, /);
    expect(evil.textContent).toContain('<img src=x onerror=alert(1)>Evil');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    void heading;
  });
});
