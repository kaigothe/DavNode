import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarCollection,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import type { ReportContext } from '../webdav/report-registry.js';
import { resolveReportCalendar } from './calendar-report-support.js';

describe('resolveReportCalendar', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;
  let calendar: CalendarCollection;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    owner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    calendar = await dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: owner.id,
        name: 'work',
        displayName: 'Work',
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const resolve = (...segments: string[]) =>
    resolveReportCalendar({
      tenant,
      principal: owner,
      manager: dataSource.manager,
      segments,
    } as ReportContext);

  it('resolves a calendar by owner and URL name, with or without a trailing slash', async () => {
    expect((await resolve('calendars', owner.id, 'work'))?.id).toBe(
      calendar.id,
    );
    expect((await resolve('calendars', owner.id, 'work', ''))?.id).toBe(
      calendar.id,
    );
  });

  it('does not resolve by display name, in another tree, or for the wrong owner or tenant', async () => {
    expect(await resolve('calendars', owner.id, 'Work')).toBeNull();
    expect(await resolve('addressbooks', owner.id, 'work')).toBeNull();
    expect(
      await resolve(
        'calendars',
        '00000000-0000-0000-0000-000000000000',
        'work',
      ),
    ).toBeNull();
    const other = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'other', name: 'Other Inc.' }),
      );
    expect(
      await resolveReportCalendar({
        tenant: other,
        principal: owner,
        manager: dataSource.manager,
        segments: ['calendars', owner.id, 'work'],
      } as ReportContext),
    ).toBeNull();
  });

  it('answers null for the home, an object path, an empty name and a userId that is no UUID', async () => {
    expect(await resolve('calendars', owner.id)).toBeNull();
    expect(
      await resolve('calendars', owner.id, 'work', 'event.ics'),
    ).toBeNull();
    expect(await resolve('calendars', owner.id, '')).toBeNull();
    expect(await resolve('calendars', 'not-a-uuid', 'work')).toBeNull();
    expect(await resolve()).toBeNull();
  });
});
