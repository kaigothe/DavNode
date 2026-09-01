import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  createDataSource,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import {
  createOwnerOnlyAuthorizationMiddleware,
  type OwnedResource,
} from './owner-only-authorization.middleware.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('createOwnerOnlyAuthorizationMiddleware', () => {
  function makeReqRes(principalId?: string): {
    req: Request;
    res: Response;
    next: NextFunction;
  } {
    const req = {
      principal: principalId ? { id: principalId } : undefined,
    } as unknown as Request;
    const res = { sendStatus: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it('throws if req.principal is not set (basic-auth middleware must run first)', async () => {
    const middleware = createOwnerOnlyAuthorizationMiddleware(async () => null);
    const { req, res, next } = makeReqRes(undefined);

    await expect(middleware(req, res, next)).rejects.toThrow(
      /basic-auth middleware/,
    );
  });

  it('calls next() without a 403 when the resolver finds no resource', async () => {
    const middleware = createOwnerOnlyAuthorizationMiddleware(async () => null);
    const { req, res, next } = makeReqRes('principal-a');

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  it('responds 403 when the resolved resource belongs to a different principal', async () => {
    const resource: OwnedResource = { ownerPrincipalId: 'principal-b' };
    const middleware = createOwnerOnlyAuthorizationMiddleware(
      async () => resource,
    );
    const { req, res, next } = makeReqRes('principal-a');

    await middleware(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledExactlyOnceWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the resolved resource belongs to the requesting principal', async () => {
    const resource: OwnedResource = { ownerPrincipalId: 'principal-a' };
    const middleware = createOwnerOnlyAuthorizationMiddleware(
      async () => resource,
    );
    const { req, res, next } = makeReqRes('principal-a');

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  describe('mounted in the real app', () => {
    let dataSource: DataSource;
    let aliceCollection: Collection;
    let bobCollection: Collection;

    beforeEach(async () => {
      dataSource = createDataSource(
        {},
        { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
      );
      await dataSource.initialize();
      await dataSource.runMigrations();

      const tenant = await new TenantService(dataSource).createTenant({
        slug: 'acme',
        name: 'Acme Inc.',
      });
      const userService = new UserService(dataSource);
      const alice = await userService.createUser({
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: PASSWORD,
      });
      const bob = await userService.createUser({
        tenantId: tenant.id,
        username: 'bob',
        email: 'bob@example.com',
        password: PASSWORD,
      });

      const collections = dataSource.getRepository(Collection);
      // Only one collection per tenant may have parentCollectionId: null
      // (the tenant's root — see collection.entity.ts), so bob's
      // collection here is a child of alice's root. What matters for this
      // test is only that the two collections have different owners.
      aliceCollection = await collections.save(
        collections.create({
          tenantId: tenant.id,
          parentCollectionId: null,
          ownerPrincipalId: alice.principalId,
          displayName: 'alice-root',
        }),
      );
      bobCollection = await collections.save(
        collections.create({
          tenantId: tenant.id,
          parentCollectionId: aliceCollection.id,
          ownerPrincipalId: bob.principalId,
          displayName: 'bob-sub',
        }),
      );
    });

    afterEach(async () => {
      await dataSource.destroy();
    });

    function mountProbeRoute(app: ReturnType<typeof createApp>): void {
      const collections = dataSource.getRepository(Collection);
      app.get(
        '/dav/:tenantSlug/probe/:collectionId',
        createOwnerOnlyAuthorizationMiddleware(async (req) =>
          collections.findOneBy({ id: req.params.collectionId }),
        ),
        (_req, res) => {
          res.json({ reached: true });
        },
      );
      app.put(
        '/dav/:tenantSlug/probe/:parentId/:newName',
        createOwnerOnlyAuthorizationMiddleware(async (req) =>
          collections.findOneBy({ id: req.params.parentId }),
        ),
        (_req, res) => {
          res.status(201).json({ created: true });
        },
      );
    }

    it('responds 403 when the authenticated principal does not own the target collection', async () => {
      const app = createApp(dataSource);
      mountProbeRoute(app);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe/${bobCollection.id}`,
          { headers: { Authorization: basicAuthHeader('alice', PASSWORD) } },
        );
        expect(response.status).toBe(403);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('reaches the route when the authenticated principal owns the target collection', async () => {
      const app = createApp(dataSource);
      mountProbeRoute(app);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe/${aliceCollection.id}`,
          { headers: { Authorization: basicAuthHeader('alice', PASSWORD) } },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { reached: boolean };
        expect(body.reached).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('allows creating a new resource in a collection the principal owns', async () => {
      const app = createApp(dataSource);
      mountProbeRoute(app);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe/${aliceCollection.id}/new-file.txt`,
          {
            method: 'PUT',
            headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
          },
        );
        expect(response.status).toBe(201);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('refuses to create a new resource in a collection the principal does not own', async () => {
      const app = createApp(dataSource);
      mountProbeRoute(app);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe/${bobCollection.id}/new-file.txt`,
          {
            method: 'PUT',
            headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
          },
        );
        expect(response.status).toBe(403);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
