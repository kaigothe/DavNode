import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createUser, dav, signIn } from './support';

/** Every violation axe finds, rendered for the failure message. */
async function violations(page: Page) {
  // A component that is still fading in has a blended colour; measure it
  // once every animation and transition has finished.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Wait only for animations that end; a progress bar's shimmer never does.
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help} — ${v.nodes
        .slice(0, 4)
        .map(
          (n) =>
            `${n.target.join(' ')} [${n.any.map((c) => c.message).join('; ')}]`,
        )
        .join(', ')}`,
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('login page', async ({ page }) => {
      await page.goto('/admin-ui/');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('every page of the shell, including dialogs', async ({
      page,
      request,
    }) => {
      const user = await createUser(
        request,
        `a11y-${scheme}-${Date.now().toString(36)}`,
      );
      await signIn(page);

      const pages: [string, string][] = [
        ['Overview', 'Your account'],
        ['Users', user.username],
        ['Groups', 'Groups'],
        ['Storage', 'Used storage'],
        ['Tenants', 'Short name'],
      ];
      for (const [menu, ready] of pages) {
        await page.getByRole('menuitem', { name: menu }).click();
        await expect(page.getByText(ready).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await violations(page), menu).toEqual([]);
      }

      await page.getByRole('menuitem', { name: 'Users' }).click();
      await page.getByRole('button', { name: /New user/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await violations(page), 'create user dialog').toEqual([]);
    });

    test('contact drawer with its business card', async ({ page, request }) => {
      const user = await createUser(
        request,
        `a11y-card-${scheme}-${Date.now().toString(36)}`,
      );
      const book = `/addressbooks/${user.principalId}/contacts/`;
      await dav(request, user, 'MKCOL', book, {
        contentType: 'application/xml',
        body: '<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype><D:displayname>People</D:displayname></D:prop></D:set></D:mkcol>',
      });
      await dav(request, user, 'PUT', `${book}ada.vcf`, {
        contentType: 'text/vcard',
        body: 'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:ada\r\nFN:Ada Lovelace\r\nTITLE:Programmer\r\nORG:Analytical Engines\r\nEMAIL;TYPE=WORK:ada@analytical.example\r\nTEL;TYPE=CELL:+49 170 1234567\r\nADR;TYPE=HOME:;;1 Main St;London;;N1;UK\r\nEND:VCARD\r\n',
      });
      await signIn(page);
      await page.goto(`/admin-ui/users/${user.id}/content`);
      await page.getByRole('tab', { name: 'Contacts' }).click();
      await page.getByText('Ada Lovelace').click();
      const card = page.getByRole('article', { name: 'Business card' });
      await expect(card.getByText('Analytical Engines')).toBeVisible();
      await expect(
        card.getByText('ada@analytical.example (work)'),
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await violations(page), 'contact drawer').toEqual([]);
    });

    test('calendar and contacts of a user', async ({ page, request }) => {
      const user = await createUser(
        request,
        `a11y-cal-${scheme}-${Date.now().toString(36)}`,
      );
      await signIn(page);
      await page.goto(`/admin-ui/users/${user.id}/content`);
      await expect(
        page.getByText(`Calendars and contacts of ${user.username}`),
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await violations(page), 'calendar tab').toEqual([]);
      await page.getByRole('tab', { name: 'Contacts' }).click();
      await page.waitForLoadState('networkidle');
      expect(await violations(page), 'contacts tab').toEqual([]);
    });
  });
}

test.describe('language and keyboard', () => {
  test('the page language follows the UI language', async ({ page }) => {
    await page.goto('/admin-ui/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('combobox', { name: 'Language' }).click();
    await page
      .locator('.ant-select-item-option-content', { hasText: 'Deutsch' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  });

  test('a dialog takes the focus, keeps it, and gives it back on Escape', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('menuitem', { name: 'Users' }).click();
    const opener = page.getByRole('button', { name: /New user/ });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      // Focus may pass over the dialog's focus-trap sentinels for a moment
      // before it wraps back; it must settle inside.
      await expect
        .poll(
          () => dialog.evaluate((el) => el.contains(document.activeElement)),
          {
            message: `after ${i + 1} Tabs`,
          },
        )
        .toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the whole login works with the keyboard only', async ({ page }) => {
    await page.goto('/admin-ui/');
    await page.getByLabel('Tenant').focus();
    await page.keyboard.type('e2e');
    await page.keyboard.press('Tab');
    await page.keyboard.type('admin');
    await page.keyboard.press('Tab');
    await page.keyboard.type('admin-pw');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Your account')).toBeVisible();
  });
});
