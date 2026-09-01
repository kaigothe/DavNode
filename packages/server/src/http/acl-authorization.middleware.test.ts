import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  createDataSource,
  createOwnerAllAce,
  FileAce,
  FileContent,
  FileResource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/**
 * End-to-end tests for the real ACL-evaluation authorization middleware
 * (`createAclAuthorizationMiddleware`), replacing M2's owner-only
 * placeholder — milestones/M3-webdav-acl/07-replace-placeholder-authorization.
 * Every M2 route's own test file already re-verifies its own
 * (method, privilege, resource) mapping still gates the owner correctly
 * against the real engine; this file instead covers the cross-method
 * privilege-separation acceptance criteria that only make sense tested
 * across two different methods on the same resource.
 */
describe('ACL authorization middleware (privilege separation across methods)', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;
  let root: Collection;
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
    bob = await userService.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
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
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      root.id,
      alice.principalId,
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

  async function get(path: string, username: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: basicAuthHeader(username, PASSWORD) },
    });
  }

  async function put(
    path: string,
    body: string,
    username: string,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { Authorization: basicAuthHeader(username, PASSWORD) },
      body: new TextEncoder().encode(body),
    });
  }

  it('a grant of read (but not write-content) allows GET but not PUT-overwrite', async () => {
    const file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 5,
        ownerPrincipalId: alice.principalId,
      }),
    );
    await createOwnerAllAce(dataSource.manager, 'file', file.id, alice.principalId);
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from('hello'),
      }),
    );
    await dataSource.getRepository(FileAce).save(
      dataSource.getRepository(FileAce).create({
        fileResourceId: file.id,
        principalId: bob.principalId,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const getResponse = await get('/dav/acme/files/report.txt', 'bob');
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('hello');

    const putResponse = await put(
      '/dav/acme/files/report.txt',
      'overwritten',
      'bob',
    );
    expect(putResponse.status).toBe(403);
  });

  it('a grant of bind (but not write-content) on a collection allows creating new files but not overwriting existing ones', async () => {
    const sub = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'shared',
      }),
    );
    await createOwnerAllAce(dataSource.manager, 'collection', sub.id, alice.principalId);
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: sub.id,
        principalId: bob.principalId,
        privilege: 'bind',
        grantDeny: 'grant',
        position: 1,
      }),
    );

    const existing = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: sub.id,
        name: 'existing.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId: alice.principalId,
      }),
    );
    await createOwnerAllAce(
      dataSource.manager,
      'file',
      existing.id,
      alice.principalId,
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: existing.id,
        data: Buffer.from('old'),
      }),
    );

    const createResponse = await put(
      '/dav/acme/files/shared/new.txt',
      'brand new',
      'bob',
    );
    expect(createResponse.status).toBe(201);

    const overwriteResponse = await put(
      '/dav/acme/files/shared/existing.txt',
      'overwritten',
      'bob',
    );
    expect(overwriteResponse.status).toBe(403);
  });
});
