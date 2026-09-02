import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionAce,
  FileContent,
  FileResource,
  Principal,
  Tenant,
} from '../../entities/index.js';
import { ALL_MIGRATIONS } from '../../migrations/sqlite/index.js';
import { TenantService } from '../../services/tenant.service.js';
import { UserService } from '../../services/user.service.js';
import type { ReportContext } from '../report-registry.js';
import { CollectionChangeService } from '../collection-change.service.js';
import { SyncCollectionReportHandler } from './sync-collection-report.js';
import { decodeSyncToken, encodeSyncToken } from './sync-token.js';

const PASSWORD = 'correct horse battery staple';

function requestBody(syncToken = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>${syncToken}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop><D:getetag/></D:prop>
</D:sync-collection>`;
}

function hrefsInMultistatus(xml: string): string[] {
  return [...xml.matchAll(/<D:href>([^<]*)<\/D:href>/g)].map((m) => m[1] ?? '');
}

function responseCount(xml: string): number {
  return [...xml.matchAll(/<D:response>/g)].length;
}

function extractSyncToken(xml: string): string {
  const match = /<D:sync-token>([^<]*)<\/D:sync-token>/.exec(xml);
  if (!match?.[1]) {
    throw new Error('No sync-token found in response');
  }
  return match[1];
}

describe('SyncCollectionReportHandler', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let principal: Principal;
  let root: Collection;
  let handler: SyncCollectionReportHandler;
  let collectionChanges: CollectionChangeService;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    const user = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    principal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: user.principalId });
    root = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: principal.id,
        displayName: 'root',
      }),
    );
    await dataSource.getRepository(CollectionAce).save(
      dataSource.getRepository(CollectionAce).create({
        collectionId: root.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );

    handler = new SyncCollectionReportHandler();
    collectionChanges = new CollectionChangeService();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(): ReportContext {
    return {
      tenant,
      principal,
      manager: dataSource.manager,
      segments: ['files'],
    };
  }

  async function addFile(name: string): Promise<FileResource> {
    return dataSource.transaction(async (manager) => {
      const file = await manager.getRepository(FileResource).save(
        manager.getRepository(FileResource).create({
          tenantId: tenant.id,
          collectionId: root.id,
          name,
          contentType: 'text/plain',
          etag: `etag-${name}`,
          sizeBytes: 1,
          ownerPrincipalId: principal.id,
        }),
      );
      await manager
        .getRepository(FileContent)
        .save(
          manager
            .getRepository(FileContent)
            .create({ fileResourceId: file.id, data: Buffer.from('x') }),
        );
      await collectionChanges.recordChange(manager, root.id, name, 'added');
      return file;
    });
  }

  async function modifyFile(file: FileResource): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager
        .getRepository(FileResource)
        .update({ id: file.id }, { etag: `${file.etag}-v2` });
      await collectionChanges.recordChange(manager, root.id, file.name, 'modified');
    });
  }

  async function deleteFile(file: FileResource): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(FileContent).delete({ fileResourceId: file.id });
      await manager.getRepository(FileResource).delete({ id: file.id });
      await collectionChanges.recordChange(manager, root.id, file.name, 'deleted');
    });
  }

  async function currentSyncSeq(): Promise<number> {
    const reloaded = await dataSource
      .getRepository(Collection)
      .findOneByOrFail({ id: root.id });
    return reloaded.syncSeq;
  }

  it('an initial sync (empty token) reports every current child as 200', async () => {
    await addFile('a.txt');
    await addFile('b.txt');

    const result = await handler.handle(requestBody(), context());

    expect(result.status).toBe(207);
    expect(responseCount(result.body)).toBe(2);
    expect(hrefsInMultistatus(result.body)).toEqual([
      '/dav/acme/files/a.txt',
      '/dav/acme/files/b.txt',
    ]);
    expect(result.body).toContain('HTTP/1.1 200 OK');
  });

  it('a sync with a valid older token reports only the changes since then', async () => {
    await addFile('a.txt');
    const initial = await handler.handle(requestBody(), context());
    const token = extractSyncToken(initial.body);

    await addFile('b.txt');

    const result = await handler.handle(requestBody(token), context());

    expect(result.status).toBe(207);
    expect(responseCount(result.body)).toBe(1);
    expect(hrefsInMultistatus(result.body)).toEqual(['/dav/acme/files/b.txt']);
  });

  it('a resource deleted since the last sync appears with 404', async () => {
    const file = await addFile('a.txt');
    const initial = await handler.handle(requestBody(), context());
    const token = extractSyncToken(initial.body);

    await deleteFile(file);

    const result = await handler.handle(requestBody(token), context());

    expect(responseCount(result.body)).toBe(1);
    expect(hrefsInMultistatus(result.body)).toEqual(['/dav/acme/files/a.txt']);
    expect(result.body).toContain('<D:status>HTTP/1.1 404 Not Found</D:status>');
    expect(result.body).not.toContain('<D:propstat>');
  });

  it('a resource added and then deleted within the same sync window is reported as removed (RFC 6578 §3.5.2), not omitted', async () => {
    const initial = await handler.handle(requestBody(), context());
    const token = extractSyncToken(initial.body);

    const file = await addFile('ephemeral.txt');
    await deleteFile(file);

    const result = await handler.handle(requestBody(token), context());

    expect(responseCount(result.body)).toBe(1);
    expect(hrefsInMultistatus(result.body)).toEqual([
      '/dav/acme/files/ephemeral.txt',
    ]);
    expect(result.body).toContain('<D:status>HTTP/1.1 404 Not Found</D:status>');
  });

  it('a resource added and then modified within the same window is reported only once, with its current state', async () => {
    const initial = await handler.handle(requestBody(), context());
    const token = extractSyncToken(initial.body);

    const file = await addFile('doc.txt');
    await modifyFile(file);

    const result = await handler.handle(requestBody(token), context());

    expect(responseCount(result.body)).toBe(1);
    expect(hrefsInMultistatus(result.body)).toEqual(['/dav/acme/files/doc.txt']);
    expect(result.body).toContain('HTTP/1.1 200 OK');
  });

  it('the new sync-token, used again with no intervening changes, yields an empty result', async () => {
    await addFile('a.txt');
    const first = await handler.handle(requestBody(), context());
    const token = extractSyncToken(first.body);

    const second = await handler.handle(requestBody(token), context());

    expect(second.status).toBe(207);
    expect(responseCount(second.body)).toBe(0);
  });

  it('the returned sync-token encodes the collection id and current syncSeq', async () => {
    await addFile('a.txt');
    const result = await handler.handle(requestBody(), context());
    const token = extractSyncToken(result.body);

    expect(decodeSyncToken(token)).toEqual({
      collectionId: root.id,
      seq: await currentSyncSeq(),
    });
  });

  it('rejects a token for a different collection with 403 and valid-sync-token', async () => {
    const otherCollectionToken = encodeSyncToken('not-this-collection', 1);

    const result = await handler.handle(
      requestBody(otherCollectionToken),
      context(),
    );

    expect(result.status).toBe(403);
    expect(result.body).toContain('valid-sync-token');
  });

  it('rejects a token whose seq is ahead of the collection syncSeq with 403', async () => {
    const aheadToken = encodeSyncToken(root.id, 999);

    const result = await handler.handle(requestBody(aheadToken), context());

    expect(result.status).toBe(403);
    expect(result.body).toContain('valid-sync-token');
  });

  it('rejects sync-level infinite with 400', async () => {
    const body = `<D:sync-collection xmlns:D="DAV:"><D:sync-token/><D:sync-level>infinite</D:sync-level><D:prop><D:getetag/></D:prop></D:sync-collection>`;

    const result = await handler.handle(body, context());

    expect(result.status).toBe(400);
  });

  it('rejects a request for a resource the principal cannot read with 403', async () => {
    const other = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const bobPrincipal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: other.principalId });

    const result = await handler.handle(requestBody(), {
      tenant,
      principal: bobPrincipal,
      manager: dataSource.manager,
      segments: ['files'],
    });

    expect(result.status).toBe(403);
  });

  it('returns 404 for a REPORT targeting a path outside the files tree', async () => {
    const result = await handler.handle(requestBody(), {
      tenant,
      principal,
      manager: dataSource.manager,
      segments: ['principals'],
    });

    expect(result.status).toBe(404);
  });
});
