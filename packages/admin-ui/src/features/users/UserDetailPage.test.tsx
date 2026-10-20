import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminMe,
  apiError,
  baseRoutes,
  renderApp,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const GB = 1024 ** 3;
const alice = user({ quotaLimitBytes: 5 * GB, quotaUsedBytes: 2 * GB });
const me = { ...adminMe, id: '00000000-0000-4000-8000-0000000000a1' };
const groupId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const detailRoutes = (extra: Routes = {}, who: object = me): Routes => ({
  ...baseRoutes(who),
  [`GET /users/${alice.id}`]: () => Response.json(alice),
  [`GET /users/${alice.id}/groups`]: () =>
    Response.json({
      groups: [
        {
          id: groupId(1),
          name: 'Company',
          description: 'Everyone',
          direct: false,
          via: ['Team'],
        },
        {
          id: groupId(2),
          name: 'Team',
          description: null,
          direct: true,
          via: [],
        },
      ],
    }),
  'GET /users': () => Response.json({ users: [alice], total: 1 }),
  ...extra,
});

async function open(routes: Routes = detailRoutes()) {
  signedInAs();
  const calls = stubApi(routes);
  await renderApp(`/users/${alice.id}`);
  await screen.findByRole('heading', { name: 'alice' });
  return { calls, user: userEvent.setup() };
}

describe('user detail page', () => {
  it('shows the account, the storage and the role', async () => {
    await open();

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Member').length).toBeGreaterThan(0);
    expect(screen.getByText('2 GB / 5 GB')).toBeInTheDocument();
  });

  it('lists the groups, marking direct membership and the way in', async () => {
    await open();

    const team = (await screen.findByText('Team')).closest('tr') as HTMLElement;
    expect(within(team).getByText('Direct member')).toBeInTheDocument();
    const company = screen.getByText('Company').closest('tr') as HTMLElement;
    expect(within(company).getByText('Via Team')).toBeInTheDocument();
    expect(
      within(company).queryByText('Direct member'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute(
      'href',
      `/groups/${groupId(2)}`,
    );
  });

  it('says so when the user is in no group', async () => {
    await open(
      detailRoutes({
        [`GET /users/${alice.id}/groups`]: () => Response.json({ groups: [] }),
      }),
    );

    expect(
      await screen.findByText('This user is not a member of any group.'),
    ).toBeInTheDocument();
  });

  it('shows "not found" for an unknown user', async () => {
    signedInAs();
    stubApi(
      detailRoutes({
        [`GET /users/${alice.id}`]: () => apiError(404, 'user_not_found'),
      }),
    );
    await renderApp(`/users/${alice.id}`);

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('is reached from the user list', async () => {
    signedInAs();
    stubApi(detailRoutes());
    await renderApp('/users');

    expect(await screen.findByRole('link', { name: 'alice' })).toHaveAttribute(
      'href',
      `/users/${alice.id}`,
    );
  });

  it('edits the user and refreshes the page', async () => {
    const { calls, user: u } = await open(
      detailRoutes({
        [`PATCH /users/${alice.id}`]: () => Response.json(alice),
      }),
    );

    await u.click(screen.getByRole('button', { name: /Edit$/ }));
    const dialog = await screen.findByRole('dialog');
    const email = within(dialog).getByLabelText('E-mail');
    await u.clear(email);
    await u.type(email, 'new@example.com');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('User saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      email: 'new@example.com',
    });
  });

  it('changes the storage limit', async () => {
    const { calls, user: u } = await open(
      detailRoutes({
        [`PATCH /users/${alice.id}`]: () => Response.json(alice),
      }),
    );

    await u.click(screen.getByRole('button', { name: /Change limit/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('switch', { name: 'Unlimited' }));
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Limit saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      quotaLimitBytes: null,
    });
  });

  it('resets the password', async () => {
    const { calls, user: u } = await open(
      detailRoutes({
        [`POST /users/${alice.id}/password`]: () =>
          new Response(null, { status: 204 }),
      }),
    );

    await u.click(screen.getByRole('button', { name: /Reset password/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('New password'), 'fresh');
    await u.type(within(dialog).getByLabelText('Repeat the password'), 'fresh');
    await u.click(
      within(dialog).getByRole('button', { name: 'Reset password' }),
    );

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      password: 'fresh',
    });
  });

  it('deletes the user after the name is typed and returns to the list', async () => {
    const { calls, user: u } = await open(
      detailRoutes({
        [`DELETE /users/${alice.id}`]: () =>
          new Response(null, { status: 204 }),
      }),
    );

    await u.click(screen.getByRole('button', { name: /^delete Delete$/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Confirmation'), 'alice');
    await u.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('User deleted.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({
      confirmUsername: 'alice',
    });
    expect(
      await screen.findByRole('heading', { name: 'Users' }),
    ).toBeInTheDocument();
  });

  it('does not let an administrator delete themselves', async () => {
    signedInAs();
    stubApi(detailRoutes({}, { ...adminMe, id: alice.id, username: 'alice' }));
    await renderApp(`/users/${alice.id}`);
    await screen.findByRole('heading', { name: 'alice' });

    expect(
      screen.getByRole('button', { name: /^delete Delete$/ }),
    ).toBeDisabled();
  });

  it('links to calendars and contacts only when the server allows it', async () => {
    await open();
    expect(
      screen.queryByRole('link', { name: /Calendars and contacts/ }),
    ).not.toBeInTheDocument();
  });

  it('offers the calendars and contacts when the content view is on', async () => {
    signedInAs();
    stubApi(detailRoutes({}, { ...me, capabilities: { contentView: true } }));
    await renderApp(`/users/${alice.id}`);

    expect(
      await screen.findByRole('link', { name: /Calendars and contacts/ }),
    ).toHaveAttribute('href', `/users/${alice.id}/content`);
  });
});
