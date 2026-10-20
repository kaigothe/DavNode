import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminMe,
  apiError,
  baseRoutes,
  renderApp,
  serverAdminMe,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const boss = user({
  id: 'u1',
  principalId: 'p1',
  username: 'boss',
  email: 'boss@example.com',
  role: 'tenant_admin',
});
const alice = user();
const root = user({ id: 'u3', username: 'root', role: 'server_admin' });

const withUsers = (
  users: object[],
  extra: Routes = {},
  me: object = adminMe,
): Routes => ({
  ...baseRoutes(me),
  'GET /users': () => Response.json({ users, total: users.length }),
  ...extra,
});

async function open(routes: Routes, waitFor = 'alice') {
  signedInAs();
  const calls = stubApi(routes);
  await renderApp('/users');
  await screen.findByText(waitFor);
  return { calls, user: userEvent.setup() };
}

describe('users page', () => {
  it('lists the users with their role, and marks the signed-in one', async () => {
    await open(withUsers([boss, alice]));

    const row = screen.getByText('boss').closest('tr') as HTMLElement;
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).getByText('Tenant administrator')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Delete boss' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete alice' })).toBeEnabled();
  });

  it('searches on the server and starts at the first page', async () => {
    const { calls, user: u } = await open(withUsers([boss, alice]));

    await u.type(
      screen.getByRole('textbox', { name: 'Search by name or e-mail' }),
      'ali',
    );

    await waitFor(() =>
      expect(calls.some((c) => c.full.includes('q=ali'))).toBe(true),
    );
    expect(calls.find((c) => c.full.includes('q=ali'))?.full).toContain(
      'offset=0',
    );
  });

  it('shows a retry when the list cannot be loaded', async () => {
    signedInAs();
    stubApi({
      ...baseRoutes(),
      'GET /users': () => new Response(null, { status: 500 }),
    });
    await renderApp('/users');

    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  describe('creating', () => {
    it('sends the new user and refreshes the list', async () => {
      const { calls, user: u } = await open(
        withUsers([boss, alice], {
          'POST /users': () =>
            Response.json(user({ username: 'carol' }), { status: 201 }),
        }),
      );

      await u.click(screen.getByRole('button', { name: /New user/ }));
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Username'), 'carol');
      await u.type(
        within(dialog).getByLabelText('E-mail'),
        'carol@example.com',
      );
      await u.type(within(dialog).getByLabelText('Password'), 'secret');
      await u.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('User created.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        username: 'carol',
        email: 'carol@example.com',
        password: 'secret',
        role: 'member',
      });
      await waitFor(() =>
        expect(
          calls.filter((c) => c.path === '/users' && c.method === 'GET').length,
        ).toBeGreaterThan(1),
      );
    });

    it('checks the fields before asking the server', async () => {
      const { calls, user: u } = await open(withUsers([boss, alice]));

      await u.click(screen.getByRole('button', { name: /New user/ }));
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Username'), 'a:b');
      await u.type(within(dialog).getByLabelText('E-mail'), 'nope');
      await u.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText('Enter a valid e-mail address'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/none of : \//)).toBeInTheDocument();
      expect(
        await within(dialog).findByText('Enter a password'),
      ).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('explains a rejection by the server', async () => {
      const { user: u } = await open(
        withUsers([boss, alice], {
          'POST /users': () => apiError(409, 'duplicate_entry'),
        }),
      );

      await u.click(screen.getByRole('button', { name: /New user/ }));
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Username'), 'alice');
      await u.type(within(dialog).getByLabelText('E-mail'), 'a@example.com');
      await u.type(within(dialog).getByLabelText('Password'), 'x');
      await u.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('That name is already taken.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers a tenant administrator no way to create a server administrator', async () => {
      const { user: u } = await open(withUsers([boss, alice]));

      await u.click(screen.getByRole('button', { name: /New user/ }));
      const dialog = await screen.findByRole('dialog');
      await u.click(within(dialog).getByLabelText('Role'));

      expect(
        await screen.findByRole('option', { name: 'Tenant administrator' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Server administrator' }),
      ).not.toBeInTheDocument();
    });

    it('offers a server administrator every role', async () => {
      const { user: u } = await open(
        withUsers([boss, alice], {}, serverAdminMe),
      );

      await u.click(screen.getByRole('button', { name: /New user/ }));
      const dialog = await screen.findByRole('dialog');
      await u.click(within(dialog).getByLabelText('Role'));

      expect(
        await screen.findByRole('option', { name: 'Server administrator' }),
      ).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('changes the e-mail and the role', async () => {
      const { calls, user: u } = await open(
        withUsers([boss, alice], {
          'PATCH /users/u2': () => Response.json(alice),
        }),
      );

      await u.click(screen.getByRole('button', { name: 'Edit alice' }));
      const dialog = await screen.findByRole('dialog');
      const email = within(dialog).getByLabelText('E-mail');
      await u.clear(email);
      await u.type(email, 'new@example.com');
      await u.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('User saved.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        email: 'new@example.com',
        role: 'member',
        quotaLimitBytes: null,
      });
    });

    it('cannot change the user name', async () => {
      const { user: u } = await open(withUsers([boss, alice]));

      await u.click(screen.getByRole('button', { name: 'Edit alice' }));

      expect(
        await within(await screen.findByRole('dialog')).findByLabelText(
          'Username',
        ),
      ).toBeDisabled();
    });

    it('keeps a tenant administrator away from a server administrator', async () => {
      const { user: u } = await open(withUsers([boss, root]), 'root');

      await u.click(screen.getByRole('button', { name: 'Edit root' }));
      const dialog = await screen.findByRole('dialog');

      expect(
        within(dialog).getByText(/Only a server administrator may change/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Save' }),
      ).toBeDisabled();
    });
  });

  describe('deleting', () => {
    it('needs the user name typed and then sends it as the confirmation', async () => {
      const { calls, user: u } = await open(
        withUsers([boss, alice], {
          'DELETE /users/u2': () => new Response(null, { status: 204 }),
        }),
      );

      await u.click(screen.getByRole('button', { name: 'Delete alice' }));
      const dialog = await screen.findByRole('dialog');
      const confirm = within(dialog).getByRole('button', { name: 'Delete' });
      expect(confirm).toBeDisabled();
      await u.type(within(dialog).getByLabelText('Confirmation'), 'alic');
      expect(confirm).toBeDisabled();
      await u.type(within(dialog).getByLabelText('Confirmation'), 'e');
      await u.click(confirm);

      expect(await screen.findByText('User deleted.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({
        confirmUsername: 'alice',
      });
    });

    it('explains why the last server administrator stays', async () => {
      const { user: u } = await open(
        withUsers(
          [boss, alice],
          { 'DELETE /users/u2': () => apiError(409, 'last_server_admin') },
          serverAdminMe,
        ),
      );

      await u.click(screen.getByRole('button', { name: 'Delete alice' }));
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Confirmation'), 'alice');
      await u.click(within(dialog).getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(/last server administrator/),
      ).toBeInTheDocument();
    });
  });

  describe('resetting a password', () => {
    it('refuses two different passwords', async () => {
      const { calls, user: u } = await open(withUsers([boss, alice]));

      await u.click(
        screen.getByRole('button', { name: 'Reset password alice' }),
      );
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('New password'), 'one');
      await u.type(within(dialog).getByLabelText('Repeat the password'), 'two');
      await u.click(
        within(dialog).getByRole('button', { name: 'Reset password' }),
      );

      expect(
        await within(dialog).findByText('The passwords do not match'),
      ).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('sets the new password', async () => {
      const { calls, user: u } = await open(
        withUsers([boss, alice], {
          'POST /users/u2/password': () => new Response(null, { status: 204 }),
        }),
      );

      await u.click(
        screen.getByRole('button', { name: 'Reset password alice' }),
      );
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('New password'), 'fresh');
      await u.type(
        within(dialog).getByLabelText('Repeat the password'),
        'fresh',
      );
      await u.click(
        within(dialog).getByRole('button', { name: 'Reset password' }),
      );

      expect(await screen.findByText('Password changed.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        password: 'fresh',
      });
    });
  });

  describe('OAuth2 identity', () => {
    it('is offered because the provider is enabled, and links an identity', async () => {
      const { calls, user: u } = await open(
        withUsers([boss, alice], {
          'POST /users/u2/oauth2-link': () =>
            Response.json(
              { issuer: 'https://id.example.com', subject: 's1' },
              { status: 201 },
            ),
        }),
      );

      await u.click(
        screen.getByRole('button', { name: 'OAuth2 identity alice' }),
      );
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Subject'), 'sub-123');
      await u.click(within(dialog).getByRole('button', { name: 'Link' }));

      expect(await screen.findByText('Identity linked.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        issuer: 'https://id.example.com',
        subject: 'sub-123',
      });
    });

    it('is not offered when the provider is off', async () => {
      signedInAs();
      stubApi({
        ...withUsers([boss, alice]),
        'GET /providers': () =>
          Response.json({
            providers: [
              { id: 'basic', enabled: true },
              { id: 'oauth2', enabled: false },
            ],
            oauth2Issuers: [],
          }),
      });
      await renderApp('/users');
      await screen.findByText('alice');

      expect(
        screen.queryByRole('button', { name: 'OAuth2 identity alice' }),
      ).not.toBeInTheDocument();
    });
  });
});
