import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { basicAuthorization } from './api/client';
import { adminMe, providers, renderApp, stubApi } from './test/render';

afterEach(() => vi.unstubAllGlobals());

async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  password = 'pw',
) {
  await user.type(await screen.findByLabelText('Tenant'), 'acme');
  await user.type(screen.getByLabelText('Username'), 'boss');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login', () => {
  it('sends anonymous visitors to the login form', async () => {
    stubApi({});

    await renderApp('/');

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('signs in with the credentials as a Basic header and shows the overview', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });
    await renderApp('/login');

    await signIn(user);

    expect(await screen.findByText('Your account')).toBeInTheDocument();
    expect(screen.getByText('boss@example.com')).toBeInTheDocument();
    expect(screen.getByText('Tenant administrator')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: basicAuthorization('boss', 'pw'),
    });
    expect(
      JSON.parse(window.sessionStorage.getItem('davnode.session') ?? '{}'),
    ).toMatchObject({
      tenantSlug: 'acme',
      username: 'boss',
    });
    expect(window.localStorage.getItem('davnode.lastTenant')).toBe('acme');
  });

  it('never stores the password itself', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });
    await renderApp('/login');

    await signIn(user, 'sup3r-secret');
    await screen.findByText('Your account');

    const stored =
      JSON.stringify({ ...window.sessionStorage }) +
      JSON.stringify({ ...window.localStorage });
    expect(stored).not.toContain('sup3r-secret');
  });

  it('explains wrong credentials and stores nothing', async () => {
    const user = userEvent.setup();
    stubApi({ 'GET /me': () => new Response(null, { status: 401 }) });
    await renderApp('/login');

    await signIn(user, 'wrong');

    expect(
      await screen.findByText('The username or password is wrong.'),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('davnode.session')).toBeNull();
  });

  it('explains the rate limit', async () => {
    const user = userEvent.setup();
    stubApi({ 'GET /me': () => new Response(null, { status: 429 }) });
    await renderApp('/login');

    await signIn(user);

    expect(
      await screen.findByText(/Too many failed attempts/),
    ).toBeInTheDocument();
  });

  it('requires all three fields', async () => {
    const user = userEvent.setup();
    const calls = stubApi({});
    await renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your tenant')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('session', () => {
  it('resumes a session remembered by the tab after the server confirms it', async () => {
    window.sessionStorage.setItem(
      'davnode.session',
      JSON.stringify({
        tenantSlug: 'acme',
        username: 'boss',
        authorization: 'Basic x',
      }),
    );
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });

    await renderApp('/');

    expect(await screen.findByText('Your account')).toBeInTheDocument();
  });

  it('drops a remembered session the server rejects', async () => {
    window.sessionStorage.setItem(
      'davnode.session',
      JSON.stringify({
        tenantSlug: 'acme',
        username: 'boss',
        authorization: 'Basic x',
      }),
    );
    stubApi({ 'GET /me': () => new Response(null, { status: 401 }) });

    await renderApp('/');

    expect(
      await screen.findByText('Your session has ended. Please sign in again.'),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('davnode.session')).toBeNull();
  });

  it('ends the session when a later call answers 401', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => new Response(null, { status: 401 }),
    });
    await renderApp('/login');

    await signIn(user);

    expect(
      await screen.findByText('Your session has ended. Please sign in again.'),
    ).toBeInTheDocument();
  });

  it('logs out on request', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });
    await renderApp('/login');
    await signIn(user);
    await screen.findByText('Your account');

    await user.click(screen.getByRole('button', { name: /boss/ }));
    await user.click(await screen.findByText('Log out'));

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('davnode.session')).toBeNull();
  });
});

describe('roles', () => {
  const sessionFor = () =>
    window.sessionStorage.setItem(
      'davnode.session',
      JSON.stringify({
        tenantSlug: 'acme',
        username: 'boss',
        authorization: 'Basic x',
      }),
    );

  it('shows a member that the area is for administrators only', async () => {
    sessionFor();
    stubApi({ 'GET /me': () => Response.json({ ...adminMe, role: 'member' }) });

    await renderApp('/');

    expect(
      await screen.findByText('No administrator rights'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });

  it.each([
    ['server_admin', 'Server administrator'],
    ['tenant_admin', 'Tenant administrator'],
  ])('lets a %s in', async (role, label) => {
    sessionFor();
    stubApi({
      'GET /me': () => Response.json({ ...adminMe, role }),
      'GET /providers': () => Response.json(providers),
    });

    await renderApp('/');

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('shows 404 for an unknown page inside the shell', async () => {
    sessionFor();
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });

    await renderApp('/nope');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

describe('overview', () => {
  it('lists the providers with their state and the trusted issuers', async () => {
    window.sessionStorage.setItem(
      'davnode.session',
      JSON.stringify({
        tenantSlug: 'acme',
        username: 'boss',
        authorization: 'Basic x',
      }),
    );
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => Response.json(providers),
    });

    await renderApp('/');

    const basic = (await screen.findByText('Basic (password)'))
      .parentElement as HTMLElement;
    expect(within(basic).getByText('Enabled')).toBeInTheDocument();
    const digest = screen.getByText('Digest').parentElement as HTMLElement;
    expect(within(digest).getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('https://id.example.com')).toBeInTheDocument();
  });

  it('shows a retry when the providers cannot be loaded', async () => {
    window.sessionStorage.setItem(
      'davnode.session',
      JSON.stringify({
        tenantSlug: 'acme',
        username: 'boss',
        authorization: 'Basic x',
      }),
    );
    stubApi({
      'GET /me': () => Response.json(adminMe),
      'GET /providers': () => new Response(null, { status: 500 }),
    });

    await renderApp('/');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Try again' }),
      ).toBeInTheDocument(),
    );
  });
});
