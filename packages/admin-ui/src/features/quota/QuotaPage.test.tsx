import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminMe,
  baseRoutes,
  renderApp,
  serverAdminMe,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const GB = 1024 ** 3;
const overview = (over: object = {}) => ({
  tenant: {
    id: '00000000-0000-4000-8000-0000000000e1',
    slug: 'acme',
    quotaLimitBytes: 10 * GB,
    quotaUsedBytes: 2 * GB,
  },
  users: [
    {
      id: '00000000-0000-4000-8000-0000000000a1',
      username: 'boss',
      quotaLimitBytes: null,
      quotaUsedBytes: GB,
    },
    {
      id: '00000000-0000-4000-8000-0000000000a2',
      username: 'alice',
      quotaLimitBytes: 5 * GB,
      quotaUsedBytes: 4 * GB,
    },
  ],
  ...over,
});

const quotaRoutes = (me: object, extra: Routes = {}): Routes => ({
  ...baseRoutes(me),
  'GET /quota': () => Response.json(overview()),
  ...extra,
});

describe('quota page', () => {
  it('shows the tenant and every user with usage and limit', async () => {
    signedInAs();
    stubApi(quotaRoutes(adminMe));
    await renderApp('/quota');

    expect(await screen.findByText('2 GB / 10 GB')).toBeInTheDocument();
    const alice = screen.getByText('alice').closest('tr') as HTMLElement;
    expect(within(alice).getByText('4 GB / 5 GB')).toBeInTheDocument();
    const boss = screen.getByText('boss').closest('tr') as HTMLElement;
    expect(within(boss).getByText('(Unlimited)')).toBeInTheDocument();
  });

  it('lets only a server administrator change the tenant limit', async () => {
    signedInAs();
    stubApi(quotaRoutes(adminMe));
    await renderApp('/quota');
    await screen.findByText('2 GB / 10 GB');
    expect(
      screen.queryByRole('button', { name: /^edit Change limit$/ }),
    ).not.toBeInTheDocument();
  });

  it('changes the tenant limit', async () => {
    signedInAs();
    const calls = stubApi(
      quotaRoutes(serverAdminMe, {
        'PATCH /quota': () =>
          Response.json(
            overview({
              tenant: {
                id: '00000000-0000-4000-8000-0000000000e1',
                slug: 'acme',
                quotaLimitBytes: 20 * GB,
                quotaUsedBytes: 2 * GB,
              },
            }),
          ),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/quota');
    await screen.findByText('2 GB / 10 GB');

    await u.click(screen.getByRole('button', { name: /^edit Change limit$/ }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount' });
    await u.clear(amount);
    await u.type(amount, '20');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Limit saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      quotaLimitBytes: 20 * GB,
    });
    expect(await screen.findByText('2 GB / 20 GB')).toBeInTheDocument();
  });

  it('removes the limit of a user', async () => {
    signedInAs();
    const calls = stubApi(
      quotaRoutes(adminMe, {
        'PATCH /users/00000000-0000-4000-8000-0000000000a2': () =>
          Response.json(user({ quotaLimitBytes: null })),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/quota');
    await screen.findByText('alice');

    await u.click(screen.getByRole('button', { name: 'Change limit alice' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('switch', { name: 'Unlimited' }));
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Limit saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      quotaLimitBytes: null,
    });
  });

  it('recounts and shows the corrected figures', async () => {
    signedInAs();
    let recounted = false;
    stubApi(
      quotaRoutes(adminMe, {
        'GET /quota': () =>
          Response.json(
            recounted
              ? overview({
                  tenant: {
                    id: '00000000-0000-4000-8000-0000000000e1',
                    slug: 'acme',
                    quotaLimitBytes: 10 * GB,
                    quotaUsedBytes: 3 * GB,
                  },
                })
              : overview(),
          ),
        'POST /quota/recompute': () => {
          recounted = true;
          return Response.json(
            overview({
              tenant: {
                id: '00000000-0000-4000-8000-0000000000e1',
                slug: 'acme',
                quotaLimitBytes: 10 * GB,
                quotaUsedBytes: 3 * GB,
              },
            }),
          );
        },
      }),
    );
    const u = userEvent.setup();
    await renderApp('/quota');
    await screen.findByText('2 GB / 10 GB');

    await u.click(screen.getByRole('button', { name: /Recount/ }));

    expect(await screen.findByText('Storage recounted.')).toBeInTheDocument();
    expect(await screen.findByText('3 GB / 10 GB')).toBeInTheDocument();
  });
});
