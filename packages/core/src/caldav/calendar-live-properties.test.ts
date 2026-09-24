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
import type { PropertyProviderContext } from '../webdav/properties/property-provider.interface.js';
import { CalendarHomeCollection } from './calendar-home-tree-resource.js';
import { CalendarLiveProperties } from './calendar-live-properties.js';

const CALDAV = 'urn:ietf:params:xml:ns:caldav';

describe('CalendarLiveProperties', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let ownerPrincipal: Principal;
  let context: PropertyProviderContext;
  const provider = new CalendarLiveProperties();

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
    ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    context = {
      tenant,
      principal: ownerPrincipal,
      manager: dataSource.manager,
    };
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function createCalendar(
    fields: Partial<CalendarCollection> = {},
  ): Promise<CalendarCollection> {
    return dataSource.getRepository(CalendarCollection).save(
      dataSource.getRepository(CalendarCollection).create({
        tenantId: tenant.id,
        ownerPrincipalId: ownerPrincipal.id,
        name: 'work',
        displayName: 'Work',
        ...fields,
      }),
    );
  }

  it('reports the home collection as a plain DAV:collection, not a calendar', async () => {
    const properties = await provider.listLiveProperties(
      new CalendarHomeCollection(ownerPrincipal.id),
      context,
    );

    const resourcetype = properties.find((p) => p.name === 'resourcetype');
    expect(resourcetype?.value).toContain('<D:collection');
    expect(resourcetype?.value).not.toContain('calendar');
    expect(properties.map((p) => p.name)).toEqual([
      'displayname',
      'resourcetype',
    ]);
  });

  it('reports a CalendarCollection resourcetype as both DAV:collection and CALDAV:calendar', async () => {
    const calendar = await createCalendar();

    const properties = await provider.listLiveProperties(calendar, context);

    const resourcetype = properties.find((p) => p.name === 'resourcetype');
    expect(resourcetype?.value).toBe(
      `<D:collection xmlns:D="DAV:"/><C:calendar xmlns:C="${CALDAV}"/>`,
    );
  });

  it('reports the display name, not the URL name, as DAV:displayname', async () => {
    const calendar = await createCalendar({
      name: '5f1c7e2a',
      displayName: 'Soccer & Friends',
    });

    const properties = await provider.listLiveProperties(calendar, context);

    expect(properties.find((p) => p.name === 'displayname')?.value).toBe(
      'Soccer &amp; Friends',
    );
  });

  it('reports creationdate and getlastmodified from the row timestamps', async () => {
    const calendar = await createCalendar();

    const properties = await provider.listLiveProperties(calendar, context);

    expect(properties.find((p) => p.name === 'creationdate')?.value).toBe(
      calendar.createdAt.toISOString(),
    );
    expect(properties.find((p) => p.name === 'getlastmodified')?.value).toBe(
      calendar.updatedAt.toUTCString(),
    );
  });

  it('always reports the supported component set and calendar data', async () => {
    const calendar = await createCalendar();

    const properties = await provider.listLiveProperties(calendar, context);

    expect(
      properties.find((p) => p.name === 'supported-calendar-component-set'),
    ).toEqual({
      namespace: CALDAV,
      name: 'supported-calendar-component-set',
      value: `<C:comp name="VEVENT" xmlns:C="${CALDAV}"/>`,
    });
    expect(
      properties.find((p) => p.name === 'supported-calendar-data'),
    ).toEqual({
      namespace: CALDAV,
      name: 'supported-calendar-data',
      value: `<C:calendar-data content-type="text/calendar" version="2.0" xmlns:C="${CALDAV}"/>`,
    });
  });

  it('reports the size limit of a calendar object as max-resource-size', async () => {
    const calendar = await createCalendar();

    const properties = await provider.listLiveProperties(calendar, context);

    expect(properties.find((p) => p.name === 'max-resource-size')).toEqual({
      namespace: CALDAV,
      name: 'max-resource-size',
      value: '5242880',
    });
  });

  it('omits calendar-description and calendar-timezone until the client sets them', async () => {
    const calendar = await createCalendar();

    const properties = await provider.listLiveProperties(calendar, context);

    expect(
      properties.find((p) => p.name === 'calendar-description'),
    ).toBeUndefined();
    expect(
      properties.find((p) => p.name === 'calendar-timezone'),
    ).toBeUndefined();
  });

  it('includes calendar-description and calendar-timezone, XML-escaped, when set', async () => {
    const timezone = 'BEGIN:VCALENDAR\nTZNAME:A & B <x>\nEND:VCALENDAR';
    const calendar = await createCalendar({
      description: 'Team <events> & more',
      timezone,
    });

    const properties = await provider.listLiveProperties(calendar, context);

    expect(
      properties.find((p) => p.name === 'calendar-description')?.value,
    ).toBe('Team &lt;events&gt; &amp; more');
    expect(properties.find((p) => p.name === 'calendar-timezone')?.value).toBe(
      'BEGIN:VCALENDAR\nTZNAME:A &amp; B &lt;x&gt;\nEND:VCALENDAR',
    );
  });

  it('recognizes its own live property names via isLiveProperty', () => {
    expect(provider.isLiveProperty('DAV:', 'resourcetype')).toBe(true);
    expect(provider.isLiveProperty('DAV:', 'displayname')).toBe(true);
    for (const name of [
      'calendar-description',
      'calendar-timezone',
      'supported-calendar-component-set',
      'supported-calendar-data',
      'max-resource-size',
    ]) {
      expect(provider.isLiveProperty(CALDAV, name)).toBe(true);
    }
    expect(provider.isLiveProperty('DAV:', 'getetag')).toBe(false);
    expect(provider.isLiveProperty(CALDAV, 'calendar-home-set')).toBe(false);
    expect(
      provider.isLiveProperty(
        'urn:ietf:params:xml:ns:carddav',
        'calendar-description',
      ),
    ).toBe(false);
  });
});
