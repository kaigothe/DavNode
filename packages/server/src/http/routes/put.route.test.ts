import { createHash } from 'node:crypto';
import net, { type AddressInfo } from 'node:net';
import {
  ALL_ENTITIES,
  ALL_SQLITE_MIGRATIONS,
  Collection,
  CollectionAce,
  CollectionChange,
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
import { createApp } from '../../app.js';

const PASSWORD = 'correct horse battery staple';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('PUT route', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let root: Collection;
  let baseUrl: string;
  let port: number;
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
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      root.id,
      alice.principalId,
    );

    const app = createApp(dataSource);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    port = address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dataSource.destroy();
  });

  async function put(
    path: string,
    options: {
      body?: string;
      username?: string;
      contentType?: string;
      ifMatch?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(options.username ?? 'alice', PASSWORD),
    };
    if (options.contentType !== undefined) {
      headers['Content-Type'] = options.contentType;
    }
    if (options.ifMatch !== undefined) {
      headers['If-Match'] = options.ifMatch;
    }
    return fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers,
      // A Uint8Array body (rather than a plain string), so fetch never
      // defaults Content-Type to text/plain;charset=UTF-8 on our
      // behalf — tests that don't pass contentType are exercising the
      // route's own "no Content-Type header at all" default.
      body:
        options.body === undefined
          ? undefined
          : new TextEncoder().encode(options.body),
    });
  }

  async function get(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: basicAuthHeader('alice', PASSWORD) },
    });
  }

  it('creates a new file under an existing parent; it is retrievable via GET', async () => {
    const response = await put('/dav/acme/files/report.txt', {
      body: 'hello',
      contentType: 'text/plain',
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('etag')).toBeTruthy();

    const getResponse = await get('/dav/acme/files/report.txt');
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('hello');
  });

  it('defaults to application/octet-stream when Content-Type is missing', async () => {
    await put('/dav/acme/files/report.bin', { body: 'hello' });

    const file = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'report.bin' });
    expect(file.contentType).toBe('application/octet-stream');
  });

  it('returns 409 when the parent collection does not exist', async () => {
    const response = await put('/dav/acme/files/no-such-parent/report.txt', {
      body: 'hello',
    });

    expect(response.status).toBe(409);
  });

  it('returns 409 when the target path already exists as a collection', async () => {
    await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: root.id,
        ownerPrincipalId: alice.principalId,
        displayName: 'sub',
      }),
    );

    const response = await put('/dav/acme/files/sub', { body: 'hello' });

    expect(response.status).toBe(409);
  });

  it('overwrites an existing file (204), with new content visible via GET and a changed ETag', async () => {
    const first = await put('/dav/acme/files/report.txt', {
      body: 'hello',
      contentType: 'text/plain',
    });
    const firstEtag = first.headers.get('etag');

    const second = await put('/dav/acme/files/report.txt', {
      body: 'goodbye',
      contentType: 'text/plain',
    });

    expect(second.status).toBe(204);
    expect(second.headers.get('etag')).not.toBe(firstEtag);

    const getResponse = await get('/dav/acme/files/report.txt');
    expect(await getResponse.text()).toBe('goodbye');
  });

  it('returns 412 and leaves the content unchanged when If-Match is wrong', async () => {
    await put('/dav/acme/files/report.txt', {
      body: 'hello',
      contentType: 'text/plain',
    });

    const response = await put('/dav/acme/files/report.txt', {
      body: 'goodbye',
      contentType: 'text/plain',
      ifMatch: '"wrong-etag"',
    });

    expect(response.status).toBe(412);
    const getResponse = await get('/dav/acme/files/report.txt');
    expect(await getResponse.text()).toBe('hello');
  });

  it('produces the same ETag for two PUTs with identical content (determinism)', async () => {
    const responseA = await put('/dav/acme/files/a.txt', { body: 'same' });
    const responseB = await put('/dav/acme/files/b.txt', { body: 'same' });

    expect(responseA.headers.get('etag')).toBe(responseB.headers.get('etag'));
    expect(responseA.headers.get('etag')).toBe(
      createHash('sha256').update('same').digest('hex'),
    );
  });

  it('records a collection_changes entry (added) after creation and (modified) after overwrite', async () => {
    await put('/dav/acme/files/report.txt', { body: 'hello' });
    await put('/dav/acme/files/report.txt', { body: 'goodbye' });

    const reloadedRoot = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: root.id });
    expect(reloadedRoot.syncSeq).toBe(2);

    const changes = await dataSource
      .getRepository(CollectionChange)
      .findBy({ collectionId: root.id });
    const actions = changes
      .sort((a, b) => a.seq - b.seq)
      .map((c) => ({ seq: c.seq, name: c.name, action: c.action }));
    expect(actions).toEqual([
      { seq: 1, name: 'report.txt', action: 'added' },
      { seq: 2, name: 'report.txt', action: 'modified' },
    ]);
  });

  it('creates exactly one protected default-owner ACE on new-file creation, and no second one on overwrite', async () => {
    await put('/dav/acme/files/report.txt', { body: 'hello' });

    const file = await dataSource
      .getRepository(FileResource)
      .findOneByOrFail({ collectionId: root.id, name: 'report.txt' });
    const acesAfterCreate = await dataSource
      .getRepository(FileAce)
      .findBy({ fileResourceId: file.id });
    expect(acesAfterCreate).toEqual([
      expect.objectContaining({
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
      }),
    ]);

    await put('/dav/acme/files/report.txt', { body: 'goodbye' });

    const acesAfterOverwrite = await dataSource
      .getRepository(FileAce)
      .findBy({ fileResourceId: file.id });
    expect(acesAfterOverwrite).toHaveLength(1);
  });

  it('returns 403 for a file owned by a different principal', async () => {
    // bobFile is nested under alice's own root, so — via correct RFC
    // 3744 inheritance — she'd otherwise inherit her own root ACE's
    // grant there too; an explicit deny ACE is what actually isolates
    // it.
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
    await createOwnerAllAce(dataSource.manager, 'file', bobFile.id, bob.principalId);
    await dataSource.getRepository(FileAce).save(
      dataSource.getRepository(FileAce).create({
        fileResourceId: bobFile.id,
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'deny',
        position: 1,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: bobFile.id,
        data: Buffer.from('secret'),
      }),
    );

    const response = await put(`/dav/acme/files/${bobFile.name}`, {
      body: 'overwritten',
      username: 'alice',
    });

    expect(response.status).toBe(403);
  });

  it('returns 403 when creating a new file inside a collection owned by a different principal', async () => {
    // bobCollection is nested under alice's own root, so — via correct
    // RFC 3744 inheritance — she'd otherwise inherit her own root ACE's
    // grant there too; an explicit deny ACE is what actually isolates
    // it.
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
    await createOwnerAllAce(
      dataSource.manager,
      'collection',
      bobCollection.id,
      bob.principalId,
    );
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: bobCollection.id,
        principalId: alice.principalId,
        privilege: 'all',
        grantDeny: 'deny',
        position: 1,
      }),
    );

    const response = await put(
      `/dav/acme/files/${bobCollection.displayName}/new.txt`,
      { body: 'hello', username: 'alice' },
    );

    expect(response.status).toBe(403);
  });

  it('returns 400 for a request whose declared Content-Length disagrees with its actual body', async () => {
    // A well-formed HTTP/1.1 client can't produce this directly — the
    // transport layer frames the body *from* Content-Length, so the two
    // agree by construction. The one way to get a completed request
    // through with a stale Content-Length is chunked transfer encoding
    // (which frames the body independently) sent alongside a Content-
    // Length header quoting a different length; RFC 7230 §3.3.3 treats
    // that combination as an error, so raw sockets are used here to
    // send exactly that. Node's own HTTP layer already rejects it with
    // 400 before this app's handler even runs — which is a stronger
    // guarantee than the route's own explicit check (see
    // put.route.ts's Content-Length/body.length comparison) needing to
    // catch it, not a gap in it: the mismatch can't reach that check
    // any other way, and this proves it can't reach it as this
    // malformed request either.
    const status = await new Promise<number>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        const chunkedBody = '5\r\nhello\r\n0\r\n\r\n';
        socket.write(
          `PUT /dav/acme/files/report.txt HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${port}\r\n` +
            `Authorization: ${basicAuthHeader('alice', PASSWORD)}\r\n` +
            `Content-Type: text/plain\r\n` +
            `Content-Length: 100\r\n` +
            `Transfer-Encoding: chunked\r\n` +
            `Connection: close\r\n` +
            `\r\n${chunkedBody}`,
        );
      });
      let response = '';
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString();
      });
      socket.on('error', reject);
      socket.on('close', () => {
        const statusLine = response.split('\r\n')[0] ?? '';
        const match = /^HTTP\/1\.1 (\d+)/.exec(statusLine);
        resolve(match ? Number(match[1]) : 0);
      });
    });

    expect(status).toBe(400);
  });
});
