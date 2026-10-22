import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  dav,
  seedCalendar,
  signIn,
  todayInBrowserZone,
  ymd,
} from './support';

/** Every violation axe finds, rendered for the failure message. */
async function violations(page: Page) {
  // A component that is still fading in has a blended colour; measure it
  // once every animation and transition has finished.
  // Let a component that has just opened start its animation first.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
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
            `${n.target.join(' ')} ${n.html.slice(0, 140)} [${n.any.map((c) => c.message).join('; ')}]`,
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
        ['Server log', 'Showing'],
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

    test('calendar in every view, with coloured events and the drawer', async ({
      page,
      request,
    }) => {
      const user = await createUser(
        request,
        `a11y-cal-${scheme}-${Date.now().toString(36)}`,
      );
      const today = todayInBrowserZone();
      // Every default colour, and light ones that need the darkened text.
      const colors = [
        '#1badf8',
        '#63da38',
        '#ff9500',
        '#cc73e1',
        '#ff2968',
        '#ffcc00',
        '#a2845e',
        '#7d7d7d',
      ];
      for (const [i, color] of colors.entries()) {
        await seedCalendar(
          request,
          user,
          { path: `c${i}`, name: `Calendar ${i}`, color },
          [
            {
              uid: `t${i}@e2e`,
              summary: `Timed ${i}`,
              start: `${today}T${String(8 + i).padStart(2, '0')}0000Z`,
              end: `${today}T${String(9 + i).padStart(2, '0')}0000Z`,
              location: 'Room 1',
            },
            {
              uid: `d${i}@e2e`,
              summary: `All day ${i}`,
              start: today,
              end: ymd(new Date(Date.now() + 2 * 86_400_000)),
              allDay: true,
            },
          ],
        );
      }
      await signIn(page);
      await page.goto(`/admin-ui/users/${user.id}/content`);
      await expect(page.getByLabel(/(^|, )Timed 0, /).first()).toBeVisible();
      expect(await violations(page), 'week view').toEqual([]);

      await page.getByText('Day', { exact: true }).click();
      await expect(page.getByLabel(/(^|, )Timed 3, /).first()).toBeVisible();
      expect(await violations(page), 'day view').toEqual([]);

      await page.getByText('Month', { exact: true }).click();
      await expect(page.getByLabel(/(^|, )Timed 3, /).first()).toBeVisible();
      expect(await violations(page), 'month view').toEqual([]);

      await page
        .getByLabel(/(^|, )Timed 3, /)
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await violations(page), 'event drawer').toEqual([]);
      await page.keyboard.press('Escape');

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
      // Past the last control the trap may let focus leave the page for a
      // Tab (in a headless browser that shows as <body>; on a busy machine
      // the trap's key handler can lose the race); the next Tab then comes
      // back to the first control. What must never happen is that focus
      // reaches the page behind the dialog.
      await expect
        .poll(
          () =>
            dialog.evaluate(
              (el) =>
                el.contains(document.activeElement) ||
                document.activeElement === document.body,
            ),
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
