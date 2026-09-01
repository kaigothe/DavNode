import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  createDataSource,
  DuplicateEntryError,
  NotFoundError,
  TenantService,
  UserService,
  type DataSource,
} from '@davnode/core';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { createBasicAuthMiddleware } from './basic-auth.middleware.js';
import { errorHandlerMiddleware } from './error-handler.middleware.js';
import { createTenantResolutionMiddleware } from './tenant-resolution.middleware.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function makeRes(): Response {
  const res = {
    status: vi.fn(() => res),
    type: vi.fn(() => res),
    send: vi.fn(() => res),
  } as unknown as Response;
  return res;
}

describe('errorHandlerMiddleware', () => {
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('maps NotFoundError to 404 with its message', () => {
    const res = makeRes();
    const error = new NotFoundError('Collection "abc" not found.');

    errorHandlerMiddleware(error, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledExactlyOnceWith(404);
    expect(res.send).toHaveBeenCalledExactlyOnceWith(
      'Collection "abc" not found.',
    );
  });

  it('maps DuplicateEntryError to 409 with its message', () => {
    const res = makeRes();
    const error = new DuplicateEntryError('name', 'Name already in use.');

    errorHandlerMiddleware(error, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledExactlyOnceWith(409);
    expect(res.send).toHaveBeenCalledExactlyOnceWith('Name already in use.');
  });

  it('maps an unknown error to 500 with a generic body, never the original message', () => {
    const res = makeRes();
    const error = new Error('super secret internal detail');

    errorHandlerMiddleware(error, {} as Request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledExactlyOnceWith(500);
    expect(res.send).toHaveBeenCalledExactlyOnceWith('Internal Server Error');
    const sentBody = vi.mocked(res.send).mock.calls[0]?.[0];
    expect(sentBody).not.toContain('super secret internal detail');
  });

  it('logs the full error, including its stack, to the server console', () => {
    const res = makeRes();
    const error = new Error('boom');

    errorHandlerMiddleware(error, {} as Request, res, vi.fn() as NextFunction);

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(error);
    const loggedError = consoleErrorSpy.mock.calls[0]?.[0] as Error;
    expect(loggedError.stack).toBeTruthy();
  });

  describe('mounted in the real app', () => {
    let dataSource: DataSource;

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

    it('turns an unexpected thrown error into a 500 with no stack trace in the body', async () => {
      // Not createApp(): its error handler is mounted last, as it must be
      // in the real app (see app.ts) so it can catch errors from every
      // real DAV route added later — but that also means a route added
      // to the returned app *after* the fact, as every other middleware
      // test in this package does with a temporary probe route, would
      // land after the error handler in Express's middleware stack and
      // never reach it. Building the same three-piece pipeline directly
      // here, with the throwing probe route mounted before the error
      // handler, is what exercises the real error-handling path.
      const app = express();
      app.use('/dav/:tenantSlug', createTenantResolutionMiddleware(dataSource));
      app.use('/dav/:tenantSlug', createBasicAuthMiddleware(dataSource));
      app.get('/dav/:tenantSlug/probe', () => {
        // Simulates an unexpected failure (e.g. a database outage)
        // reaching all the way up from a route handler.
        throw new Error('simulated unexpected database failure');
      });
      app.use(errorHandlerMiddleware);
      const server = app.listen(0);
      const address = server.address() as AddressInfo;

      try {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/dav/acme/probe`,
          { headers: { Authorization: basicAuthHeader('alice', PASSWORD) } },
        );

        expect(response.status).toBe(500);
        const body = await response.text();
        expect(body).not.toContain('simulated unexpected database failure');
        expect(body).not.toContain('.ts:');
        expect(consoleErrorSpy).toHaveBeenCalledOnce();
        const loggedError = consoleErrorSpy.mock.calls[0]?.[0] as Error;
        expect(loggedError.message).toBe(
          'simulated unexpected database failure',
        );
        expect(loggedError.stack).toBeTruthy();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
