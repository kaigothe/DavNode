import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('Admin API mounting (M9)', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('responds 401 with the same WWW-Authenticate header as the DAV routes, without reaching the admin router, given no credentials', async () => {
    await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    const app = createApp(dataSource);
    const probe = vi.fn((_req: Request, res: Response) => {
      res.json({ reached: true });
    });
    app.get('/admin/:tenantSlug/probe', probe);
    const server = app.listen(0);
    const address = server.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/admin/acme/probe`,
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Basic realm="davnode"',
      );
      expect(probe).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('an authenticated request reaches the mounted admin router (tenant resolution and auth both already ran)', async () => {
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    const app = createApp(dataSource);
    const server = app.listen(0);
    const address = server.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/admin/acme/nonexistent`,
        { headers: { Authorization: basicAuthHeader('alice', PASSWORD) } },
      );
      // No real admin route exists yet (Große Aufgaben 3-6 add them),
      // so this falls through to a 404 from the admin router's own
      // "no such route" default — the important thing is that it's
      // *not* 401: tenant resolution and authentication both already
      // ran successfully before reaching it.
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
