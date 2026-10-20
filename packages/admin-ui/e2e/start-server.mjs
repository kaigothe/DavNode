// Starts a throwaway DavNode for the end-to-end tests: a fresh SQLite file,
// one bootstrapped tenant ("e2e", admin/admin-pw) and the admin UI with the
// content view on. Run by Playwright's webServer; stays in the foreground.
// E2E_TENANT and E2E_TENANT_NAME rename the tenant (the screenshot script
// uses "demo").
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const dir = mkdtempSync(path.join(tmpdir(), 'davnode-e2e-'));
const env = {
  ...process.env,
  DAVNODE_DB_TYPE: 'better-sqlite3',
  DAVNODE_DB_FILE: path.join(dir, 'e2e.sqlite'),
  DAVNODE_HTTP_HOST: '127.0.0.1',
  DAVNODE_HTTP_PORT: process.env.E2E_PORT ?? '8099',
  DAVNODE_ADMIN_UI_ENABLED: 'true',
  DAVNODE_ADMIN_UI_CONTENT_VIEW: 'true',
  DAVNODE_LOG_LEVEL: 'warn',
  // The tests sign in many times from one address.
  DAVNODE_AUTH_RATE_LIMIT_MAX: '0',
};

const core = await import(
  pathToFileURL(path.join(root, 'packages/core/dist/index.js')).href
);
Object.assign(process.env, env);
const dataSource = core.createDataSource(process.env);
await dataSource.initialize();
await dataSource.runMigrations();
await dataSource.destroy();

execFileSync(
  process.execPath,
  [
    path.join(root, 'packages/core/dist/cli/bootstrap.js'),
    `--tenant-slug=${process.env.E2E_TENANT ?? 'e2e'}`,
    `--tenant-name=${process.env.E2E_TENANT_NAME ?? 'End to End'}`,
    '--username=admin',
    '--email=admin@example.com',
    '--password=admin-pw',
  ],
  { env, stdio: 'inherit' },
);

const server = spawn(
  process.execPath,
  [path.join(root, 'packages/server/dist/index.js')],
  {
    env,
    stdio: 'inherit',
  },
);
const stop = () => {
  server.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 0));
