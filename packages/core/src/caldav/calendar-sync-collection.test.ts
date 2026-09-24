import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  AddressbookAce,
  AddressbookCollection,
  CalendarAce,
  CalendarCollection,
  CalendarObject,
  Collection,
  CollectionAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import { AddressbookSyncCollectionDomain } from '../carddav/addressbook-sync-domain.js';
import type { ReportContext } from '../webdav/report-registry.js';
import { SyncCollectionReportHandler } from '../webdav/sync/sync-collection-report.js';
import { encodeSyncToken } from '../webdav/sync/sync-token.js';
import { WebDavSyncCollectionDomain } from '../webdav/sync/webdav-sync-domain.js';
import { CalendarChangeService } from './calendar-change.service.js';
import { CalendarSyncCollectionDomain } from './calendar-sync-domain.js';

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

describe('SyncCollectionReportHandler for calendars', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let principal: Principal;
  let stranger: Principal;
  let calendar: CalendarCollection;
  let handler: SyncCollectionReportHandler;
  let changes: CalendarChangeService;

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

    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
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
      new CalendarSyncCollectionDomain(),
    ]);
    changes = new CalendarChangeService();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function context(overrides: Partial<ReportContext> = {}): ReportContext {
    return {
      tenant,
      principal,
      manager: dataSource.manager,
      segments: ['calendars', principal.id, 'work'],
      ...overrides,
    };
  }

  const href = (name: string) =>
    `/dav/acme/calendars/${principal.id}/work/${encodeURIComponent(name)}`;

  function addEvent(name: string): Promise<CalendarObject> {
    return dataSource.transaction(async (manager) => {
      const object = await manager.getRepository(CalendarObject).save(
        manager.getRepository(CalendarObject).create({
          tenantId: tenant.id,
          calendarId: calendar.id,
          name,
          uid: `uid-${name}`,
          etag: `etag-${name}`,
          componentType: 'VEVENT',
          ownerPrincipalId: principal.id,
          dtstart: new Date('2026-09-24T10:00:00Z'),
        }),
      );
      await changes.recordChange(manager, calendar.id, name, 'added');
      return object;
    });
  }

  async function modifyEvent(object: CalendarObject): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager
        .getRepository(CalendarObject)
        .update({ id: object.id }, { etag: `${object.etag}-v2` });
      await changes.recordChange(manager, calendar.id, object.name, 'modified');
    });
  }

  async function deleteEvent(object: CalendarObject): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(CalendarObject).delete({ id: object.id });
      await changes.recordChange(manager, calendar.id, object.name, 'deleted');
    });
  }

  it('an initial sync (empty token) reports every current object as 200 with its ETag', async () => {
    await addEvent('a.ics');
    await addEvent('b.ics');

    const result = await handler.handle(requestBody(), context());

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([
      href('a.ics'),
      href('b.ics'),
    ]);
    expect(result.body).toContain('HTTP/1.1 200 OK');
    expect(result.body).toContain('<D:getetag>etag-a.ics</D:getetag>');
    expect(result.body).toContain('<D:getetag>etag-b.ics</D:getetag>');
  });

  it('a sync with a valid older token reports only new and modified objects since then', async () => {
    const a = await addEvent('a.ics');
    await addEvent('b.ics');
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );

    await addEvent('c.ics');
    await modifyEvent(a);

    const result = await handler.handle(requestBody(token), context());

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body).sort()).toEqual([
      href('a.ics'),
      href('c.ics'),
    ]);
    expect(result.body).not.toContain('b.ics');
    expect(result.body).toContain('<D:getetag>etag-a.ics-v2</D:getetag>');
  });

  it('an object deleted since the last sync is reported with a bare 404 and no propstat', async () => {
    const a = await addEvent('a.ics');
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );

    await deleteEvent(a);

    const result = await handler.handle(requestBody(token), context());

    expect(hrefsInMultistatus(result.body)).toEqual([href('a.ics')]);
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
    expect(result.body).not.toContain('<D:propstat>');
  });

  it('an object added and deleted between two syncs is still reported as removed (RFC 6578 §3.5.2)', async () => {
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );
    const ghost = await addEvent('ghost.ics');
    await deleteEvent(ghost);

    const result = await handler.handle(requestBody(token), context());

    expect(hrefsInMultistatus(result.body)).toEqual([href('ghost.ics')]);
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
  });

  it('percent-encodes an object name in the href', async () => {
    await addEvent('Team & Friends #1.ics');

    const result = await handler.handle(requestBody(), context());

    expect(hrefsInMultistatus(result.body)).toEqual([
      `/dav/acme/calendars/${principal.id}/work/Team%20%26%20Friends%20%231.ics`,
    ]);
  });

  it('the returned sync token round-trips: an immediate re-sync reports no changes', async () => {
    await addEvent('a.ics');
    const token = extractSyncToken(
      (await handler.handle(requestBody(), context())).body,
    );

    const second = await handler.handle(requestBody(token), context());

    expect(second.status).toBe(207);
    expect(hrefsInMultistatus(second.body)).toEqual([]);
    expect(extractSyncToken(second.body)).toBe(token);
  });

  it('the new sync token names the calendar and its current syncSeq', async () => {
    await addEvent('a.ics');
    const reloaded = await dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });

    const result = await handler.handle(requestBody(), context());

    expect(extractSyncToken(result.body)).toBe(
      encodeSyncToken(calendar.id, reloaded.syncSeq),
    );
  });

  it('a property the provider does not define is reported 404 in its own propstat', async () => {
    await addEvent('a.ics');
    const body = `<D:sync-collection xmlns:D="DAV:">
  <D:sync-token/><D:sync-level>1</D:sync-level>
  <D:prop><D:getetag/><D:getcontenttype/><D:nonexistent/></D:prop>
</D:sync-collection>`;

    const result = await handler.handle(body, context());

    expect(result.body).toContain('<D:getetag>etag-a.ics</D:getetag>');
    expect(result.body).toContain(
      '<D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>',
    );
    expect(result.body).toContain('HTTP/1.1 404 Not Found');
    expect(result.body).toContain('<D:nonexistent/>');
  });

  it('a principal without read on the calendar gets 403; one with a grant gets in', async () => {
    await addEvent('a.ics');

    expect(
      (await handler.handle(requestBody(), context({ principal: stranger })))
        .status,
    ).toBe(403);

    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: stranger.id,
        privilege: 'read',
        grantDeny: 'grant',
        position: 1,
      }),
    );
    expect(
      (await handler.handle(requestBody(), context({ principal: stranger })))
        .status,
    ).toBe(207);
  });

  it('read-free-busy alone is not enough to sync a calendar', async () => {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: stranger.id,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        position: 1,
      }),
    );

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

  it('an unknown calendar, a home path, an object path and a non-UUID user are 404', async () => {
    for (const segments of [
      ['calendars', principal.id, 'nope'],
      ['calendars', principal.id],
      ['calendars', principal.id, 'work', 'a.ics'],
      ['calendars', 'not-a-uuid', 'work'],
    ]) {
      const result = await handler.handle(requestBody(), context({ segments }));
      expect(result.status).toBe(404);
    }
  });

  it('accepts a trailing slash on the calendar URL', async () => {
    await addEvent('a.ics');

    const result = await handler.handle(
      requestBody(),
      context({ segments: ['calendars', principal.id, 'work', ''] }),
    );

    expect(result.status).toBe(207);
    expect(hrefsInMultistatus(result.body)).toEqual([href('a.ics')]);
  });

  it('the same handler still serves the WebDAV file tree and addressbooks alongside calendars', async () => {
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
    const book = await dataSource.getRepository(AddressbookCollection).save(
      dataSource.getRepository(AddressbookCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: principal.id,
        displayName: 'Contacts',
      }),
    );
    await dataSource.getRepository(AddressbookAce).save(
      dataSource.getRepository(AddressbookAce).create({
        addressbookId: book.id,
        principalId: principal.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );

    const files = await handler.handle(
      requestBody(),
      context({ segments: ['files'] }),
    );
    const contacts = await handler.handle(
      requestBody(),
      context({ segments: ['addressbooks', principal.id, 'Contacts'] }),
    );

    expect(files.status).toBe(207);
    expect(contacts.status).toBe(207);
  });
});
