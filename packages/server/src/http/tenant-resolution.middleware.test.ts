import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  Tenant,
  type DataSource,
} from '@davnode/core';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTenantResolutionMiddleware } from './tenant-resolution.middleware.js';

describe('createTenantResolutionMiddleware', () => {
  let dataSource: DataSource;
  let tenant: Tenant;

  beforeEach(async () => {
    // Explicit entities/migrations, not the default filesystem glob: under
    // vitest, TypeORM's directory-based entity loader ends up resolving a
    // separate module instance than the one this test file's own static
    // imports use, so `hasMetadata('Tenant')` never finds it — passing
    // classes directly sidesteps that (see DavNodeDbSchema in
    // @davnode/core's data-source.ts for the same issue within core's own
    // test suite).
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('attaches req.tenant and calls next() for a known slug', async () => {
    const middleware = createTenantResolutionMiddleware(dataSource);
    const req = { params: { tenantSlug: 'acme' } } as unknown as Request<{
      tenantSlug: string;
    }>;
    const res = { sendStatus: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.tenant?.id).toBe(tenant.id);
    expect(next).toHaveBeenCalledOnce();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  it('responds 404 and never calls next() for an unknown slug', async () => {
    const middleware = createTenantResolutionMiddleware(dataSource);
    const req = {
      params: { tenantSlug: 'no-such-tenant' },
    } as unknown as Request<{
      tenantSlug: string;
    }>;
    const res = { sendStatus: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.tenant).toBeUndefined();
    expect(res.sendStatus).toHaveBeenCalledExactlyOnceWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  describe('mounted in the real app', () => {
    // A "known slug reaches a downstream route with req.tenant set" case
    // isn't covered here: createApp also mounts the basic-auth middleware
    // right after tenant-resolution, so reaching a route now needs valid
    // credentials too — that full chain (tenant resolution succeeding
    // *and* auth succeeding *and* the route being reached) is exactly
    // what basic-auth.middleware.test.ts's own "mounted in the real app"
    // tests verify, without duplicating a second user/credential setup
    // here. The unit test above already directly verifies req.tenant
    // attachment on its own.
    it('responds 404 for an unknown slug before any route — or auth — runs', async () => {
      const app = createApp(dataSource);
      const probe = vi.fn((_req: Request, res: Response) => {
        res.json({ reached: true });
      });
      app.get('/dav/:tenantSlug/probe', probe);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/no-such-tenant/probe`,
        );
        expect(response.status).toBe(404);
        expect(probe).not.toHaveBeenCalled();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
