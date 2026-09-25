import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import {
  ALL_ENTITIES,
  Principal,
  SchedulingInboxItem,
  Tenant,
} from './index.js';

describe('SchedulingInboxItem entity', () => {
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

  function newItem(
    extra: Partial<SchedulingInboxItem> = {},
  ): SchedulingInboxItem {
    return dataSource.getRepository(SchedulingInboxItem).create({
      tenantId: tenant.id,
      ownerPrincipalId: owner.id,
      icsData: 'BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n',
      method: 'REQUEST',
      uid: 'event-1',
      etag: 'etag-1',
      ...extra,
    });
  }

  it('persists an inbox item with its method, uid and raw iTIP text', async () => {
    const repository = dataSource.getRepository(SchedulingInboxItem);

    const saved = await repository.save(newItem());

    const found = await repository.findOneByOrFail({ id: saved.id });
    expect(found.tenantId).toBe(tenant.id);
    expect(found.ownerPrincipalId).toBe(owner.id);
    expect(found.method).toBe('REQUEST');
    expect(found.uid).toBe('event-1');
    expect(found.icsData).toContain('METHOD:REQUEST');
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('allows several items with the same uid to coexist (a REQUEST followed by a CANCEL)', async () => {
    const repository = dataSource.getRepository(SchedulingInboxItem);
    await repository.save(newItem({ method: 'REQUEST', etag: 'etag-1' }));

    await repository.save(newItem({ method: 'CANCEL', etag: 'etag-2' }));

    const items = await repository.findBy({ uid: 'event-1' });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.method).sort()).toEqual([
      'CANCEL',
      'REQUEST',
    ]);
  });

  it('lists only the items belonging to one owner', async () => {
    const otherOwner = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    const repository = dataSource.getRepository(SchedulingInboxItem);
    await repository.save(newItem({ uid: 'mine' }));
    await repository.save(
      newItem({ uid: 'theirs', ownerPrincipalId: otherOwner.id }),
    );

    const items = await repository.findBy({
      tenantId: tenant.id,
      ownerPrincipalId: owner.id,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.uid).toBe('mine');
  });
});
