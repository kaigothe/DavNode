import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Tenant,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createBasicAuthMiddleware } from './basic-auth.middleware.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('createBasicAuthMiddleware', () => {
  let dataSource: DataSource;
  let tenant: Tenant;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function makeReqRes(authorization?: string): {
    req: Request;
    res: Response;
    next: NextFunction;
  } {
    const req = {
      tenant,
      header: vi.fn(() => authorization),
    } as unknown as Request;
    const res = {
      set: vi.fn(),
      sendStatus: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it('responds 401 with a WWW-Authenticate header when Authorization is missing', async () => {
    const middleware = createBasicAuthMiddleware(dataSource);
    const { req, res, next } = makeReqRes(undefined);

    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="davnode"',
    );
    expect(res.sendStatus).toHaveBeenCalledExactlyOnceWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses a configured realm in the challenge', async () => {
    const middleware = createBasicAuthMiddleware(dataSource, {
      realm: 'custom-realm',
    });
    const { req, res, next } = makeReqRes(undefined);

    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="custom-realm"',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 for a wrong password, same as for a missing header', async () => {
    const middleware = createBasicAuthMiddleware(dataSource);
    const { req, res, next } = makeReqRes(
      basicAuthHeader('alice', 'wrong password'),
    );

    await middleware(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledExactlyOnceWith(401);
    expect(req.principal).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 for an unknown user', async () => {
    const middleware = createBasicAuthMiddleware(dataSource);
    const { req, res, next } = makeReqRes(basicAuthHeader('nobody', PASSWORD));

    await middleware(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledExactlyOnceWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.principal and calls next() for correct credentials', async () => {
    const middleware = createBasicAuthMiddleware(dataSource);
    const { req, res, next } = makeReqRes(basicAuthHeader('alice', PASSWORD));

    await middleware(req, res, next);

    expect(req.principal).toBeDefined();
    expect(next).toHaveBeenCalledOnce();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  it('throws if req.tenant is not set (tenant-resolution must run first)', async () => {
    const middleware = createBasicAuthMiddleware(dataSource);
    const req = {
      header: vi.fn(() => basicAuthHeader('alice', PASSWORD)),
    } as unknown as Request;
    const res = { set: vi.fn(), sendStatus: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await expect(middleware(req, res, next)).rejects.toThrow(
      /tenant-resolution middleware/,
    );
  });

  describe('mounted in the real app', () => {
    it('reaches a downstream route with req.principal set, given correct credentials', async () => {
      const app = createApp(dataSource);
      app.get('/dav/:tenantSlug/probe', (req, res) => {
        res.json({ principalId: req.principal?.id ?? null });
      });
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe`,
          {
            headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
          },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { principalId: string };
        expect(body.principalId).toBeTruthy();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('responds 401 without reaching the route, given no credentials', async () => {
      const app = createApp(dataSource);
      const probe = vi.fn((_req: Request, res: Response) => {
        res.json({ reached: true });
      });
      app.get('/dav/:tenantSlug/probe', probe);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe`,
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
  });
});
