import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  baseRoutes,
  chooseOption,
  renderApp,
  signedInAs,
  stubApi,
  user,
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const sales = {
  id: '00000000-0000-4000-8000-0000000000c1',
  principalId: '00000000-0000-4000-8000-0000000000d1',
  name: 'Sales',
  description: 'The sales team',
};
const support = {
  id: '00000000-0000-4000-8000-0000000000c2',
  principalId: '00000000-0000-4000-8000-0000000000d2',
  name: 'Support',
  description: null,
};

const groupRoutes = (extra: Routes = {}): Routes => ({
  ...baseRoutes(),
  'GET /groups': () => Response.json({ groups: [sales, support], total: 2 }),
  ...extra,
});

describe('groups page', () => {
  it('lists the groups and links each to its members', async () => {
    signedInAs();
    stubApi(groupRoutes());
    await renderApp('/groups');

    const link = await screen.findByRole('link', { name: /Sales/ });
    expect(link).toHaveAttribute(
      'href',
      '/groups/00000000-0000-4000-8000-0000000000c1',
    );
  });

  it('creates a group', async () => {
    signedInAs();
    const calls = stubApi(
      groupRoutes({
        'POST /groups': () => Response.json(sales, { status: 201 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/groups');
    await screen.findByText('Sales');

    await u.click(screen.getByRole('button', { name: /New group/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Name'), 'Dev');
    await u.type(within(dialog).getByLabelText('Description'), 'Developers');
    await u.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Group created.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Dev',
      description: 'Developers',
    });
  });

  it('requires a name', async () => {
    signedInAs();
    const calls = stubApi(groupRoutes());
    const u = userEvent.setup();
    await renderApp('/groups');
    await screen.findByText('Sales');

    await u.click(screen.getByRole('button', { name: /New group/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('deletes a group after a plain confirmation', async () => {
    signedInAs();
    const calls = stubApi(
      groupRoutes({
        'DELETE /groups/00000000-0000-4000-8000-0000000000c2': () =>
          new Response(null, { status: 204 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/groups');
    await screen.findByText('Support');

    await u.click(screen.getByRole('button', { name: 'Delete Support' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Group deleted.')).toBeInTheDocument();
    expect(
      calls.some(
        (c) =>
          c.method === 'DELETE' &&
          c.path === '/groups/00000000-0000-4000-8000-0000000000c2',
      ),
    ).toBe(true);
  });
});

describe('group detail page', () => {
  const alice = user();
  const detail = (extra: Routes = {}): Routes => ({
    ...baseRoutes(),
    'GET /groups/00000000-0000-4000-8000-0000000000c1': () =>
      Response.json(sales),
    'GET /groups/00000000-0000-4000-8000-0000000000c1/members': () =>
      Response.json({
        members: [
          {
            principalId: '00000000-0000-4000-8000-0000000000b9',
            kind: 'user',
            name: 'bob',
          },
        ],
      }),
    'GET /groups/00000000-0000-4000-8000-0000000000c1/members/effective': () =>
      Response.json({
        members: [
          {
            principalId: '00000000-0000-4000-8000-0000000000b9',
            kind: 'user',
            name: 'bob',
          },
          {
            principalId: '00000000-0000-4000-8000-0000000000b8',
            kind: 'user',
            name: 'carol',
          },
        ],
      }),
    'GET /users': () => Response.json({ users: [alice], total: 1 }),
    'GET /groups': () => Response.json({ groups: [sales, support], total: 2 }),
    ...extra,
  });

  it('shows the direct members and, on the other tab, all members', async () => {
    signedInAs();
    stubApi(detail());
    const u = userEvent.setup();
    await renderApp('/groups/00000000-0000-4000-8000-0000000000c1');

    expect(
      await screen.findByRole('heading', { name: 'Sales' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('carol')).not.toBeInTheDocument();

    await u.click(screen.getByRole('tab', { name: /All members/ }));

    expect(await screen.findByText('carol')).toBeInTheDocument();
  });

  it('adds a user as a member, offering users and other groups but not the group itself', async () => {
    signedInAs();
    const calls = stubApi(
      detail({
        'POST /groups/00000000-0000-4000-8000-0000000000c1/members': () =>
          new Response(null, { status: 204 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/groups/00000000-0000-4000-8000-0000000000c1');
    await screen.findByText('bob');

    await u.click(screen.getByRole('combobox', { name: 'Add a member' }));
    expect(
      await screen.findByRole('option', { name: 'Support (Group)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Sales (Group)' }),
    ).not.toBeInTheDocument();
    await chooseOption(u, 'alice (User)');
    await u.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Member added.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      principalId: '00000000-0000-4000-8000-0000000000b2',
    });
  });

  it('explains a membership cycle', async () => {
    signedInAs();
    stubApi(
      detail({
        'POST /groups/00000000-0000-4000-8000-0000000000c1/members': () =>
          Response.json(
            { error: { code: 'cycle_detected', message: 'x' } },
            { status: 409 },
          ),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/groups/00000000-0000-4000-8000-0000000000c1');
    await screen.findByText('bob');

    await u.click(screen.getByRole('combobox', { name: 'Add a member' }));
    await chooseOption(u, 'Support (Group)');
    await u.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('That would make a group a member of itself.'),
    ).toBeInTheDocument();
  });

  it('removes a member', async () => {
    signedInAs();
    const calls = stubApi(
      detail({
        'DELETE /groups/00000000-0000-4000-8000-0000000000c1/members/00000000-0000-4000-8000-0000000000b9':
          () => new Response(null, { status: 204 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/groups/00000000-0000-4000-8000-0000000000c1');
    await screen.findByText('bob');

    await u.click(
      screen.getByRole('button', { name: 'Remove from group bob' }),
    );

    expect(await screen.findByText('Member removed.')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
  });

  it('shows "not found" for a group that does not exist', async () => {
    signedInAs();
    stubApi({
      ...detail(),
      'GET /groups/00000000-0000-4000-8000-0000000000c1': () =>
        new Response(null, { status: 404 }),
    });
    await renderApp('/groups/00000000-0000-4000-8000-0000000000c1');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
