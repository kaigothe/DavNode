import type { DataSource, EntityManager } from 'typeorm';
import { AddressObjectContent } from '../entities/address-object-content.entity.js';
import { AddressObject } from '../entities/address-object.entity.js';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import { FileContent } from '../entities/file-content.entity.js';
import { FileResource } from '../entities/file-resource.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';

/**
 * The SQL to measure a `TEXT` column's UTF-8 **byte** length — plain
 * `LENGTH` alone means character count on Postgres, and SQLite has no
 * `OCTET_LENGTH` at all, so each engine needs its own expression
 * (verified directly against all three drivers with a real multi-byte
 * character, not assumed): `OCTET_LENGTH` (Postgres); `LENGTH` (MySQL,
 * which already measures `TEXT`/`VARCHAR` in bytes); casting to `BLOB`
 * first (SQLite, where that's the only way to get a byte count instead
 * of a character count). `FileContent.data` needs
 * none of this — it's a binary column, and `LENGTH` already means
 * bytes there on every engine.
 */
function textByteLengthSql(driverType: string, columnExpr: string): string {
  switch (driverType) {
    case 'postgres':
      return `OCTET_LENGTH(${columnExpr})`;
    case 'better-sqlite3':
      return `LENGTH(CAST(${columnExpr} AS BLOB))`;
    default:
      return `LENGTH(${columnExpr})`;
  }
}

/** The sum of `FileContent.data`'s byte length across every `FileResource` owned by `ownerPrincipalId`. */
async function sumFileBytes(
  manager: EntityManager,
  ownerPrincipalId: string,
): Promise<number> {
  const result = await manager
    .createQueryBuilder()
    .select('COALESCE(SUM(LENGTH(content.data)), 0)', 'total')
    .from(FileContent, 'content')
    .innerJoin(FileResource, 'resource', 'resource.id = content.fileResourceId')
    .where('resource.ownerPrincipalId = :ownerPrincipalId', {
      ownerPrincipalId,
    })
    .getRawOne<{ total: string | number }>();
  return Number(result?.total ?? 0);
}

/** The sum of `AddressObjectContent.vcardData`'s UTF-8 byte length across every `AddressObject` owned by `ownerPrincipalId`. */
async function sumAddressObjectBytes(
  manager: EntityManager,
  ownerPrincipalId: string,
): Promise<number> {
  const lengthExpr = textByteLengthSql(
    manager.connection.options.type,
    'content.vcardData',
  );
  const result = await manager
    .createQueryBuilder()
    .select(`COALESCE(SUM(${lengthExpr}), 0)`, 'total')
    .from(AddressObjectContent, 'content')
    .innerJoin(AddressObject, 'owner', 'owner.id = content.addressObjectId')
    .where('owner.ownerPrincipalId = :ownerPrincipalId', { ownerPrincipalId })
    .getRawOne<{ total: string | number }>();
  return Number(result?.total ?? 0);
}

/** The sum of `CalendarObjectContent.icsData`'s UTF-8 byte length across every `CalendarObject` owned by `ownerPrincipalId`. */
async function sumCalendarObjectBytes(
  manager: EntityManager,
  ownerPrincipalId: string,
): Promise<number> {
  const lengthExpr = textByteLengthSql(
    manager.connection.options.type,
    'content.icsData',
  );
  const result = await manager
    .createQueryBuilder()
    .select(`COALESCE(SUM(${lengthExpr}), 0)`, 'total')
    .from(CalendarObjectContent, 'content')
    .innerJoin(CalendarObject, 'owner', 'owner.id = content.calendarObjectId')
    .where('owner.ownerPrincipalId = :ownerPrincipalId', { ownerPrincipalId })
    .getRawOne<{ total: string | number }>();
  return Number(result?.total ?? 0);
}

/**
 * Recomputes `quota_used_bytes` for every `User` of `tenantId`, and then
 * `Tenant.quotaUsedBytes` as their sum, directly from the actual stored
 * content — `FileContent`/`AddressObjectContent`/`CalendarObjectContent`,
 * joined to their respective resource's `ownerPrincipalId` — rather than
 * trusting the running counter `applyQuotaDelta` maintains incrementally
 * (M8 Große Aufgabe 1). This is the reconciliation itself: it **sets**
 * each counter to the computed truth (a plain `UPDATE`, never
 * `applyQuotaDelta`, which only ever applies a *relative* delta and
 * would be the wrong tool for replacing a value outright) rather than
 * adjusting it.
 *
 * Runs as one transaction: every user's counter and the tenant's own
 * commit together, so a failure partway through leaves every counter
 * exactly as it was rather than a half-reconciled mix of old and new
 * values.
 *
 * Dead properties and collection/calendar/addressbook metadata are
 * never summed — only actual resource content, consistent with
 * `applyQuotaDelta`'s own contract and RFC 4331's definition of
 * `quota-used-bytes`.
 */
export async function recomputeQuotaForTenant(
  dataSource: DataSource,
  tenantId: string,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const users = await manager.getRepository(User).findBy({ tenantId });

    let tenantTotal = 0;
    for (const user of users) {
      const total =
        (await sumFileBytes(manager, user.principalId)) +
        (await sumAddressObjectBytes(manager, user.principalId)) +
        (await sumCalendarObjectBytes(manager, user.principalId));
      await manager
        .getRepository(User)
        .update({ id: user.id }, { quotaUsedBytes: total });
      tenantTotal += total;
    }

    await manager
      .getRepository(Tenant)
      .update({ id: tenantId }, { quotaUsedBytes: tenantTotal });
  });
}
