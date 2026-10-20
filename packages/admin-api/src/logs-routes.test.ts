import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Principal,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminErrorBody } from './admin-error-response.js';
import type { LogSource } from './logs-routes.js';
import { createAdminRouter } from './router.js';

describe('GET /logs', () => {
  let dataSource: DataSource;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let acme: Tenant;
  let root: User;
  let boss: User;
  let member: User;
  let queries: Parameters<LogSource['query']>[0][];

  const logs: LogSource = {
    query: (query) => {
      queries.push(query);
      return {
        entries: [
          {
            seq: 7,
            timestamp: '2026-10-21T10:00:00.000Z',
            level: 'info',
            message: 'request completed',
            fields: { status: 200 },
          },
        ],
        newest: 7,
        buffered: 7,
        capacity: 100,
      };
    },
  };

  beforeEach(async () => {
    queries = [];
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    acme = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme',
    });
    const users = new UserService(dataSource);
    const make = (
      username: string,
      role: 'member' | 'tenant_admin' | 'server_admin',
    ) =>
      users.createUser({
        tenantId: acme.id,
        username,
        email: `${username}@example.com`,
        password: 'pw',
        role,
      });
    root = await make('root', 'server_admin');
    boss = await make('boss', 'tenant_admin');
    member = await make('pat', 'member');
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dataSource.destroy();
  });

  function mountAs(user: User, withLogs = true): void {
    const app = express();
    app.use(async (req: Request, _res: Response, next: NextFunction) => {
      req.tenant = acme;
      req.principal = await dataSource
        .getRepository(Principal)
        .findOneByOrFail({ id: user.principalId });
      next();
    });
    app.use('/admin', createAdminRouter(dataSource, withLogs ? { logs } : {}));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const get = (path: string) => fetch(`${baseUrl}/admin${path}`);
  const code = async (response: globalThis.Response) =>
    ((await response.json()) as AdminErrorBody).error.code;

  it('answers a server administrator with the entries and the buffer figures', async () => {
    mountAs(root);

    const response = await get('/logs');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      entries: [{ seq: 7, message: 'request completed' }],
      newest: 7,
      buffered: 7,
      capacity: 100,
    });
  });

  it('asks for 200 entries unless told otherwise', async () => {
    mountAs(root);

    await get('/logs');

    expect(queries[0]).toEqual({
      limit: 200,
      minLevel: undefined,
      text: undefined,
      after: undefined,
    });
  });

  it('passes limit, level, text and after on', async () => {
    mountAs(root);

    await get('/logs?limit=50&level=warn&q=%20Admin%20read%20&after=12');

    expect(queries[0]).toEqual({
      limit: 50,
      minLevel: 'warn',
      text: 'Admin read',
      after: 12,
    });
  });

  it.each([
    ['limit=0', 'invalid_limit'],
    ['limit=1001', 'invalid_limit'],
    ['limit=abc', 'invalid_limit'],
    ['level=verbose', 'invalid_level'],
    ['q=' + 'x'.repeat(201), 'invalid_text'],
    ['after=-1', 'invalid_after'],
    ['after=x', 'invalid_after'],
  ])('rejects %s (400 %s)', async (query, expected) => {
    mountAs(root);

    const response = await get(`/logs?${query}`);

    expect(response.status).toBe(400);
    expect(await code(response)).toBe(expected);
    expect(queries).toEqual([]);
  });

  it('is for server administrators only', async () => {
    mountAs(boss);
    expect((await get('/logs')).status).toBe(403);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    mountAs(member);
    expect((await get('/logs')).status).toBe(403);
    expect(queries).toEqual([]);
  });

  it('does not exist without a log source', async () => {
    mountAs(root, false);

    expect((await get('/logs')).status).toBe(404);
  });

  it('tells /me whether the log view exists', async () => {
    mountAs(root);
    const on = (await (await get('/me')).json()) as {
      capabilities: { logView: boolean };
    };
    await new Promise<void>((resolve) => server.close(() => resolve()));
    mountAs(root, false);
    const off = (await (await get('/me')).json()) as {
      capabilities: { logView: boolean };
    };

    expect(on.capabilities.logView).toBe(true);
    expect(off.capabilities.logView).toBe(false);
  });
});
