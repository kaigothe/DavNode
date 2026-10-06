import type { AddressInfo } from 'node:net';
import {
  CycleDetectedError,
  DuplicateEntryError,
  NotFoundError,
} from '@davnode/core';
import express, { type Express } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminErrorHandler } from './admin-error-handler.middleware.js';
import type { AdminErrorBody } from './admin-error-response.js';

describe('adminErrorHandler', () => {
  let app: Express;
  let server: ReturnType<Express['listen']>;
  let baseUrl: string;

  beforeEach(() => {
    app = express();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function listenAndMount(error: unknown): void {
    app.get('/throw', () => {
      throw error;
    });
    app.use(adminErrorHandler);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  it('maps NotFoundError to 404 with code "not_found"', async () => {
    listenAndMount(new NotFoundError('Tenant "nope" not found.'));

    const response = await fetch(`${baseUrl}/throw`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe('Tenant "nope" not found.');
  });

  it('maps DuplicateEntryError to 409 with code "duplicate_entry"', async () => {
    listenAndMount(
      new DuplicateEntryError('slug', 'Tenant slug "acme" is already in use.'),
    );

    const response = await fetch(`${baseUrl}/throw`);

    expect(response.status).toBe(409);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('duplicate_entry');
    expect(body.error.message).toBe('Tenant slug "acme" is already in use.');
  });

  it('maps CycleDetectedError to 409 with code "cycle_detected"', async () => {
    listenAndMount(
      new CycleDetectedError('Adding this membership would create a cycle.'),
    );

    const response = await fetch(`${baseUrl}/throw`);

    expect(response.status).toBe(409);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('cycle_detected');
  });

  it('maps an unrecognized error to a generic 500, never echoing its message', async () => {
    listenAndMount(new Error('a very specific internal detail'));

    const response = await fetch(`${baseUrl}/throw`);

    expect(response.status).toBe(500);
    const body = (await response.json()) as AdminErrorBody;
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('a very specific internal detail');
    expect(JSON.stringify(body)).not.toContain(
      'a very specific internal detail',
    );
  });

  it('always answers with the shared {error: {code, message}} envelope shape', async () => {
    listenAndMount(new NotFoundError('x'));

    const response = await fetch(`${baseUrl}/throw`);

    const body = (await response.json()) as AdminErrorBody;
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });
});
