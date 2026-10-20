import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  type DataSource,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { ADMIN_UI_CSP } from './admin-ui.route.js';

describe('admin UI route', () => {
  let dataSource: DataSource;
  let directory: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'davnode-admin-ui-'));
    mkdirSync(path.join(directory, 'assets'));
    writeFileSync(path.join(directory, 'index.html'), '<!doctype html>app');
    writeFileSync(path.join(directory, 'assets', 'app-1a2b3c.js'), 'js');
    writeFileSync(path.join(directory, 'favicon.svg'), '<svg/>');
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  function start(adminUi?: { directory: string }): void {
    server = createApp(dataSource, { adminUi }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  describe('when it is not enabled', () => {
    it('does not exist (404)', async () => {
      start();

      expect((await fetch(`${baseUrl}/admin-ui/`)).status).toBe(404);
      expect(
        (await fetch(`${baseUrl}/admin-ui/assets/app-1a2b3c.js`)).status,
      ).toBe(404);
    });
  });

  describe('when it is enabled', () => {
    beforeEach(() => start({ directory }));

    it('serves the app at /admin-ui and /admin-ui/ without credentials', async () => {
      for (const url of ['/admin-ui', '/admin-ui/']) {
        const response = await fetch(`${baseUrl}${url}`);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('<!doctype html>app');
        expect(response.headers.get('cache-control')).toBe('no-cache');
      }
    });

    it('answers a client-side route with the app (deep link)', async () => {
      const response = await fetch(`${baseUrl}/admin-ui/users/42`);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<!doctype html>app');
    });

    it('caches hashed assets for a year and nothing else', async () => {
      const asset = await fetch(`${baseUrl}/admin-ui/assets/app-1a2b3c.js`);
      const icon = await fetch(`${baseUrl}/admin-ui/favicon.svg`);

      expect(asset.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(icon.headers.get('cache-control')).toBe('no-cache');
    });

    it('answers a missing file with an extension with 404, not the app', async () => {
      const response = await fetch(`${baseUrl}/admin-ui/assets/gone.js`);

      expect(response.status).toBe(404);
    });

    it('sets the content security policy and the standard hardening headers', async () => {
      const response = await fetch(`${baseUrl}/admin-ui/`);

      expect(response.headers.get('content-security-policy')).toBe(
        ADMIN_UI_CSP,
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('does not loosen the headers of any other response', async () => {
      const health = await fetch(`${baseUrl}/healthz`);
      const api = await fetch(`${baseUrl}/admin/acme/me`);

      expect(health.headers.get('content-security-policy')).toBeNull();
      expect(api.headers.get('content-security-policy')).toBeNull();
      expect(api.status).toBe(404);
    });

    it('does not accept writes', async () => {
      const response = await fetch(`${baseUrl}/admin-ui/users`, {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });
  });

  it('refuses to start without a build, naming the directory', () => {
    expect(() =>
      createApp(dataSource, {
        adminUi: { directory: path.join(directory, 'x') },
      }),
    ).toThrow(/no admin UI build at .*x/);
  });
});
