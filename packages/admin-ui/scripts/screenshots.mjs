// Takes the admin UI screenshots used by the README and the documentation
// (docs/assets/admin-ui/*.png). Reproducible: it starts a throw-away server,
// seeds it with scripts/demo/seed.mjs and pins "today" to 14 Oct 2026 in UTC.
//
//   npm run build --workspaces && npm run screenshots -w @davnode/admin-ui
//
// PW_CHANNEL=chrome uses the installed Chrome instead of Playwright's own.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../../..');
const out = path.resolve(
  process.argv[2] ?? path.join(root, 'docs/assets/admin-ui'),
);
const PORT = process.env.SCREENSHOT_PORT ?? '8098';
const base = `http://127.0.0.1:${PORT}`;
const TODAY = '2026-10-14';
const PASSWORD = 'admin-pw';
mkdirSync(out, { recursive: true });

const server = spawn(
  process.execPath,
  [path.join(import.meta.dirname, '../e2e/start-server.mjs')],
  {
    env: {
      ...process.env,
      E2E_PORT: PORT,
      E2E_TENANT: 'demo',
      E2E_TENANT_NAME: 'Demo Company',
      DAVNODE_LOG_LEVEL: 'error',
    },
    stdio: 'inherit',
  },
);
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

for (let i = 0; ; i += 1) {
  try {
    if ((await fetch(`${base}/healthz`)).ok) break;
  } catch {
    // not up yet
  }
  if (i > 60) throw new Error('The server did not start.');
  await sleep(1000);
}

execFileSync(
  process.execPath,
  [path.join(root, 'scripts/demo/seed.mjs'), base, 'demo', 'admin', PASSWORD],
  {
    env: { ...process.env, DEMO_TODAY: TODAY },
    stdio: 'inherit',
  },
);

const auth = `Basic ${Buffer.from(`admin:${PASSWORD}`).toString('base64')}`;
const api = async (method, apiPath, body) => {
  const res = await fetch(`${base}/admin/demo${apiPath}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409)
    throw new Error(`${method} ${apiPath}: ${res.status}`);
  return res.status === 204 ? null : res.json();
};
// A few more tenants so the tenant list is not a single row.
await api('POST', '/tenants', {
  slug: 'acme',
  name: 'Acme Corp',
  quotaLimitBytes: 20 * 1024 ** 3,
});
await api('POST', '/tenants', { slug: 'globex', name: 'Globex' });
const users = (await api('GET', '/users')).users;
const alice = users.find((u) => u.username === 'alice');
const teamGroup = (await api('GET', '/groups')).groups.find(
  (g) => g.name === 'Team',
);

const TEXT = {
  en: {
    tenant: 'Tenant',
    user: 'Username',
    pass: 'Password',
    signIn: 'Sign in',
    users: 'Users',
    groups: 'Groups',
    storage: 'Storage',
    tenants: 'Tenants',
    contacts: 'Contacts',
    calendar: 'Calendar',
    account: 'Your account',
    details: /Details: Design review/,
  },
  de: {
    tenant: 'Tenant',
    user: 'Benutzername',
    pass: 'Passwort',
    signIn: 'Anmelden',
    users: 'Nutzer',
    groups: 'Gruppen',
    storage: 'Speicher',
    tenants: 'Tenants',
    contacts: 'Kontakte',
    calendar: 'Kalender',
    account: 'Dein Konto',
    details: /Details: Design review/,
  },
};

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });

async function settle(page) {
  await page.mouse.move(0, 0);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Wait only for animations that end; a progress bar's shimmer never does.
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function session(scheme, lang) {
  const t = TEXT[lang];
  const context = await browser.newContext({
    colorScheme: scheme,
    locale: lang === 'de' ? 'de-DE' : 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  // Pin "today" (the month view opens on it) without stopping time.
  await page.clock.install({ time: new Date(`${TODAY}T10:00:00Z`) });
  await page.clock.resume();
  const shoot = async (name, height = 800) => {
    // A taller window for pages with a long body (the month view).
    await page.setViewportSize({ width: 1280, height });
    await settle(page);
    await page.screenshot({
      path: path.join(out, `${name}-${scheme}-${lang}.png`),
    });
    console.log(`  ${name}-${scheme}-${lang}.png`);
  };
  return { context, page, t, shoot };
}

async function run(scheme, lang, only) {
  const { context, page, t, shoot } = await session(scheme, lang);
  page.on('pageerror', (e) => console.error('page error:', e.message));
  try {
    const wants = (name) => !only || only.includes(name);

    await page.goto(`${base}/admin-ui/`);
    if (wants('login')) {
      await page.getByLabel(t.tenant).waitFor();
      await shoot('login');
    }
    await page.getByLabel(t.tenant).fill('demo');
    await page.getByLabel(t.user).fill('admin');
    await page.getByLabel(t.pass).fill(PASSWORD);
    await page.getByRole('button', { name: t.signIn }).click();
    await page.getByText(t.account).waitFor();
    if (wants('overview')) await shoot('overview');

    const menu = (name) => page.getByRole('menuitem', { name });
    if (wants('users')) {
      await menu(t.users).click();
      await page.getByText('carol').first().waitFor();
      await shoot('users');
    }
    if (wants('group')) {
      await page.goto(`${base}/admin-ui/groups/${teamGroup.id}`);
      await page.getByText('carol').first().waitFor();
      await shoot('group');
    }
    if (wants('storage')) {
      await menu(t.storage).click();
      await page.getByText('alice').first().waitFor();
      await shoot('storage');
    }
    if (wants('tenants')) {
      await menu(t.tenants).click();
      await page.getByText('Globex').first().waitFor();
      await shoot('tenants');
    }
    if (
      wants('calendar') ||
      wants('event') ||
      wants('contacts') ||
      wants('contact')
    ) {
      await page.goto(`${base}/admin-ui/users/${alice.id}/content`);
      // The first calendar alphabetically is "personal"; show "work".
      await page.getByRole('combobox', { name: t.calendar }).click();
      await page
        .locator('.ant-select-item-option-content', { hasText: /^work/ })
        .click();
      await page.getByText('Design review').first().waitFor();
      // Select the day of the design review so the list below shows an event.
      await page
        .locator('.ant-picker-cell-in-view .ant-picker-calendar-date-value', {
          hasText: /^12$/,
        })
        .click();
      await page.getByRole('button', { name: t.details }).waitFor();
      if (wants('calendar')) await shoot('calendar', 1340);
      if (wants('event')) {
        await page.getByRole('button', { name: t.details }).click();
        await page.getByRole('dialog').waitFor();
        await shoot('event');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      }
      if (wants('contacts') || wants('contact')) {
        await page.getByRole('tab', { name: t.contacts }).click();
        await page.getByText('Lena Hoffmann').waitFor();
        if (wants('contacts')) await shoot('contacts');
        if (wants('contact')) {
          await page.getByText('Lena Hoffmann').click();
          await page.getByRole('dialog').waitFor();
          await shoot('contact');
        }
      }
    }
  } catch (error) {
    await page.screenshot({
      path: path.join(out, `failure-${scheme}-${lang}.png`),
    });
    throw error;
  }
  await context.close();
}

try {
  console.log('English, light');
  await run('light', 'en');
  console.log('English, dark');
  await run('dark', 'en');
  console.log('German, light');
  await run('light', 'de', ['overview', 'users', 'calendar']);
} finally {
  await browser.close();
  stop();
}
