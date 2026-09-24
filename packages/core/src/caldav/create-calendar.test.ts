import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  CalendarAce,
  CalendarCollection,
  CalendarProperty,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { isUniqueConstraintViolationError } from '../services/unique-constraint.util.js';
import { createCalendarCollection } from './create-calendar.js';
import type { CalendarInitialization } from './mkcalendar-properties.js';

const DEFAULTS: CalendarInitialization = {
  displayName: null,
  description: null,
  timezone: null,
  supportedComponentSet: ['VEVENT'],
  deadProperties: [],
};

describe('createCalendarCollection', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let owner: Principal;

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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function create(name: string, initialization = DEFAULTS) {
    return createCalendarCollection(dataSource, {
      tenantId: tenant.id,
      ownerPrincipalId: owner.id,
      name,
      initialization,
    });
  }

  it('creates a calendar named and titled after its URL name by default', async () => {
    const calendar = await create('work');

    const stored = await dataSource
      .getRepository(CalendarCollection)
      .findOneByOrFail({ id: calendar.id });
    expect(stored).toMatchObject({
      tenantId: tenant.id,
      ownerPrincipalId: owner.id,
      name: 'work',
      displayName: 'work',
      description: null,
      timezone: null,
      supportedComponentSet: ['VEVENT'],
    });
  });

  it('stores the initialized properties', async () => {
    const calendar = await create('5f1c7e2a', {
      ...DEFAULTS,
      displayName: 'Soccer Team',
      description: 'Practice & games',
      timezone: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    });

    expect(calendar).toMatchObject({
      name: '5f1c7e2a',
      displayName: 'Soccer Team',
      description: 'Practice & games',
      timezone: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    });
  });

  it('stores the client-defined properties as dead properties of the calendar', async () => {
    const calendar = await create('work', {
      ...DEFAULTS,
      deadProperties: [
        {
          namespace: 'http://apple.com/ns/ical/',
          name: 'calendar-color',
          value: '#FF0000FF',
        },
      ],
    });

    const rows = await dataSource
      .getRepository(CalendarProperty)
      .findBy({ calendarId: calendar.id });
    expect(rows).toEqual([
      expect.objectContaining({
        namespace: 'http://apple.com/ns/ical/',
        name: 'calendar-color',
        value: '#FF0000FF',
      }),
    ]);
  });

  it('gives the owner the protected default ACE, so the calendar is usable at once', async () => {
    const calendar = await create('work');

    const aces = await dataSource
      .getRepository(CalendarAce)
      .findBy({ calendarId: calendar.id });
    expect(aces).toEqual([
      expect.objectContaining({
        principalId: owner.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    ]);
  });

  it('fails with a unique violation for a name the owner already uses, leaving nothing of the attempt behind', async () => {
    await create('work');

    await expect(
      create('work', {
        ...DEFAULTS,
        deadProperties: [{ namespace: 'urn:example', name: 'x', value: 'v' }],
      }),
    ).rejects.toSatisfy(isUniqueConstraintViolationError);

    expect(await dataSource.getRepository(CalendarCollection).count()).toBe(1);
    expect(await dataSource.getRepository(CalendarAce).count()).toBe(1);
    expect(await dataSource.getRepository(CalendarProperty).count()).toBe(0);
  });

  it('rolls the whole creation back when a later step fails', async () => {
    await expect(
      create('work', {
        ...DEFAULTS,
        // The same property twice violates the (calendar, namespace, name) index.
        deadProperties: [
          { namespace: 'urn:example', name: 'x', value: '1' },
          { namespace: 'urn:example', name: 'x', value: '2' },
        ],
      }),
    ).rejects.toThrow();

    expect(await dataSource.getRepository(CalendarCollection).count()).toBe(0);
    expect(await dataSource.getRepository(CalendarAce).count()).toBe(0);
    expect(await dataSource.getRepository(CalendarProperty).count()).toBe(0);
  });
});
