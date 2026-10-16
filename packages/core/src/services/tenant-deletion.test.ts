import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../entities/index.js';
import { Tenant } from '../entities/tenant.entity.js';
import { createDataSource } from '../db/data-source.js';
import { ALL_MIGRATIONS as ALL_SQLITE_MIGRATIONS } from '../migrations/sqlite/index.js';
import { NotFoundError } from './errors.js';
import { TenantService } from './tenant.service.js';

describe('TenantService.deleteTenant', () => {
  let dataSource: DataSource;
  let service: TenantService;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_SQLITE_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new TenantService(dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  /** Row count of every mapped table, keyed by table name. */
  async function rowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const metadata of dataSource.entityMetadatas) {
      counts[metadata.tableName] = await dataSource
        .getRepository(metadata.target)
        .count();
    }
    return counts;
  }

  /**
   * Inserts one row into **every** entity's table for `tenant`, derived
   * from the entity metadata so a table added in a later milestone is
   * covered automatically (a required foreign key to a not-yet-seeded
   * entity makes this throw, flagging the gap).
   */
  async function seedEveryTable(tenant: Tenant): Promise<void> {
    const created = new Map<string, string>([[Tenant.name, tenant.id]]);
    const pending = [...dataSource.entityMetadatas].filter(
      (metadata) => metadata.target !== Tenant,
    );
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      for (const metadata of [...pending]) {
        const foreignKeys = metadata.columns.filter(
          (column) => column.relationMetadata && !column.isNullable,
        );
        const targetNames = foreignKeys.map(
          (column) => column.relationMetadata!.inverseEntityMetadata.name,
        );
        const principalCount = targetNames.filter(
          (name) => name === 'Principal',
        ).length;
        if (
          targetNames.some((name) => name !== 'Principal' && !created.has(name))
        ) {
          continue;
        }

        const values: Record<string, unknown> = {};
        for (const column of metadata.columns) {
          if (column.isPrimary || column.isNullable) continue;
          if (column.default !== undefined) continue;
          if (column.isCreateDate || column.isUpdateDate) continue;
          if (column.relationMetadata) {
            const targetName =
              column.relationMetadata.inverseEntityMetadata.name;
            values[column.propertyName] =
              targetName === 'Principal'
                ? await newPrincipal(tenant.id, principalCount)
                : created.get(targetName);
            continue;
          }
          values[column.propertyName] = dummyValue(column.propertyName, column);
        }
        const result = await dataSource
          .getRepository(metadata.target)
          .insert(values as never);
        created.set(metadata.name, String(result.identifiers[0]?.['id']));
        pending.splice(pending.indexOf(metadata), 1);
        progressed = true;
      }
    }
    expect(pending.map((metadata) => metadata.name)).toEqual([]);
  }

  async function newPrincipal(
    tenantId: string,
    _count: number,
  ): Promise<string> {
    const metadata = dataSource.getMetadata('Principal');
    const result = await dataSource
      .getRepository(metadata.target)
      .insert({ tenantId, kind: 'user' } as never);
    return String(result.identifiers[0]?.['id']);
  }

  function dummyValue(
    name: string,
    column: { enum?: unknown[]; type: unknown; transformer?: unknown },
  ): unknown {
    if (column.enum?.length) return column.enum[0];
    // The only transformed columns are epoch-millisecond `Date`s.
    if (column.transformer) return new Date();
    const type = column.type;
    if (type === Number || type === 'integer' || type === 'int') return 1;
    if (type === 'bigint') return 1;
    if (type === Boolean || type === 'boolean') return false;
    if (type === Date || type === 'datetime') return new Date();
    if (type === Buffer || type === 'blob' || type === 'bytea')
      return Buffer.from('x');
    return `${name}-${Math.random().toString(36).slice(2)}`;
  }

  it('removes the tenant and leaves no row behind in any table', async () => {
    const baseline = await service.createTenant({ slug: 'keep', name: 'Keep' });
    const before = await rowCounts();

    const doomed = await service.createTenant({
      slug: 'doomed',
      name: 'Doomed',
    });
    await seedEveryTable(doomed);
    const seeded = await rowCounts();
    for (const [table, count] of Object.entries(seeded)) {
      expect(count, `table ${table} was not seeded`).toBeGreaterThan(
        before[table] ?? 0,
      );
    }

    await service.deleteTenant(doomed.id);

    expect(await rowCounts()).toEqual(before);
    expect(
      await dataSource.getRepository(Tenant).findOneBy({ id: baseline.id }),
    ).not.toBeNull();
  });

  it('throws NotFoundError for an unknown tenant', async () => {
    await expect(
      service.deleteTenant('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
