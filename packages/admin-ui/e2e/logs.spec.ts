import { expect, test } from '@playwright/test';
import { adminApi, createUser, signIn } from './support';

test.describe('the server log', () => {
  test('shows what just happened, and can be filtered', async ({
    page,
    request,
  }) => {
    const user = await createUser(request, `logged-${Date.now().toString(36)}`);
    await signIn(page);
    await page.getByRole('menuitem', { name: 'Server log' }).click();
    await expect(
      page.getByRole('heading', { name: 'Server log' }),
    ).toBeVisible();

    // The creation of the user above is a request the server logged.
    await page
      .getByRole('textbox', { name: 'Search the log' })
      .fill('/admin/e2e/users');
    const row = page
      .getByRole('row')
      .filter({ hasText: 'POST /admin/e2e/users' })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByText('info')).toBeVisible();

    await row.getByRole('button', { name: /Expand row/ }).click();
    await expect(page.getByRole('cell', { name: 'requestId' })).toBeVisible();
    await expect(page.getByText(user.username)).toHaveCount(0);
    await expect(page.getByText(/s?pw-/)).toHaveCount(0);
  });

  test('lists the reads of a user’s data', async ({ page, request }) => {
    const user = await createUser(
      request,
      `watched-${Date.now().toString(36)}`,
    );
    await signIn(page);
    await page.goto(`/admin-ui/users/${user.id}/content`);
    await expect(
      page.getByText(`Calendars and contacts of ${user.username}`),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.getByRole('menuitem', { name: 'Server log' }).click();
    await page.getByRole('button', { name: 'Reads of user data' }).click();

    const row = page
      .getByRole('row')
      .filter({ hasText: 'Admin read user content' })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Expand row/ }).click();
    await expect(
      page.getByRole('cell', { name: user.id }).first(),
    ).toBeVisible();
  });

  test('never shows a password or an authorization header', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('menuitem', { name: 'Server log' }).click();
    await page.getByRole('combobox', { name: 'How many lines' }).click();
    await page
      .locator('.ant-select-item-option-content', { hasText: 'Latest 1000' })
      .click();
    await expect(page.getByText(/Showing \d+ of/)).toBeVisible();

    const text = await page.locator('main').innerText();
    expect(text).not.toContain('admin-pw');
    expect(text.toLowerCase()).not.toContain('authorization');
  });

  test('is closed to a tenant administrator, in the menu and in the API', async ({
    page,
    request,
  }) => {
    const name = `boss-${Date.now().toString(36)}`;
    await adminApi(request).post('/users', {
      username: name,
      email: `${name}@example.com`,
      password: 'pw-boss',
      role: 'tenant_admin',
    });
    await signIn(page, name, 'pw-boss');

    await expect(
      page.getByRole('menuitem', { name: 'Server log' }),
    ).toHaveCount(0);
    await page.goto('/admin-ui/logs');
    await expect(page.getByText('Not allowed')).toBeVisible();
    const response = await request.get('/admin/e2e/logs', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${name}:pw-boss`).toString('base64')}`,
      },
    });
    expect(response.status()).toBe(403);
  });

  test('keeps itself up to date in live mode', async ({ page, request }) => {
    await signIn(page);
    await page.getByRole('menuitem', { name: 'Server log' }).click();
    await page.getByRole('switch', { name: 'Live' }).click();

    const name = `live-${Date.now().toString(36)}`;
    await createUser(request, name);
    await page
      .getByRole('textbox', { name: 'Search the log' })
      .fill('POST /admin/e2e/users');

    await expect(
      page
        .getByRole('row')
        .filter({ hasText: 'POST /admin/e2e/users' })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
