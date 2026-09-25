import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { CalendarObjectContent } from '../entities/calendar-object-content.entity.js';
import { CalendarObject } from '../entities/calendar-object.entity.js';
import { SchedulingInboxItem } from '../entities/scheduling-inbox-item.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import {
  parseSchedulingIcs,
  resolveLocalPrincipalForAddress,
} from './detect-scheduling-role.js';

/**
 * Small pieces shared by every scheduling delivery workflow (organizer
 * invites, attendee replies, and — once built — cancellations): finding
 * a local user for an address, writing one inbox item, and adjusting an
 * `ATTENDEE`'s `PARTSTAT` on a stored calendar object's text. Kept
 * separate from any one workflow's own file so a later one (e.g. the
 * CANCEL-Workflow Große Aufgabe) doesn't have to import from an earlier
 * workflow's file just to reuse them.
 */

/** SHA-256 of `text`, hex-encoded — the same scheme every write path in this server derives an ETag by. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Resolves `address` to the local `User` it names (not just its `Principal`), or `null` if external or unresolvable. */
export async function resolveLocalUser(
  dataSource: DataSource,
  address: string,
  tenant: Tenant,
): Promise<User | null> {
  const principal = await resolveLocalPrincipalForAddress(
    dataSource.manager,
    address,
    tenant,
  );
  if (!principal) {
    return null;
  }
  return dataSource
    .getRepository(User)
    .findOneBy({ principalId: principal.id });
}

/** Inserts one delivered iTIP message into `recipient`'s scheduling inbox. */
export async function insertInboxItem(
  dataSource: DataSource,
  tenant: Tenant,
  recipient: User,
  method: 'REQUEST' | 'REPLY' | 'CANCEL',
  uid: string,
  icsData: string,
): Promise<void> {
  const items = dataSource.getRepository(SchedulingInboxItem);
  await items.save(
    items.create({
      tenantId: tenant.id,
      ownerPrincipalId: recipient.principalId,
      icsData,
      method,
      uid,
      etag: sha256(icsData),
    }),
  );
}

/** Sets `address`'s `PARTSTAT` parameter to `partstat` on every `VEVENT` of `ics` that has an `ATTENDEE` matching it (case-insensitively); components without a matching `ATTENDEE` are left alone. */
export function setAttendeePartstat(
  ics: string,
  address: string,
  partstat: string,
): string {
  const root = parseSchedulingIcs(ics);
  const target = address.toLowerCase();
  for (const component of root.getAllSubcomponents('vevent')) {
    const attendee = component
      .getAllProperties('attendee')
      .find(
        (property) => String(property.getFirstValue()).toLowerCase() === target,
      );
    attendee?.setParameter('partstat', partstat);
  }
  return root.toString();
}

/** The `CalendarObject` `owner` already has for `uid` in the calendar `calendarId` (or, without it, any of their own calendars), or `null` if they have none. */
export async function findOwnCalendarObjectCopy(
  dataSource: DataSource,
  owner: { principalId: string },
  uid: string,
  calendarId?: string,
): Promise<CalendarObject | null> {
  return dataSource
    .getRepository(CalendarObject)
    .findOneBy(
      calendarId
        ? { calendarId, uid }
        : { ownerPrincipalId: owner.principalId, uid },
    );
}

/** `object`'s stored iCalendar text, or `null` if its content row is somehow missing (an inconsistent state that shouldn't happen, guarded against rather than assumed away). */
export async function icsDataOf(
  dataSource: DataSource,
  object: CalendarObject,
): Promise<string | null> {
  const content = await dataSource
    .getRepository(CalendarObjectContent)
    .findOneBy({ calendarObjectId: object.id });
  return content?.icsData ?? null;
}
