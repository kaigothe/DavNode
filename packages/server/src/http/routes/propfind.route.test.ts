import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionProperty,
  createDataSource,
  FileResource,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { create } from 'xmlbuilder2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('PROPFIND route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
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

    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
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

  async function propfind(
    path: string,
    options: { depth?: string; body?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader('alice', PASSWORD),
    };
    if (options.depth !== undefined) {
      headers.Depth = options.depth;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers,
      body: options.body,
    });
  }

  function responseHrefs(xml: string): string[] {
    const root = create(xml).root();
    return root
      .filter((n) => n.node.localName === 'href', false, true)
      .map((n) => n.node.textContent ?? '');
  }

  it('Depth: 0 on a collection returns only the collection itself', async () => {
    await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'sub',
      }),
    );
    await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId: alice.principalId,
      }),
    );

    const response = await propfind('/dav/acme/files', { depth: '0' });

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(responseHrefs(body)).toEqual(['/dav/acme/files']);
  });

  it('Depth: 1 on a collection with two children returns three <D:response> entries', async () => {
    await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'sub',
      }),
    );
    await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: root.id,
        name: 'report.txt',
        contentType: 'text/plain',
        etag: '"1"',
        sizeBytes: 3,
        ownerPrincipalId: alice.principalId,
      }),
    );

    const response = await propfind('/dav/acme/files', { depth: '1' });

    expect(response.status).toBe(207);
    const body = await response.text();
    const hrefs = responseHrefs(body);
    expect(hrefs).toHaveLength(3);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/dav/acme/files',
        '/dav/acme/files/sub',
        '/dav/acme/files/report.txt',
      ]),
    );
  });

  it('rejects Depth: infinity with 403', async () => {
    const response = await propfind('/dav/acme/files', {
      depth: 'infinity',
    });

    expect(response.status).toBe(403);
  });

  it('rejects a missing Depth header with 403', async () => {
    const response = await propfind('/dav/acme/files');

    expect(response.status).toBe(403);
  });

  it('an allprop request returns the live properties from the property provider', async () => {
    const response = await propfind('/dav/acme/files', {
      depth: '0',
      body: '<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>',
    });

    expect(response.status).toBe(207);
    const body = await response.text();
    const doc = create(body).root();
    const names = doc
      .filter((n) => n.node.localName === 'prop', false, true)[0]!
      .filter(() => true, false, true)
      .map((n) => n.node.localName);
    expect(names).toEqual(
      expect.arrayContaining(['displayname', 'resourcetype', 'creationdate']),
    );
  });

  it('a missing body defaults to allprop', async () => {
    const response = await propfind('/dav/acme/files', { depth: '0' });

    expect(response.status).toBe(207);
    const body = await response.text();
    expect(body).toContain('displayname');
  });

  it('a prop request for a non-existent property gets a 404 propstat, the rest stay 200', async () => {
    const requestBody = `<D:propfind xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:prop>
        <D:displayname/>
        <C:does-not-exist/>
      </D:prop>
    </D:propfind>`;

    const response = await propfind('/dav/acme/files', {
      depth: '0',
      body: requestBody,
    });

    expect(response.status).toBe(207);
    const body = await response.text();
    const doc = create(body).root();
    const propstats = doc.filter(
      (n) => n.node.localName === 'propstat',
      false,
      true,
    );
    expect(propstats).toHaveLength(2);

    const statusTexts = doc
      .filter((n) => n.node.localName === 'status', false, true)
      .map((n) => n.node.textContent);
    expect(statusTexts).toEqual(
      expect.arrayContaining(['HTTP/1.1 200 OK', 'HTTP/1.1 404 Not Found']),
    );
  });

  it('a prop request also returns a matching dead property', async () => {
    await dataSource.getRepository(CollectionProperty).save(
      dataSource.getRepository(CollectionProperty).create({
        collectionId: root.id,
        namespace: 'urn:example:ns',
        name: 'color',
        value: 'blue',
      }),
    );

    const requestBody = `<D:propfind xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:prop><C:color/></D:prop>
    </D:propfind>`;

    const response = await propfind('/dav/acme/files', {
      depth: '0',
      body: requestBody,
    });

    const body = await response.text();
    const doc = create(body).root();
    const colorValues = doc
      .filter((n) => n.node.localName === 'color', false, true)
      .map((n) => n.node.textContent);
    expect(colorValues).toEqual(['blue']);
  });

  it('returns 404 for a path that does not exist', async () => {
    const response = await propfind('/dav/acme/files/no-such-file', {
      depth: '0',
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for a resource owned by a different principal', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const bobCollection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: bob.principalId,
        displayName: 'bobs-folder',
      }),
    );

    const response = await propfind(
      `/dav/acme/files/${bobCollection.displayName}`,
      {
        depth: '0',
      },
    );

    expect(response.status).toBe(403);
  });
});
