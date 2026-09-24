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
import {
  hasCalendarPrivilege,
  selectCalendarObjectsWithPrivilege,
} from './evaluate-privilege.js';

describe('selectCalendarObjectsWithPrivilege', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: Principal;
  let bob: Principal;
  let carol: Principal;
  let ownerSpecial: Principal;
  let calendar: CalendarCollection;
  const objects: Record<string, CalendarObject> = {};

  async function principal(): Promise<Principal> {
    return dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
  }

  async function calendarAce(
    principalId: string,
    grantDeny: 'grant' | 'deny',
    position: number,
  ): Promise<void> {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId,
        privilege: 'read',
        grantDeny,
        position,
      }),
    );
  }

  async function object(
    name: string,
    owner: Principal,
    aces: Array<{ principal: Principal; grantDeny: 'grant' | 'deny' }> = [],
  ): Promise<void> {
    const saved = await dataSource.getRepository(CalendarObject).save(
      dataSource.getRepository(CalendarObject).create({
        tenantId: tenant.id,
        calendarId: calendar.id,
        name,
        uid: `uid-${name}`,
        etag: 'e',
        componentType: 'VEVENT',
        ownerPrincipalId: owner.id,
        dtstart: new Date('2026-09-24T10:00:00Z'),
      }),
    );
    for (const [position, ace] of aces.entries()) {
      await dataSource.getRepository(CalendarObjectAce).save(
        dataSource.getRepository(CalendarObjectAce).create({
          calendarObjectId: saved.id,
          principalId: ace.principal.id,
          privilege: 'read',
          grantDeny: ace.grantDeny,
          position,
        }),
      );
    }
    objects[name] = saved;
  }

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
    alice = await principal();
    bob = await principal();
    carol = await principal();
    ownerSpecial = await dataSource
      .getRepository(Principal)
      .findOneByOrFail({ tenantId: tenant.id, specialKind: 'owner' });
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: alice.id,
        name: 'work',
        displayName: 'Work',
      }),
    );

    // The calendar grants read to alice directly, to bob directly, and to
    // "whoever owns the object" (DAV:owner); carol gets nothing.
    await calendarAce(alice.id, 'grant', 0);
    await calendarAce(bob.id, 'grant', 1);
    await calendarAce(ownerSpecial.id, 'grant', 2);

    await object('plain.ics', alice); // inherits everything
    await object('deny-bob.ics', alice, [
      { principal: bob, grantDeny: 'deny' },
    ]);
    await object('grant-carol.ics', alice, [
      { principal: carol, grantDeny: 'grant' },
    ]);
    await object('carols.ics', carol); // DAV:owner applies to carol here
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('gives, for every principal and object, exactly the answer hasCalendarPrivilege gives', async () => {
    const all = Object.values(objects);
    for (const who of [alice, bob, carol]) {
      const batched = await selectCalendarObjectsWithPrivilege(
        dataSource.manager,
        who,
        calendar,
        all,
        'read',
      );
      for (const object of all) {
        expect(batched.has(object.id)).toBe(
          await hasCalendarPrivilege(dataSource.manager, who, object, 'read'),
        );
      }
    }
  });

  it('honours object-level denies and grants and the per-object DAV:owner', async () => {
    const all = Object.values(objects);
    const names = async (who: Principal) =>
      [
        ...(await selectCalendarObjectsWithPrivilege(
          dataSource.manager,
          who,
          calendar,
          all,
          'read',
        )),
      ]
        .map((id) => all.find((o) => o.id === id)?.name)
        .sort();

    expect(await names(alice)).toEqual([
      'carols.ics',
      'deny-bob.ics',
      'grant-carol.ics',
      'plain.ics',
    ]);
    expect(await names(bob)).toEqual([
      'carols.ics',
      'grant-carol.ics',
      'plain.ics',
    ]);
    expect(await names(carol)).toEqual(['carols.ics', 'grant-carol.ics']);
  });

  it('evaluates CALDAV:read-free-busy through the calendar aggregation, same as hasCalendarPrivilege', async () => {
    await dataSource.getRepository(CalendarAce).save(
      dataSource.getRepository(CalendarAce).create({
        calendarId: calendar.id,
        principalId: carol.id,
        privilege: 'read-free-busy',
        grantDeny: 'grant',
        position: 3,
      }),
    );
    const all = Object.values(objects);

    const readFreeBusy = await selectCalendarObjectsWithPrivilege(
      dataSource.manager,
      carol,
      calendar,
      all,
      'read-free-busy',
    );
    const read = await selectCalendarObjectsWithPrivilege(
      dataSource.manager,
      carol,
      calendar,
      all,
      'read',
    );

    // carol still has no read on the calendar's plain objects, but the new
    // read-free-busy grant covers the calendar-inherited ones on its own.
    expect(readFreeBusy.has(objects['plain.ics'].id)).toBe(true);
    expect(read.has(objects['plain.ics'].id)).toBe(false);
  });

  it('returns an empty set without querying for no objects', async () => {
    const result = await selectCalendarObjectsWithPrivilege(
      dataSource.manager,
      alice,
      calendar,
      [],
      'read',
    );

    expect(result.size).toBe(0);
  });

  it('handles more objects than one ACE lookup chunk carries', async () => {
    const many: CalendarObject[] = [];
    for (let index = 0; index < 1100; index += 1) {
      many.push(
        dataSource.getRepository(CalendarObject).create({
          tenantId: tenant.id,
          calendarId: calendar.id,
          name: `bulk-${index}.ics`,
          uid: `bulk-${index}`,
          etag: 'e',
          componentType: 'VEVENT',
          ownerPrincipalId: alice.id,
          dtstart: new Date('2026-09-24T10:00:00Z'),
        }),
      );
    }
    const saved = await dataSource
      .getRepository(CalendarObject)
      .save(many, { chunk: 200 });
    await dataSource.getRepository(CalendarObjectAce).save(
      dataSource.getRepository(CalendarObjectAce).create({
        calendarObjectId: saved[1050].id,
        principalId: bob.id,
        privilege: 'read',
        grantDeny: 'deny',
        position: 0,
      }),
    );

    const allowed = await selectCalendarObjectsWithPrivilege(
      dataSource.manager,
      bob,
      calendar,
      saved,
      'read',
    );

    expect(allowed.size).toBe(1099);
    expect(allowed.has(saved[1050].id)).toBe(false);
    expect(allowed.has(saved[0].id)).toBe(true);
  });
});
