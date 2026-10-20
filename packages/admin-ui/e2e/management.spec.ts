import { expect, test } from '@playwright/test';
import { signIn } from './support';

const suffix = Date.now().toString(36);

test.describe('managing the server', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('creates, finds and deletes a user', async ({ page }) => {
    const name = `erin-${suffix}`;
    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page.getByRole('button', { name: /New user/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Username').fill(name);
    await dialog.getByLabel('E-mail').fill(`${name}@example.com`);
    await dialog.getByLabel('Password').fill('pw-erin');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User created.')).toBeVisible();

    await page
      .getByRole('textbox', { name: 'Search by name or e-mail' })
      .fill(name);
    await expect(
      page.getByRole('row', { name: new RegExp(name) }),
    ).toBeVisible();

    await page.getByRole('button', { name: `Delete ${name}` }).click();
    const confirm = page.getByRole('dialog');
    await expect(
      confirm.getByRole('button', { name: 'Delete', exact: true }),
    ).toBeDisabled();
    await confirm.getByLabel('Confirmation').fill(name);
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('User deleted.')).toBeVisible();
  });

  test('creates a group and adds a member', async ({ page, request }) => {
    const member = `member-${suffix}`;
    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page.getByRole('button', { name: /New user/ }).click();
    const create = page.getByRole('dialog');
    await create.getByLabel('Username').fill(member);
    await create.getByLabel('E-mail').fill(`${member}@example.com`);
    await create.getByLabel('Password').fill('pw');
    await create.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User created.')).toBeVisible();

    await page.getByRole('menuitem', { name: 'Groups' }).click();
    await page.getByRole('button', { name: /New group/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(`team-${suffix}`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Group created.')).toBeVisible();

    await page
      .getByRole('link', { name: new RegExp(`team-${suffix}`) })
      .click();
    await page.getByRole('combobox', { name: 'Add a member' }).click();
    await page
      .locator('.ant-select-item-option-content', { hasText: member })
      .click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Member added.')).toBeVisible();
    await expect(
      page.getByRole('cell', { name: member }).first(),
    ).toBeVisible();
    void request;
  });

  test('opens a user, shows their groups and returns to the list', async ({
    page,
  }) => {
    const name = `detail-${suffix}`;
    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page.getByRole('button', { name: /New user/ }).click();
    const create = page.getByRole('dialog');
    await create.getByLabel('Username').fill(name);
    await create.getByLabel('E-mail').fill(`${name}@example.com`);
    await create.getByLabel('Password').fill('pw');
    await create.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User created.')).toBeVisible();

    // Two groups, one inside the other, the user in the inner one.
    for (const group of [`inner-${suffix}`, `outer-${suffix}`]) {
      await page.getByRole('menuitem', { name: 'Groups' }).click();
      await page.getByRole('button', { name: /New group/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name', { exact: true }).fill(group);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByText('Group created.').first()).toBeVisible();
    }
    for (const [group, member] of [
      [`inner-${suffix}`, name],
      [`outer-${suffix}`, `inner-${suffix}`],
    ]) {
      await page.getByRole('menuitem', { name: 'Groups' }).click();
      await page.getByRole('link', { name: new RegExp(group) }).click();
      await page.getByRole('combobox', { name: 'Add a member' }).click();
      await page
        .locator('.ant-select-item-option-content', { hasText: member })
        .first()
        .click();
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText('Member added.')).toBeVisible();
    }

    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page
      .getByRole('textbox', { name: 'Search by name or e-mail' })
      .fill(name);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    const inner = page.getByRole('row', {
      name: new RegExp(`inner-${suffix}`),
    });
    await expect(inner.getByText('Direct member')).toBeVisible();
    const outer = page.getByRole('row', {
      name: new RegExp(`outer-${suffix}`),
    });
    await expect(outer.getByText(`Via inner-${suffix}`)).toBeVisible();

    await page.getByRole('button', { name: /^delete Delete$/ }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByLabel('Confirmation').fill(name);
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('User deleted.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });

  test('recounts the storage', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Storage' }).click();
    await page.getByRole('button', { name: /Recount/ }).click();
    await expect(page.getByText('Storage recounted.')).toBeVisible();
  });

  test('creates and deletes a tenant', async ({ page }) => {
    const slug = `t-${suffix}`;
    await page.getByRole('menuitem', { name: 'Tenants' }).click();
    await page.getByRole('button', { name: /New tenant/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Short name').fill(slug);
    await dialog.getByLabel('Name', { exact: true }).fill('Walkthrough');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Tenant created.')).toBeVisible();

    await page.getByRole('button', { name: `Delete ${slug}` }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByLabel('Confirmation').fill(slug);
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Tenant deleted.')).toBeVisible();
  });

  test('shows a server error in the user’s language', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Users' }).click();
    await page.getByRole('button', { name: /New user/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Username').fill('admin');
    await dialog.getByLabel('E-mail').fill('x@example.com');
    await dialog.getByLabel('Password').fill('pw');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('That name is already taken.')).toBeVisible();
  });

  test('a wrong password is refused and nothing is kept', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.evaluate(() => window.sessionStorage.clear());
    await page.goto('/admin-ui/');
    await page.getByLabel('Tenant').fill('e2e');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByText('The username or password is wrong.'),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem('davnode.session'),
      ),
    ).toBeNull();
  });
});
