import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createLogger } from './logging/logger.js';
import { createBufferedDestination, LogBuffer } from './logging/log-buffer.js';

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('the admin log view through the whole server', () => {
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
    const tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    const users = new UserService(dataSource);
    await users.createUser({
      tenantId: tenant.id,
      username: 'root',
      email: 'root@example.com',
      password: 'secret-pw',
      role: 'server_admin',
    });
    await users.createUser({
      tenantId: tenant.id,
      username: 'pat',
      email: 'pat@example.com',
      password: 'pat-pw',
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  function start(withLogs: boolean): void {
    const buffer = new LogBuffer(100);
    const logger = createLogger(
      'info',
      createBufferedDestination(buffer, { write: () => undefined }),
    );
    server = createApp(dataSource, {
      logger,
      adminLogs: withLogs ? buffer : undefined,
    }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const logs = (query = '', user = 'root', password = 'secret-pw') =>
    fetch(`${baseUrl}/admin/acme/logs${query}`, {
      headers: { Authorization: basic(user, password) },
    });

  it('shows what the server just logged, newest first', async () => {
    start(true);
    await fetch(`${baseUrl}/no-such-page`);

    // A request is logged when it finishes, a moment after the client has the answer.
    await vi.waitFor(async () => {
      const body = (await (await logs('?q=no-such-page')).json()) as {
        entries: { message: string; fields: { path?: string } }[];
      };
      expect(body.entries[0]).toMatchObject({
        message: 'request completed',
        fields: { path: '/no-such-page' },
      });
    });
  });

  it('finds the reads of a user’s data by their message', async () => {
    start(true);

    await logs('?q=nothing-at-all');
    const body = (await (await logs('?q=logs')).json()) as {
      entries: { fields: { path?: string } }[];
    };

    expect(body.entries.every((e) => e.fields.path?.includes('logs'))).toBe(
      true,
    );
  });

  it('never contains a password or an Authorization header', async () => {
    start(true);
    await logs();

    const text = JSON.stringify(await (await logs('?limit=1000')).json());

    expect(text).not.toContain('secret-pw');
    expect(text).not.toContain(
      Buffer.from('root:secret-pw').toString('base64'),
    );
    expect(text.toLowerCase()).not.toContain('authorization');
  });

  it('is closed to everyone but a server administrator', async () => {
    start(true);

    expect((await logs('', 'pat', 'pat-pw')).status).toBe(403);
    expect((await fetch(`${baseUrl}/admin/acme/logs`)).status).toBe(401);
  });

  it('does not exist when the log view is off', async () => {
    start(false);

    expect((await logs()).status).toBe(404);
  });
});
