import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import { createDataSource } from '../db/data-source.js';
import {
  AddressbookCollection,
  AddressObject,
  AddressObjectContent,
  ALL_ENTITIES,
  CalendarCollection,
  Collection,
  FileContent,
  FileResource,
  Tenant,
  User,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import { recomputeQuotaForTenant } from './recompute-quota.js';

function eventIcs(uid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DavNode//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20260101T000000Z',
    'DTSTART:20260924T100000Z',
    'SUMMARY:Meeting',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

describe('recomputeQuotaForTenant', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let bob: User;

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
    alice = await userService.createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    bob = await userService.createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: 'correct horse battery staple',
    });
    rootCollectionId = undefined;
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  // WebDAV has exactly one root Collection per tenant (shared by every
  // user, like the real /dav/{tenant}/files/ tree — unlike calendars/
  // addressbooks, which are per-user) — created lazily on first use and
  // reused by every addFile call regardless of owner.
  let rootCollectionId: string | undefined;

  async function rootCollection(): Promise<string> {
    if (rootCollectionId) {
      return rootCollectionId;
    }
    const collections = dataSource.getRepository(Collection);
    const collection = await collections.save(
      collections.create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: alice.principalId,
        displayName: 'root',
      }),
    );
    rootCollectionId = collection.id;
    return collection.id;
  }

  async function addFile(owner: User, content: string): Promise<void> {
    const collectionId = await rootCollection();
    const files = dataSource.getRepository(FileResource);
    const file = await files.save(
      files.create({
        tenantId: tenant.id,
        collectionId,
        name: `file-${Math.random()}.txt`,
        contentType: 'text/plain',
        etag: 'etag',
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        ownerPrincipalId: owner.principalId,
      }),
    );
    await dataSource.getRepository(FileContent).save(
      dataSource.getRepository(FileContent).create({
        fileResourceId: file.id,
        data: Buffer.from(content, 'utf8'),
      }),
    );
  }

  async function addContact(owner: User, vcard: string): Promise<void> {
    const addressbooks = dataSource.getRepository(AddressbookCollection);
    const addressbook = await addressbooks.save(
      addressbooks.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        displayName: `${owner.username}-${Math.random()}`,
      }),
    );
    const objects = dataSource.getRepository(AddressObject);
    const object = await objects.save(
      objects.create({
        tenantId: tenant.id,
        addressbookId: addressbook.id,
        name: 'contact.vcf',
        uid: `uid-${Math.random()}`,
        etag: 'etag',
        ownerPrincipalId: owner.principalId,
      }),
    );
    await dataSource.getRepository(AddressObjectContent).save(
      dataSource.getRepository(AddressObjectContent).create({
        addressObjectId: object.id,
        vcardData: vcard,
      }),
    );
  }

  async function addEvent(owner: User, uid: string): Promise<string> {
    const calendars = dataSource.getRepository(CalendarCollection);
    const calendar = await calendars.save(
      calendars.create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.principalId,
        name: `${owner.username}-${Math.random()}`,
        displayName: 'cal',
      }),
    );
    const ics = eventIcs(uid);
    await saveCalendarObject(dataSource, {
      tenantId: tenant.id,
      calendarId: calendar.id,
      name: `${uid}.ics`,
      ownerPrincipalId: owner.principalId,
      ics,
      parsed: parseCalendarObject(ics),
      etag: 'etag',
      existing: null,
    });
    return ics;
  }

  it('corrects an artificially introduced drift to the actual stored total', async () => {
    await addFile(alice, 'hello'); // 5 bytes
    await dataSource
      .getRepository(User)
      .update({ id: alice.id }, { quotaUsedBytes: 999_999 }); // drift

    await recomputeQuotaForTenant(dataSource, tenant.id);

    const reloaded = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: alice.id });
    expect(reloaded.quotaUsedBytes).toBe(5);
  });

  it('sums across all three domains (file, contact, event) for one user', async () => {
    await addFile(alice, 'hello'); // 5 bytes
    await addContact(alice, 'BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n'); // 23 bytes
    const ics = await addEvent(alice, 'uid-1');

    await recomputeQuotaForTenant(dataSource, tenant.id);

    const reloaded = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: alice.id });
    const expected =
      5 +
      Buffer.byteLength('BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n', 'utf8') +
      Buffer.byteLength(ics, 'utf8');
    expect(reloaded.quotaUsedBytes).toBe(expected);
  });

  it('sums each user independently, then the Tenant as the sum of all users', async () => {
    await addFile(alice, 'aaa'); // 3 bytes
    await addFile(bob, 'bbbbb'); // 5 bytes

    await recomputeQuotaForTenant(dataSource, tenant.id);

    const reloadedAlice = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: alice.id });
    const reloadedBob = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: bob.id });
    const reloadedTenant = await dataSource
      .getRepository(Tenant)
      .findOneByOrFail({ id: tenant.id });
    expect(reloadedAlice.quotaUsedBytes).toBe(3);
    expect(reloadedBob.quotaUsedBytes).toBe(5);
    expect(reloadedTenant.quotaUsedBytes).toBe(8);
  });

  it('a multi-byte UTF-8 contact is counted by its byte length, not its character count', async () => {
    const vcard = 'BEGIN:VCARD\r\nFN:Jürgen Müller\r\nEND:VCARD\r\n';
    await addContact(alice, vcard);

    await recomputeQuotaForTenant(dataSource, tenant.id);

    const reloaded = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: alice.id });
    expect(reloaded.quotaUsedBytes).toBe(Buffer.byteLength(vcard, 'utf8'));
    expect(reloaded.quotaUsedBytes).not.toBe(vcard.length);
  });

  it('a user with no content at all is reconciled to exactly 0', async () => {
    await dataSource
      .getRepository(User)
      .update({ id: alice.id }, { quotaUsedBytes: 42 });

    await recomputeQuotaForTenant(dataSource, tenant.id);

    const reloaded = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: alice.id });
    expect(reloaded.quotaUsedBytes).toBe(0);
  });
});
