import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

describe('GET /healthz', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    server = createApp(dataSource).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('answers 200 {"status":"ok"} without any credentials, and is never cached', async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 once the database is gone, without error detail', async () => {
    await dataSource.destroy();

    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('is not reachable below a tenant prefix', async () => {
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'pw',
    });

    const unauthenticated = await fetch(`${baseUrl}/dav/acme/healthz`);
    const authenticated = await fetch(`${baseUrl}/dav/acme/healthz`, {
      headers: {
        Authorization: `Basic ${Buffer.from('alice:pw').toString('base64')}`,
      },
    });

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(404);
  });
});
