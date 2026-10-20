import { screen, within } from '@testing-library/react';
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
  type Routes,
} from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const acme = {
  id: 't1',
  slug: 'acme',
  name: 'Acme Corp',
  quotaLimitBytes: null,
  quotaUsedBytes: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const bravo = { ...acme, id: 't2', slug: 'bravo', name: 'Bravo Ltd' };

const tenantRoutes = (extra: Routes = {}): Routes => ({
  ...baseRoutes(serverAdminMe),
  'GET /tenants': () => Response.json({ tenants: [acme, bravo], total: 2 }),
  ...extra,
});

describe('tenants page', () => {
  it('is for server administrators only', async () => {
    signedInAs();
    stubApi(baseRoutes(adminMe));
    await renderApp('/tenants');

    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
  });

  it('does not list the page in the menu of a tenant administrator', async () => {
    signedInAs();
    stubApi(baseRoutes(adminMe));
    await renderApp('/');
    await screen.findByText('Your account');

    expect(
      screen.queryByRole('menuitem', { name: 'Tenants' }),
    ).not.toBeInTheDocument();
  });

  it('lists the tenants and marks the one signed in to', async () => {
    signedInAs();
    stubApi(tenantRoutes());
    await renderApp('/tenants');

    const row = (await screen.findByText('Bravo Ltd')).closest(
      'tr',
    ) as HTMLElement;
    expect(
      within(row).getByRole('button', { name: 'Delete bravo' }),
    ).toBeEnabled();
    const current = screen.getByText('Acme Corp').closest('tr') as HTMLElement;
    expect(within(current).getByText('Signed in here')).toBeInTheDocument();
    expect(
      within(current).getByRole('button', { name: 'Delete acme' }),
    ).toBeDisabled();
  });

  it('creates a tenant', async () => {
    signedInAs();
    const calls = stubApi(
      tenantRoutes({
        'POST /tenants': () => Response.json(bravo, { status: 201 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/tenants');
    await screen.findByText('Bravo Ltd');

    await u.click(screen.getByRole('button', { name: /New tenant/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Short name'), 'charlie');
    await u.type(within(dialog).getByLabelText('Name'), 'Charlie GmbH');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Tenant created.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      slug: 'charlie',
      name: 'Charlie GmbH',
      quotaLimitBytes: null,
    });
  });

  it.each(['Charlie', 'a_b', '-x', 'x-', 'a--b'])(
    'rejects the short name %s before asking the server',
    async (slug) => {
      signedInAs();
      const calls = stubApi(tenantRoutes());
      const u = userEvent.setup();
      await renderApp('/tenants');
      await screen.findByText('Bravo Ltd');

      await u.click(screen.getByRole('button', { name: /New tenant/ }));
      const dialog = await screen.findByRole('dialog');
      await u.type(within(dialog).getByLabelText('Short name'), slug);
      await u.type(within(dialog).getByLabelText('Name'), 'X');
      await u.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText(
          /Lowercase letters, digits and inner hyphens only/,
        ),
      ).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    },
  );

  it('shows a taken short name', async () => {
    signedInAs();
    stubApi(
      tenantRoutes({ 'POST /tenants': () => apiError(409, 'duplicate_entry') }),
    );
    const u = userEvent.setup();
    await renderApp('/tenants');
    await screen.findByText('Bravo Ltd');

    await u.click(screen.getByRole('button', { name: /New tenant/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Short name'), 'bravo');
    await u.type(within(dialog).getByLabelText('Name'), 'Again');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That name is already taken.'),
    ).toBeInTheDocument();
  });

  it('renames a tenant but keeps its short name fixed', async () => {
    signedInAs();
    const calls = stubApi(
      tenantRoutes({ 'PATCH /tenants/bravo': () => Response.json(bravo) }),
    );
    const u = userEvent.setup();
    await renderApp('/tenants');
    await screen.findByText('Bravo Ltd');

    await u.click(screen.getByRole('button', { name: 'Edit bravo' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Short name')).toBeDisabled();
    const name = within(dialog).getByLabelText('Name');
    await u.clear(name);
    await u.type(name, 'Bravo International');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Tenant saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Bravo International',
      quotaLimitBytes: null,
    });
  });

  it('deletes a tenant only after its short name is typed', async () => {
    signedInAs();
    const calls = stubApi(
      tenantRoutes({
        'DELETE /tenants/bravo': () => new Response(null, { status: 204 }),
      }),
    );
    const u = userEvent.setup();
    await renderApp('/tenants');
    await screen.findByText('Bravo Ltd');

    await u.click(screen.getByRole('button', { name: 'Delete bravo' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await u.type(within(dialog).getByLabelText('Confirmation'), 'bravo');
    await u.click(confirm);

    expect(await screen.findByText('Tenant deleted.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({
      confirmSlug: 'bravo',
    });
  });
});
