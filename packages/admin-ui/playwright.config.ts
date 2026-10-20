import { defineConfig } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '8099';

// End-to-end tests run against a real server (SQLite, started by
// e2e/start-server.mjs) and the built UI: build everything first.
// Locally, PW_CHANNEL=chrome uses the installed Chrome instead of
// Playwright's own Chromium.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
