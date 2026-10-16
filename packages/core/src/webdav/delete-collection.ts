import type { DataSource } from 'typeorm';
import type { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import { AddressbookCollection as AddressbookCollectionEntity } from '../entities/addressbook-collection.entity.js';
import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import { CalendarCollection as CalendarCollectionEntity } from '../entities/calendar-collection.entity.js';
import { recomputeQuotaForTenant } from '../quota/recompute-quota.js';

/**
 * Deletes a calendar together with everything in it (M11: a client's
 * "delete calendar" is `DELETE` on the calendar collection). The database's
 * `ON DELETE CASCADE` foreign keys remove the events and their content,
 * ACEs, locks, properties, change log and the calendar's own rows; a user's
 * default-calendar pointer to it is cleared.
 *
 * The cascade bypasses `applyQuotaDelta`, so — exactly as for user deletion
 * — the tenant's quota counters are recomputed afterwards, which is correct
 * whoever owned the deleted events.
 *
 * Scheduling messages are not sent: deleting a whole calendar does not
 * cancel the meetings in it for their attendees.
 */
export async function deleteCalendarCollection(
  dataSource: DataSource,
  calendar: Pick<CalendarCollection, 'id' | 'tenantId'>,
): Promise<void> {
  await dataSource
    .getRepository(CalendarCollectionEntity)
    .delete({ id: calendar.id });
  await recomputeQuotaForTenant(dataSource, calendar.tenantId);
}

/** Deletes an addressbook and all its contacts, see {@link deleteCalendarCollection}. */
export async function deleteAddressbookCollection(
  dataSource: DataSource,
  addressbook: Pick<AddressbookCollection, 'id' | 'tenantId'>,
): Promise<void> {
  await dataSource
    .getRepository(AddressbookCollectionEntity)
    .delete({ id: addressbook.id });
  await recomputeQuotaForTenant(dataSource, addressbook.tenantId);
}
