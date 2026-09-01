import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  createDataSource,
  FileContent,
  FileResource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('GET route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let root: Collection;
  let file: FileResource;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

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
    const userService = new UserService(dataSource);
    alice = await userService.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });

    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
      }),
    );

    file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"abc123"',
        sizeBytes: 5,
        ownerPrincipalId: alice.principalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  async function get(
    path: string,
    options: { username?: string; ifNoneMatch?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.ifNoneMatch !== undefined) {
      headers['If-None-Match'] = options.ifNoneMatch;
    }
    return fetch(`${baseUrl}${path}`, { headers });
  }

  it('returns the body, Content-Type, Content-Length, and ETag for an existing file', async () => {
    const response = await get('/dav/acme/files/report.txt');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
    // Express appends a default charset for recognized text MIME types
    // (text/plain, text/html, application/json, ...), leaving genuinely
    // binary content types untouched — standard, correct HTTP behavior,
    // not something this route opts into or out of.
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('content-length')).toBe('5');
    expect(response.headers.get('etag')).toBe('"abc123"');
  });

  it('returns 304 with no body when If-None-Match matches the current ETag', async () => {
    const response = await get('/dav/acme/files/report.txt', {
      ifNoneMatch: '"abc123"',
    });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
    expect(response.headers.get('etag')).toBe('"abc123"');
  });

  it('returns the full content when If-None-Match is stale', async () => {
    const response = await get('/dav/acme/files/report.txt', {
      ifNoneMatch: '"stale-etag"',
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
  });

  it('returns 405 for GET on a collection', async () => {
    const response = await get('/dav/acme/files');

    expect(response.status).toBe(405);
  });

  it('returns 404 for a path that does not exist', async () => {
    const response = await get('/dav/acme/files/no-such-file');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a file owned by a different principal', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const bobFile = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'secret.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 6,
        ownerPrincipalId: bob.principalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: bobFile.id,
        data: Buffer.from('secret'),
      }),
    );

    const response = await get(`/dav/acme/files/${bobFile.name}`, {
      username: 'alice',
    });

    expect(response.status).toBe(403);
  });
});
