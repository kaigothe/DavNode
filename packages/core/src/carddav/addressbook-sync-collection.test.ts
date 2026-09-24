import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookCollection,
  AddressObject,
  Collection,
  CollectionAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import type { ReportContext } from '../webdav/report-registry.js';
import { SyncCollectionReportHandler } from '../webdav/sync/sync-collection-report.js';
import { encodeSyncToken } from '../webdav/sync/sync-token.js';
import { WebDavSyncCollectionDomain } from '../webdav/sync/webdav-sync-domain.js';
import { AddressbookChangeService } from './addressbook-change.service.js';
import { AddressbookSyncCollectionDomain } from './addressbook-sync-domain.js';

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

function extractSyncToken(xml: string): string {
  const match = /<D:sync-token>([^<]*)<\/D:sync-token>/.exec(xml);
  if (!match?.[1]) {
    throw new Error('No sync-token found in response');
  }
  return match[1];
}

describe('SyncCollectionReportHandler for addressbooks', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let principal: Principal;
  let stranger: Principal;
  let addressbook: AddressbookCollection;
  let handler: SyncCollectionReportHandler;
  let changes: AddressbookChangeService;

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
    principal = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: alice.principalId });
    stranger = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ id: bob.principalId });

    addressbook = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        displayName: 'Contacts',
      }),
    );
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: addressbook.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );

    handler = new SyncCollectionReportHandler([
      new WebDavSyncCollectionDomain(),
      new AddressbookSyncCollectionDomain(),
    ]);
    changes = new AddressbookChangeService();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(overrides: Partial<ReportContext> = {}): ReportContext {
    return {
      tenant,
      principal,
      manager: dataSource.manager,
      segments: ['addressbooks', principal.id, 'Contacts'],
      ...overrides,
    };
  }

  async function addContact(name: string): Promise<AddressObject> {
    return dataSource.transaction(async (manager) => {
      const contact = await manager.getRepository(AddressObject).save(
        manager.getRepository(AddressObject).create({
          tenantId: tenant.id,
          addressbookId: addressbook.id,
          name,
          uid: `uid-${name}`,
          etag: `etag-${name}`,
          ownerPrincipalId: principal.id,
        }),
      );
      await changes.recordChange(manager, addressbook.id, name, 'added');
      return contact;
    });
  }

  async function modifyContact(contact: AddressObject): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AddressObject)
        .update({ id: contact.id }, { etag: `${contact.etag}-v2` });
      await changes.recordChange(
        manager,
        addressbook.id,
        contact.name,
        'modified',
      );
    });
  }

  async function deleteContact(contact: AddressObject): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AddressObject).delete({ id: contact.id });
      await changes.recordChange(
        manager,
        addressbook.id,
        contact.name,
        'deleted',
      );
    });
  }

  it('an initial sync (empty token) reports every current contact as 200 with its ETag', async () => {
    await addContact('a.vcf');
    await addContact('b.vcf');

    const result = await handler.handle(requestBody(), context());

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/addressbooks/${principal.id}/Contacts/a.vcf`,
      `/dav/acme/addressbooks/${principal.id}/Contacts/b.vcf`,
    ]);
    expect(result.body).toContain('HTTP/1.1 200 OK');
    expect(result.body).toContain('<D:getetag>etag-a.vcf</D:getetag>');
    expect(result.body).toContain('<D:getetag>etag-b.vcf</D:getetag>');
  });

  it('a sync with a valid older token reports only new and modified contacts since then', async () => {
    const a = await addContact('a.vcf');
    await addContact('b.vcf');
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );

    await addContact('c.vcf');
    await modifyContact(a);

    const result = await handler.handle(requestBody(token), context());

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body).sort()).toEqual([
      `/dav/acme/addressbooks/${principal.id}/Contacts/a.vcf`,
      `/dav/acme/addressbooks/${principal.id}/Contacts/c.vcf`,
    ]);
    expect(result.body).not.toContain('b.vcf');
    expect(result.body).toContain('<D:getetag>etag-a.vcf-v2</D:getetag>');
  });

  it('a contact deleted since the last sync is reported with a bare 404 and no propstat', async () => {
    const a = await addContact('a.vcf');
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );

    await deleteContact(a);

    const result = await handler.handle(requestBody(token), context());

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/addressbooks/${principal.id}/Contacts/a.vcf`,
    ]);
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
    expect(result.body).not.toContain('<D:propstat>');
  });

  it('a contact added and deleted between two syncs is still reported as removed (RFC 6578 §3.5.2)', async () => {
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );
    const ghost = await addContact('ghost.vcf');
    await deleteContact(ghost);

    const result = await handler.handle(requestBody(token), context());

    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/addressbooks/${principal.id}/Contacts/ghost.vcf`,
    ]);
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
  });

  it('the returned sync token round-trips: an immediate re-sync reports no changes', async () => {
    await addContact('a.vcf');
    const first = await handler.handle(requestBody(), context());
    const token = extractSyncToken(first.body);

    const second = await handler.handle(requestBody(token), context());

    expect(second.status).toBe(207);
    expect(hrefsInMultistatus(second.body)).toEqual([]);
    expect(extractSyncToken(second.body)).toBe(token);
  });

  it('the new sync token names the addressbook and its current syncSeq', async () => {
    await addContact('a.vcf');
    const reloaded = await dataSource
      .getRepository(AddressbookCollection)
      .findOneByOrFail({ id: addressbook.id });

    const result = await handler.handle(requestBody(), context());

    expect(extractSyncToken(result.body)).toBe(
      encodeSyncToken(addressbook.id, reloaded.syncSeq),
    );
  });

  it('a property the provider does not define is reported 404 in its own propstat', async () => {
    await addContact('a.vcf');
    const body = `<D:sync-collection xmlns:D="DAV:">
  <D:sync-token/><D:sync-level>1</D:sync-level>
  <D:prop><D:getetag/><D:nonexistent/></D:prop>
</D:sync-collection>`;

    const result = await handler.handle(body, context());

    expect(result.body).toContain('<D:getetag>etag-a.vcf</D:getetag>');
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
    expect(result.body).toContain('<D:nonexistent/>');
  });

  it('a principal without read on the addressbook gets 403', async () => {
    await addContact('a.vcf');

    const result = await handler.handle(
      requestBody(),
      context({ principal: stranger }),
    );

    expect(result.status).toBe(403);
  });

  it('a token issued for a different collection is rejected with 403 valid-sync-token', async () => {
    const foreign = encodeSyncToken('00000000-0000-0000-0000-000000000000', 0);

    const result = await handler.handle(requestBody(foreign), context());

    expect(result.status).toBe(403);
    expect(result.body).toContain('valid-sync-token');
  });

  it('an unknown addressbook, a home-collection path, or a too-deep path is 404', async () => {
    const unknown = await handler.handle(
      requestBody(),
      context({ segments: ['addressbooks', principal.id, 'NoSuchBook'] }),
    );
    const home = await handler.handle(
      requestBody(),
      context({ segments: ['addressbooks', principal.id] }),
    );
    const tooDeep = await handler.handle(
      requestBody(),
      context({
        segments: ['addressbooks', principal.id, 'Contacts', 'a.vcf'],
      }),
    );

    expect(unknown.status).toBe(404);
    expect(home.status).toBe(404);
    expect(tooDeep.status).toBe(404);
  });

  it('accepts a trailing slash on the addressbook URL', async () => {
    await addContact('a.vcf');

    const result = await handler.handle(
      requestBody(),
      context({ segments: ['addressbooks', principal.id, 'Contacts', ''] }),
    );

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/addressbooks/${principal.id}/Contacts/a.vcf`,
    ]);
  });

  it('a user id that is not a UUID is 404 (Postgres would fail the uuid comparison with a 500)', async () => {
    const result = await handler.handle(
      requestBody(),
      context({ segments: ['addressbooks', 'not-a-uuid', 'Contacts'] }),
    );

    expect(result.status).toBe(404);
  });

  it('the same handler still serves WebDAV file-tree collections alongside addressbooks', async () => {
    const root = await dataSource.getRepository(Collection).save(
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

    const result = await handler.handle(
      requestBody(),
      context({ segments: ['files'] }),
    );

    expect(result.status).toBe(207);
    expect(extractSyncToken(result.body)).toBe(encodeSyncToken(root.id, 0));
  });
});
