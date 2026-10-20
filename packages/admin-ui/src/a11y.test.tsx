import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessibilityProblems } from './test/axe';
import {
  baseRoutes,
  renderApp,
  serverAdminMe,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from './test/render';

afterEach(() => vi.unstubAllGlobals());

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GB = 1024 ** 3;
const me = {
  ...serverAdminMe,
  capabilities: { contentView: true, logView: true },
};
const alice = user({
  id: id(2),
  principalId: id(22),
  quotaLimitBytes: 5 * GB,
  quotaUsedBytes: 4 * GB,
});
const boss = user({
  id: '00000000-0000-4000-8000-000000000001',
  username: 'boss',
  role: 'server_admin',
});
const group = {
  id: id(3),
  principalId: id(33),
  name: 'Sales',
  description: 'The sales team',
};
const tenant = {
  id: id(4),
  slug: 'acme',
  name: 'Acme Corp',
  quotaLimitBytes: 10 * GB,
  quotaUsedBytes: 2 * GB,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const start = dayjs().startOf('day').add(9, 'hour');
const event = {
  objectId: id(5),
  uid: 'standup@test',
  name: 'standup.ics',
  summary: 'Standup',
  location: 'Room 1',
  description: 'Daily sync',
  start: start.toISOString(),
  end: start.add(1, 'hour').toISOString(),
  isAllDay: false,
  isRecurring: true,
  isOverride: false,
  status: null,
  transparency: 'opaque',
};
const contact = {
  id: id(6),
  uid: 'ada1',
  name: 'ada.vcf',
  displayName: 'Ada Lovelace',
  organization: 'Analytical Engines',
  title: null,
  emails: [{ value: 'ada@analytical.example', types: ['work'] }],
  phones: [],
  addresses: [],
  birthday: null,
  notes: null,
  hasPhoto: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const routes: Routes = {
  ...baseRoutes(me),
  'GET /users': () => Response.json({ users: [boss, alice], total: 2 }),
  [`GET /users/${alice.id}`]: () => Response.json(alice),
  [`GET /users/${alice.id}/groups`]: () =>
    Response.json({
      groups: [
        {
          id: group.id,
          name: 'Sales',
          description: 'The sales team',
          direct: true,
          via: [],
        },
        {
          id: id(9),
          name: 'Company',
          description: null,
          direct: false,
          via: ['Sales'],
        },
      ],
    }),
  'GET /logs': () =>
    Response.json({
      entries: [
        {
          seq: 2,
          timestamp: '2026-10-21T10:00:00.000Z',
          level: 'warn',
          message: 'slow request',
          fields: { method: 'GET', path: '/dav/acme/files', status: 200 },
        },
        {
          seq: 1,
          timestamp: '2026-10-21T09:59:00.000Z',
          level: 'info',
          message: 'request completed',
          fields: {},
        },
      ],
      newest: 2,
      buffered: 2,
      capacity: 2000,
    }),
  'GET /groups': () => Response.json({ groups: [group], total: 1 }),
  [`GET /groups/${group.id}`]: () => Response.json(group),
  [`GET /groups/${group.id}/members`]: () =>
    Response.json({
      members: [{ principalId: id(22), kind: 'user', name: 'alice' }],
    }),
  [`GET /groups/${group.id}/members/effective`]: () =>
    Response.json({ members: [] }),
  'GET /quota': () =>
    Response.json({
      tenant: {
        id: tenant.id,
        slug: 'acme',
        quotaLimitBytes: 10 * GB,
        quotaUsedBytes: 2 * GB,
      },
      users: [
        {
          id: alice.id,
          username: 'alice',
          quotaLimitBytes: 5 * GB,
          quotaUsedBytes: 4 * GB,
        },
      ],
    }),
  'GET /tenants': () => Response.json({ tenants: [tenant], total: 1 }),
  [`GET /users/${alice.id}/calendars`]: () =>
    Response.json({
      calendars: [
        {
          id: id(7),
          name: 'work',
          displayName: 'Work',
          description: null,
          timezone: null,
          objectCount: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  [`GET /users/${alice.id}/calendars/${id(7)}/events`]: () =>
    Response.json({ events: [event], truncated: false, skipped: 0 }),
  [`GET /users/${alice.id}/addressbooks`]: () =>
    Response.json({
      addressbooks: [
        {
          id: id(8),
          displayName: 'Contacts',
          description: null,
          contactCount: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  [`GET /users/${alice.id}/addressbooks/${id(8)}/contacts`]: () =>
    Response.json({ contacts: [contact], total: 1 }),
};

const PAGES: { name: string; path: string; ready: string | RegExp }[] = [
  { name: 'overview', path: '/', ready: 'Your account' },
  { name: 'users', path: '/users', ready: 'alice' },
  { name: 'user detail', path: `/users/${alice.id}`, ready: 'Direct member' },
  { name: 'server log', path: '/logs', ready: 'slow request' },
  { name: 'groups', path: '/groups', ready: 'Sales' },
  {
    name: 'group detail',
    path: `/groups/${group.id}`,
    ready: 'Direct members (1)',
  },
  { name: 'storage', path: '/quota', ready: '2 GB / 10 GB' },
  { name: 'tenants', path: '/tenants', ready: 'Acme Corp' },
  { name: 'calendar', path: `/users/${alice.id}/content`, ready: 'Standup' },
  { name: 'forbidden page', path: '/nope', ready: 'Page not found' },
];

describe.each(['light', 'dark'] as const)(
  'accessibility in the %s theme',
  (theme) => {
    const open = async (path: string, ready: string | RegExp) => {
      window.localStorage.setItem('davnode.theme', theme);
      signedInAs();
      stubApi(routes);
      await renderApp(path);
      await screen.findAllByText(ready);
    };

    it('has no violations on the login page', async () => {
      window.localStorage.setItem('davnode.theme', theme);
      stubApi({});
      await renderApp('/login');
      await screen.findByRole('button', { name: 'Sign in' });

      expect(await accessibilityProblems()).toEqual([]);
    });

    it.each(PAGES)(
      'has no violations on the $name page',
      async ({ path, ready }) => {
        await open(path, ready);

        expect(await accessibilityProblems()).toEqual([]);
      },
    );

    it('has no violations on the contacts tab', async () => {
      await open(`/users/${alice.id}/content`, 'Standup');
      await userEvent
        .setup()
        .click(screen.getByRole('tab', { name: 'Contacts' }));
      await screen.findByText('Ada Lovelace');

      expect(await accessibilityProblems()).toEqual([]);
    });

    it('has no violations in the contact drawer with its business card', async () => {
      await open(`/users/${alice.id}/content`, 'Standup');
      const u = userEvent.setup();
      await u.click(screen.getByRole('tab', { name: 'Contacts' }));
      await u.click(await screen.findByText('Ada Lovelace'));
      await screen.findByRole('article', { name: 'Business card' });

      expect(await accessibilityProblems()).toEqual([]);
    });

    it('has no violations in the create-user dialog', async () => {
      await open('/users', 'alice');
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /New user/ }));
      await screen.findByRole('dialog');

      expect(await accessibilityProblems()).toEqual([]);
    });

    it('has no violations in the delete confirmation', async () => {
      await open('/users', 'alice');
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Delete alice' }));
      await screen.findByRole('dialog');

      expect(await accessibilityProblems()).toEqual([]);
    });

    it('has no violations in the event drawer', async () => {
      await open(`/users/${alice.id}/content`, 'Standup');
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Details: Standup' }));
      await screen.findByRole('dialog');

      expect(await accessibilityProblems()).toEqual([]);
    });
  },
);

describe('language of the page', () => {
  it.each([
    ['en', 'en'],
    ['de', 'de'],
  ])(
    'sets lang="%s" when the UI is in that language',
    async (language, expected) => {
      stubApi({});
      const { initI18n } = await import('./i18n');
      await renderApp('/login');
      await initI18n().changeLanguage(language);

      expect(document.documentElement.lang).toBe(expected);
    },
  );
});
