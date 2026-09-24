import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarAce,
  CalendarCollection,
  CalendarObject,
  CalendarObjectAce,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { hasCalendarPrivilege } from './evaluate-privilege.js';
import type { CalendarPrivilege } from './privilege.js';

describe('hasCalendarPrivilege', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let calendar: CalendarCollection;

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
    const principals = dataSource.getRepository(Principal);
    alice = await principals.save(
      principals.create({
        tenantId: tenant.id,
        kind: 'user',
        specialKind: null,
      }),
    );
    bob = await principals.save(
      principals.create({
        tenantId: tenant.id,
        kind: 'user',
        specialKind: null,
      }),
    );
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function ace(
    principalId: string,
    privilege: CalendarPrivilege,
    grantDeny: 'grant' | 'deny',
    position: number,
  ): Promise<CalendarAce> {
    return dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId,
        privilege,
        grantDeny,
        position,
      }),
    );
  }

  function has(
    principal: Principal,
    resource: CalendarCollection | CalendarObject,
    privilege: CalendarPrivilege,
  ): Promise<boolean> {
    return dataSource.manager.transaction((manager) =>
      hasCalendarPrivilege(manager, principal, resource, privilege),
    );
  }

  function event(): Promise<CalendarObject> {
    return dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name: 'event.ics',
        uid: 'uid-1',
        etag: 'etag-1',
        componentType: 'VEVENT',
        ownerPrincipalId: alice.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
  }

  it('a grant ACE for the principal allows exactly what it grants', async () => {
    await ace(alice.id, 'read', 'grant', 0);

    expect(await has(alice, calendar, 'read')).toBe(true);
    expect(await has(alice, calendar, 'write-content')).toBe(false);
  });

  it('no matching ACE at all is default-deny', async () => {
    expect(await has(bob, calendar, 'read')).toBe(false);
  });

  it('an explicit ACE lets another user in — real ACL, not owner-only', async () => {
    await ace(bob.id, 'bind', 'grant', 0);

    expect(await has(bob, calendar, 'bind')).toBe(true);
    expect(await has(bob, calendar, 'unbind')).toBe(false);
  });

  it('a deny ACE before a matching grant ACE wins', async () => {
    await ace(alice.id, 'read', 'deny', 0);
    await ace(alice.id, 'all', 'grant', 1);

    expect(await has(alice, calendar, 'read')).toBe(false);
  });

  it('DAV:owner ACEs apply only to the actual owner', async () => {
    const ownerSpecial = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({
        tenantId: tenant.id,
        kind: 'special',
        specialKind: 'owner',
      });
    await ace(ownerSpecial.id, 'read', 'grant', 0);

    expect(await has(alice, calendar, 'read')).toBe(true);
    expect(await has(bob, calendar, 'read')).toBe(false);
  });

  it('an object inherits its calendar ACEs, and its own ACE comes first', async () => {
    await ace(bob.id, 'read', 'grant', 0);
    const object = await event();

    expect(await has(bob, object, 'read')).toBe(true);

    await dataSource.getRepository(CalendarObjectAce).save(
      dataSource.getRepository(CalendarObjectAce).create({
        calendarObjectId: object.id,
        principalId: bob.id,
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );
    expect(await has(bob, object, 'read')).toBe(false);
    // The calendar itself is not affected by the object's ACE.
    expect(await has(bob, calendar, 'read')).toBe(true);
  });

  describe('CALDAV:read-free-busy', () => {
    it('is covered by read (RFC 4791 §6.1.1: aggregated in DAV:read)', async () => {
      await ace(bob.id, 'read', 'grant', 0);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(true);
    });

    it('is covered by all', async () => {
      await ace(bob.id, 'all', 'grant', 0);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(true);
    });

    it('can be granted without read, and then grants nothing else', async () => {
      await ace(bob.id, 'read-free-busy', 'grant', 0);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(true);
      expect(await has(bob, calendar, 'read')).toBe(false);
      expect(await has(bob, calendar, 'write-content')).toBe(false);
    });

    it('is not granted by write or bind', async () => {
      await ace(bob.id, 'write', 'grant', 0);
      await ace(bob.id, 'bind', 'grant', 1);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(false);
    });

    it('a deny of read-free-busy before a grant of read wins for free/busy only', async () => {
      await ace(bob.id, 'read-free-busy', 'deny', 0);
      await ace(bob.id, 'read', 'grant', 1);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(false);
      expect(await has(bob, calendar, 'read')).toBe(true);
    });

    it('a deny of read denies read-free-busy too', async () => {
      await ace(bob.id, 'read', 'deny', 0);
      await ace(bob.id, 'read-free-busy', 'grant', 1);

      expect(await has(bob, calendar, 'read-free-busy')).toBe(false);
    });
  });
});
