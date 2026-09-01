import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionProperty,
  createDataSource,
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

describe('PROPPATCH route', () => {
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

  async function proppatch(
    path: string,
    body: string,
    username = 'alice',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: 'PROPPATCH',
      headers: {
        Authorization: basicAuthHeader(username, PASSWORD),
        'Content-Type': 'application/xml',
      },
      body,
    });
  }

  async function propfindAllprop(path: string): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuthHeader('alice', PASSWORD),
        Depth: '0',
      },
    });
    return response.text();
  }

  function statusesByPropertyName(xml: string): Record<string, string> {
    const root = create(xml).root();
    const result: Record<string, string> = {};
    for (const propstat of root.filter(
      (n) => n.node.localName === 'propstat',
      false,
      true,
    )) {
      const status = propstat.filter(
        (n) => n.node.localName === 'status',
        false,
        true,
      )[0]!.node.textContent!;
      const prop = propstat.filter(
        (n) => n.node.localName === 'prop',
        false,
        true,
      )[0]!;
      for (const propertyEl of prop.filter(() => true, false, true)) {
        result[propertyEl.node.localName] = status;
      }
    }
    return result;
  }

  it('applies a request with only valid dead-property changes; a later PROPFIND shows the new values', async () => {
    const body = `<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:set><D:prop><C:color>blue</C:color></D:prop></D:set>
    </D:propertyupdate>`;

    const response = await proppatch('/dav/acme/files', body);

    expect(response.status).toBe(207);
    const statuses = statusesByPropertyName(await response.text());
    expect(statuses.color).toBe('HTTP/1.1 200 OK');

    const propfindBody = await propfindAllprop('/dav/acme/files');
    expect(propfindBody).toContain(
      '<color xmlns="urn:example:ns">blue</color>',
    );
  });

  it('rejects a request mixing a live property and a valid dead property entirely (atomicity)', async () => {
    const body = `<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:set>
        <D:prop>
          <D:displayname>new name</D:displayname>
          <C:color>blue</C:color>
        </D:prop>
      </D:set>
    </D:propertyupdate>`;

    const response = await proppatch('/dav/acme/files', body);

    expect(response.status).toBe(207);
    const statuses = statusesByPropertyName(await response.text());
    expect(statuses.displayname).toBe('HTTP/1.1 403 Forbidden');
    expect(statuses.color).toBe('HTTP/1.1 424 Failed Dependency');

    // Neither change took effect: displayname is unchanged, and the
    // dead property was never persisted.
    const properties = await dataSource
      .getRepository(CollectionProperty)
      .findBy({ collectionId: root.id });
    expect(properties).toEqual([]);
    const reloaded = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: root.id });
    expect(reloaded.displayName).toBe('root');
  });

  it('reports 200, not an error, when removing a property that was never set', async () => {
    const body = `<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:remove><D:prop><C:never-set/></D:prop></D:remove>
    </D:propertyupdate>`;

    const response = await proppatch('/dav/acme/files', body);

    expect(response.status).toBe(207);
    const statuses = statusesByPropertyName(await response.text());
    expect(statuses['never-set']).toBe('HTTP/1.1 200 OK');
  });

  it('overwrites the same property across two requests without duplicating the row', async () => {
    const setBody = (
      value: string,
    ): string => `<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns">
      <D:set><D:prop><C:color>${value}</C:color></D:prop></D:set>
    </D:propertyupdate>`;

    await proppatch('/dav/acme/files', setBody('blue'));
    await proppatch('/dav/acme/files', setBody('green'));

    const rows = await dataSource
      .getRepository(CollectionProperty)
      .findBy({ collectionId: root.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe('green');
  });

  it('returns 404 for a path that does not exist', async () => {
    const response = await proppatch(
      '/dav/acme/files/no-such-file',
      '<D:propertyupdate xmlns:D="DAV:"><D:remove><D:prop><D:foo/></D:prop></D:remove></D:propertyupdate>',
    );

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

    const response = await proppatch(
      `/dav/acme/files/${bobCollection.displayName}`,
      '<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:example:ns"><D:set><D:prop><C:color>blue</C:color></D:prop></D:set></D:propertyupdate>',
      'alice',
    );

    expect(response.status).toBe(403);
  });
});
