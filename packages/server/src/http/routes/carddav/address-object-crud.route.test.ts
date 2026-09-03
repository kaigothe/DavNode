import type { AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  AddressbookChange,
  AddressbookCollection,
  AddressObject,
  AddressObjectAce,
  AddressObjectContent,
  AddressObjectIndex,
  AddressObjectProperty,
  createDataSource,
  createOwnerAllAce,
  TenantService,
  UserService,
  type DataSource,
  type Tenant,
  type User,
} from '@davnode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function vcard(uid: string, fn = 'Forrest Gump'): string {
  return [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:${uid}`,
    `FN:${fn}`,
    'EMAIL;TYPE=work:forrest@example.com',
    'EMAIL;TYPE=home:forrest@home.example.com',
    'END:VCARD',
  ].join('\r\n');
}

describe('CardDAV AddressObject CRUD routes', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let addressbook: AddressbookCollection;
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
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'Contacts',
      }),
    );
    await createOwnerAllAce(
      dataSource.manager,
      'addressbook',
      addressbook.id,
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

  function objectUrl(name: string): string {
    return `/dav/acme/addressbooks/${alice.principalId}/${addressbook.displayName}/${name}`;
  }

  async function put(
    name: string,
    options: { body?: string; username?: string; ifMatch?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      'Content-Type': 'text/vcard; charset=utf-8',
    };
    if (options.ifMatch !== undefined) {
      headers['If-Match'] = options.ifMatch;
    }
    return fetch(`${baseUrl}${objectUrl(name)}`, {
      method: 'PUT',
      headers,
      body: options.body,
    });
  }

  async function get(
    name: string,
    options: { username?: string } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${objectUrl(name)}`, {
      headers: {
        Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      },
    });
  }

  async function del(
    name: string,
    options: { username?: string } = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${objectUrl(name)}`, {
      method: 'DELETE',
      headers: {
        Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
      },
    });
  }

  it('PUT of a valid vCard creates a contact; GET returns it with Content-Type: text/vcard', async () => {
    const putResponse = await put('forrest.vcf', {
      body: vcard('uid-1'),
    });
    expect(putResponse.status).toBe(201);
    expect(putResponse.headers.get('etag')).toBeTruthy();

    const getResponse = await get('forrest.vcf');
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('content-type')).toBe(
      'text/vcard; charset=utf-8',
    );
    expect(await getResponse.text()).toBe(vcard('uid-1'));
  });

  it('PUT with invalid vCard content returns 400 and writes nothing', async () => {
    const response = await put('bad.vcf', { body: 'not a vcard at all' });

    expect(response.status).toBe(400);
    await expect(
      dataSource
        .getRepository(AddressObject)
        .findOneBy({ addressbookId: addressbook.id, name: 'bad.vcf' }),
    ).resolves.toBeNull();
  });

  it('PUT with a UID already used under a different URL in the same addressbook returns 409', async () => {
    await put('first.vcf', { body: vcard('shared-uid') });

    const response = await put('second.vcf', { body: vcard('shared-uid') });

    expect(response.status).toBe(409);
    await expect(
      dataSource
        .getRepository(AddressObject)
        .findOneBy({ addressbookId: addressbook.id, name: 'second.vcf' }),
    ).resolves.toBeNull();
  });

  it('allows re-PUTting the same UID at its own existing URL (update, not a conflict)', async () => {
    await put('forrest.vcf', { body: vcard('uid-1', 'Forrest Gump') });

    const response = await put('forrest.vcf', {
      body: vcard('uid-1', 'Forrest Gump Jr.'),
    });

    expect(response.status).toBe(204);
  });

  it('PUT returns 409 when the target addressbook does not exist', async () => {
    const response = await fetch(
      `${baseUrl}/dav/acme/addressbooks/${alice.principalId}/NoSuchBook/x.vcf`,
      {
        method: 'PUT',
        headers: {
          Authorization: basicAuthHeader('alice', PASSWORD),
          'Content-Type': 'text/vcard',
        },
        body: vcard('uid-1'),
      },
    );

    expect(response.status).toBe(409);
  });

  it('after PUT, matching AddressObjectIndex rows exist (cross-check with vCard indexing)', async () => {
    await put('forrest.vcf', { body: vcard('uid-1') });

    const addressObject = await dataSource
      .getRepository(AddressObject)
      .findOneByOrFail({ addressbookId: addressbook.id, name: 'forrest.vcf' });
    const emailRows = await dataSource
      .getRepository(AddressObjectIndex)
      .findBy({ addressObjectId: addressObject.id, propertyName: 'EMAIL' });
    expect(emailRows).toHaveLength(2);
    expect(emailRows.map((r) => r.propertyValue).sort()).toEqual(
      ['forrest@example.com', 'forrest@home.example.com'].sort(),
    );
  });

  it('creates a default-owner ACE on the new AddressObject', async () => {
    await put('forrest.vcf', { body: vcard('uid-1') });

    const addressObject = await dataSource
      .getRepository(AddressObject)
      .findOneByOrFail({ addressbookId: addressbook.id, name: 'forrest.vcf' });
    const aces = await dataSource
      .getRepository(AddressObjectAce)
      .findBy({ addressObjectId: addressObject.id });
    expect(aces).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
      }),
    ]);
  });

  it('records an AddressbookChange entry (added, then modified) and bumps syncSeq', async () => {
    await put('forrest.vcf', { body: vcard('uid-1', 'A') });
    await put('forrest.vcf', { body: vcard('uid-1', 'B') });

    const reloaded = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbook.id });
    expect(reloaded.syncSeq).toBe(2);

    const changes = await dataSource
      .getRepository(AddressbookChange)
      .findBy({ addressbookId: addressbook.id });
    const actions = changes
      .sort((a, b) => a.seq - b.seq)
      .map((c) => ({ seq: c.seq, name: c.name, action: c.action }));
    expect(actions).toEqual([
      { seq: 1, name: 'forrest.vcf', action: 'added' },
      { seq: 2, name: 'forrest.vcf', action: 'modified' },
    ]);
  });

  it('returns 412 and leaves content unchanged when If-Match is wrong', async () => {
    const first = await put('forrest.vcf', { body: vcard('uid-1', 'A') });
    const firstEtag = first.headers.get('etag');

    const response = await put('forrest.vcf', {
      body: vcard('uid-1', 'B'),
      ifMatch: '"wrong-etag"',
    });

    expect(response.status).toBe(412);
    const getResponse = await get('forrest.vcf');
    expect(getResponse.headers.get('etag')).toBe(firstEtag);
    expect(await getResponse.text()).toBe(vcard('uid-1', 'A'));
  });

  it('DELETE removes the AddressObject, its content, index rows, and dead properties, with no orphans', async () => {
    await put('forrest.vcf', { body: vcard('uid-1') });
    const addressObject = await dataSource
      .getRepository(AddressObject)
      .findOneByOrFail({ addressbookId: addressbook.id, name: 'forrest.vcf' });
    await dataSource.getRepository(AddressObjectProperty).save(
      dataSource.getRepository(AddressObjectProperty).create({
        addressObjectId: addressObject.id,
        namespace: 'DAV:',
        name: 'custom-prop',
        value: 'custom-value',
      }),
    );

    const response = await del('forrest.vcf');

    expect(response.status).toBe(204);
    await expect(
      dataSource
        .getRepository(AddressObject)
        .findOneBy({ id: addressObject.id }),
    ).resolves.toBeNull();
    await expect(
      dataSource
        .getRepository(AddressObjectContent)
        .findOneBy({ addressObjectId: addressObject.id }),
    ).resolves.toBeNull();
    await expect(
      dataSource
        .getRepository(AddressObjectIndex)
        .findBy({ addressObjectId: addressObject.id }),
    ).resolves.toEqual([]);
    await expect(
      dataSource
        .getRepository(AddressObjectProperty)
        .findBy({ addressObjectId: addressObject.id }),
    ).resolves.toEqual([]);
    await expect(
      dataSource
        .getRepository(AddressObjectAce)
        .findBy({ addressObjectId: addressObject.id }),
    ).resolves.toEqual([]);
  });

  it('DELETE records an AddressbookChange entry (deleted)', async () => {
    await put('forrest.vcf', { body: vcard('uid-1') });

    await del('forrest.vcf');

    const changes = await dataSource
      .getRepository(AddressbookChange)
      .findBy({ addressbookId: addressbook.id, action: 'deleted' });
    expect(changes).toEqual([
      expect.objectContaining({ name: 'forrest.vcf', action: 'deleted' }),
    ]);
  });

  it('returns 404 for GET/DELETE of a nonexistent contact', async () => {
    expect((await get('nonexistent.vcf')).status).toBe(404);
    expect((await del('nonexistent.vcf')).status).toBe(404);
  });

  it('returns 403 for another user acting on this addressbook', async () => {
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    await put('forrest.vcf', { body: vcard('uid-1') });

    const getResponse = await get('forrest.vcf', { username: 'bob' });
    const putResponse = await put('forrest.vcf', {
      body: vcard('uid-1'),
      username: 'bob',
    });
    const deleteResponse = await del('forrest.vcf', { username: 'bob' });

    expect(getResponse.status).toBe(403);
    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
  });
});
