import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../api/client';
import {
  adminMe,
  apiError,
  baseRoutes,
  chooseOption,
  renderApp,
  serverAdminMe,
  signedInAs,
  stubApi,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const withLogs = {
  ...serverAdminMe,
  capabilities: { contentView: false, logView: true },
};

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  seq: 3,
  timestamp: '2026-10-21T10:15:30.000Z',
  level: 'info',
  message: 'request completed',
  fields: {
    method: 'GET',
    path: '/dav/acme/files',
    status: 200,
    durationMs: 12.4,
  },
  ...over,
});

const page = (entries: LogEntry[], over: object = {}) => ({
  entries,
  newest: entries[0]?.seq ?? 0,
  buffered: 40,
  capacity: 2000,
  ...over,
});

const logRoutes = (entries: LogEntry[], extra: Routes = {}): Routes => ({
  ...baseRoutes(withLogs),
  'GET /logs': () => Response.json(page(entries)),
  ...extra,
});

async function open(routes: Routes) {
  signedInAs();
  const calls = stubApi(routes);
  await renderApp('/logs');
  await screen.findByRole('heading', { name: 'Server log' });
  return { calls, user: userEvent.setup() };
}

describe('log page', () => {
  it('lists the lines with time, level, message and the request summary', async () => {
    await open(
      logRoutes([
        entry(),
        entry({ seq: 2, level: 'warn', message: 'slow', fields: {} }),
      ]),
    );

    const row = (await screen.findByText('request completed')).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByText('info')).toBeInTheDocument();
    expect(
      within(row).getByText('GET /dav/acme/files 200 12 ms'),
    ).toBeInTheDocument();
    expect(screen.getByText('slow').closest('tr')).toHaveTextContent('warn');
  });

  it('says how much of the buffer it shows', async () => {
    await open(logRoutes([entry()]));

    expect(
      await screen.findByText(
        /Showing 1 of 40 lines in the buffer, which keeps at most 2000/,
      ),
    ).toBeInTheDocument();
  });

  it('asks for info and above, the latest 200, to begin with', async () => {
    const { calls } = await open(logRoutes([entry()]));

    expect(calls.find((c) => c.path === '/logs')?.full).toBe(
      '/logs?level=info&limit=200',
    );
  });

  it('asks again when the level is changed', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));

    await u.click(screen.getByRole('combobox', { name: 'Level' }));
    await chooseOption(u, 'Errors');

    await waitFor(() =>
      expect(calls.some((c) => c.full.includes('level=error'))).toBe(true),
    );
  });

  it('searches on the server', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));

    await u.type(
      screen.getByRole('textbox', { name: 'Search the log' }),
      'acme',
    );

    await waitFor(() =>
      expect(calls.some((c) => c.full.includes('q=acme'))).toBe(true),
    );
  });

  it('filters for reads of user data with one click', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));

    await u.click(screen.getByRole('button', { name: 'Reads of user data' }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.full.includes('q=Admin+read+user+content')),
      ).toBe(true),
    );
    expect(screen.getByRole('textbox', { name: 'Search the log' })).toHaveValue(
      'Admin read user content',
    );
  });

  it('asks for more or fewer lines', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));

    await u.click(screen.getByRole('combobox', { name: 'How many lines' }));
    await chooseOption(u, 'Latest 500');

    await waitFor(() =>
      expect(calls.some((c) => c.full.includes('limit=500'))).toBe(true),
    );
  });

  it('refreshes on request', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));
    const before = calls.filter((c) => c.path === '/logs').length;

    await u.click(screen.getByRole('button', { name: /Refresh/ }));

    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/logs').length).toBeGreaterThan(
        before,
      ),
    );
  });

  it('shows all fields of a line when it is opened, as text', async () => {
    const { user: u } = await open(
      logRoutes([
        entry({
          fields: {
            err: { type: 'Error', stack: 'Error: boom\n  at x' },
            note: '<b>bold</b>',
          },
        }),
      ]),
    );

    await u.click(await screen.findByRole('button', { name: /Expand row/ }));

    expect(await screen.findByText('<b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('td b')).toBeNull();
    expect(screen.getByText(/"stack": "Error: boom/)).toBeInTheDocument();
  });

  it('says so when no line matches', async () => {
    await open(logRoutes([]));

    expect(await screen.findByText('No lines match.')).toBeInTheDocument();
  });

  it('keeps asking in live mode', async () => {
    const { calls, user: u } = await open(logRoutes([entry()]));
    const before = calls.filter((c) => c.path === '/logs').length;

    await u.click(screen.getByRole('switch', { name: 'Live' }));

    await waitFor(
      () =>
        expect(calls.filter((c) => c.path === '/logs').length).toBeGreaterThan(
          before,
        ),
      { timeout: 6000 },
    );
  });

  it('shows a failure with a retry', async () => {
    await open(
      logRoutes([], { 'GET /logs': () => apiError(403, 'insufficient_role') }),
    );

    expect(
      await screen.findByText('This requires a higher role.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});

describe('access to the log page', () => {
  it('has a menu entry for a server administrator when the server has the log view', async () => {
    signedInAs();
    stubApi(logRoutes([entry()]));
    await renderApp('/');
    // The window is narrow here, so the menu sits in a drawer.
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Menu' }));

    expect(
      await screen.findByRole('menuitem', { name: /Server log/ }),
    ).toBeInTheDocument();
  });

  it('has no menu entry when the server has not', async () => {
    signedInAs();
    stubApi(baseRoutes(serverAdminMe));
    await renderApp('/');
    await screen.findByText('Your account');

    expect(
      screen.queryByRole('menuitem', { name: /Server log/ }),
    ).not.toBeInTheDocument();
  });

  it('says it is not enabled when the address is opened anyway', async () => {
    signedInAs();
    const calls = stubApi(baseRoutes(serverAdminMe));
    await renderApp('/logs');

    expect(await screen.findByText('Not enabled')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/logs')).toBe(false);
  });

  it('is closed to a tenant administrator', async () => {
    signedInAs();
    stubApi(
      baseRoutes({
        ...adminMe,
        capabilities: { contentView: false, logView: true },
      }),
    );
    await renderApp('/logs');

    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
  });
});
