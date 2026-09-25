import type { DataSource } from 'typeorm';
import {
  deleteCalendarObject,
  saveCalendarObject,
} from '../caldav/calendar-object-writes.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import {
  buildCancelMessage,
  buildRequestMessage,
} from './build-itip-message.js';
import {
  extractSchedulingParticipants,
  type SchedulingAttendee,
} from './detect-scheduling-role.js';
import {
  findOwnCalendarObjectCopy,
  icsDataOf,
  insertInboxItem,
  resolveLocalUser,
  setAttendeePartstat,
  sha256,
} from './scheduling-write-helpers.js';

/**
 * Delivers a `REQUEST` to `attendee` — a new invite or an update to one
 * they're still on — and auto-files or updates their calendar copy in
 * their `defaultCalendarId` (planning/01-decisions.md, Runde 22: no
 * copy is filed if they don't have one yet).
 *
 * @param preserveOwnPartstat - `true` for an attendee who was already on
 * the event (only some other detail changed): their copy's own
 * `PARTSTAT` — read from their *existing* copy, not the organizer's —
 * carries over unchanged, so a reschedule doesn't silently revert an
 * already-given answer. `false` for a brand-new invite: `PARTSTAT`
 * starts at `NEEDS-ACTION`.
 */
async function deliverRequest(
  dataSource: DataSource,
  tenant: Tenant,
  uid: string,
  organizerIcs: string,
  attendee: User,
  attendeeAddress: string,
  preserveOwnPartstat: boolean,
): Promise<void> {
  await insertInboxItem(
    dataSource,
    tenant,
    attendee,
    'REQUEST',
    uid,
    buildRequestMessage(organizerIcs),
  );

  if (!attendee.defaultCalendarId) {
    return;
  }
  const existingCopy = await findOwnCalendarObjectCopy(
    dataSource,
    attendee,
    uid,
    attendee.defaultCalendarId,
  );

  let partstat = 'NEEDS-ACTION';
  if (preserveOwnPartstat && existingCopy) {
    const existingIcs = await icsDataOf(dataSource, existingCopy);
    const ownAttendee: SchedulingAttendee | undefined = existingIcs
      ? extractSchedulingParticipants(existingIcs).attendees.find(
          (candidate) =>
            candidate.address.toLowerCase() === attendeeAddress.toLowerCase(),
        )
      : undefined;
    if (ownAttendee?.partstat) {
      partstat = ownAttendee.partstat;
    }
  }

  const copyIcs = setAttendeePartstat(organizerIcs, attendeeAddress, partstat);
  await saveCalendarObject(dataSource, {
    tenantId: tenant.id,
    calendarId: attendee.defaultCalendarId,
    name: existingCopy?.name ?? `${encodeURIComponent(uid)}.ics`,
    ownerPrincipalId: attendee.principalId,
    ics: copyIcs,
    parsed: parseCalendarObject(copyIcs),
    etag: sha256(copyIcs),
    existing: existingCopy,
  });
}

/**
 * Delivers a `CANCEL` to `attendee` (uninvited from the event, not the
 * whole event necessarily cancelled — that's the CANCEL-Workflow Große
 * Aufgabe) and removes their auto-filed copy, if they had one.
 */
async function deliverCancel(
  dataSource: DataSource,
  tenant: Tenant,
  uid: string,
  organizerOldIcs: string,
  attendee: User,
  attendeeAddress: string,
): Promise<void> {
  await insertInboxItem(
    dataSource,
    tenant,
    attendee,
    'CANCEL',
    uid,
    buildCancelMessage(organizerOldIcs, [attendeeAddress]),
  );

  if (!attendee.defaultCalendarId) {
    return;
  }
  const existingCopy = await findOwnCalendarObjectCopy(
    dataSource,
    attendee,
    uid,
    attendee.defaultCalendarId,
  );
  if (existingCopy) {
    await deleteCalendarObject(dataSource, {
      calendarId: attendee.defaultCalendarId,
      object: existingCopy,
    });
  }
}

/** A calendar user address, lowercased, mapped to the {@link SchedulingAttendee} it belongs to. */
function byLowerAddress(
  attendees: readonly SchedulingAttendee[],
): Map<string, SchedulingAttendee> {
  return new Map(
    attendees.map((attendee) => [attendee.address.toLowerCase(), attendee]),
  );
}

/** What {@link deliverOrganizerInvites} needs. */
export interface DeliverOrganizerInvitesInput {
  tenant: Tenant;
  /** The event's `UID`, shared by the organizer's object and every attendee's auto-filed copy. */
  uid: string;
  /** The organizer's own event text as just stored (`SEQUENCE` already applied for an update, see `applyNextSequence`). */
  newIcs: string;
  /** The organizer's event text before this write, or `null` for a brand-new object. */
  oldIcs: string | null;
  /** The writing organizer's own principal id — never delivered to, even if they also list themselves as an `ATTENDEE` (RFC 6638 §3.2.1: "the server MUST NOT send a scheduling message to the Attendee that matches the Organizer"). */
  organizerPrincipalId: string;
}

/**
 * Diffs `oldIcs`'s `ATTENDEE`s against `newIcs`'s and delivers to every
 * locally resolvable one (planning/01-decisions.md, Runde 22: external
 * addresses are stored on the event but never delivered to) — called
 * after an "Organizer"'s PUT of a scheduling object resource has
 * already been saved (RFC 6638 §3.2.1):
 *
 * - present in `newIcs` only (or `oldIcs` is `null`, a brand-new
 *   object) — a new invite: `REQUEST` + a freshly auto-filed copy,
 *   `PARTSTAT:NEEDS-ACTION`;
 * - present in both — still invited, something else may have changed:
 *   an updated `REQUEST` + their copy refreshed, their own `PARTSTAT`
 *   carried over from their existing copy;
 * - present in `oldIcs` only — removed: a `CANCEL` naming just them
 *   (built from `oldIcs`, the last version that still listed them) and
 *   their auto-filed copy deleted.
 *
 * Each attendee is handled independently — one failing to resolve or
 * deliver doesn't stop the others.
 */
export async function deliverOrganizerInvites(
  dataSource: DataSource,
  input: DeliverOrganizerInvitesInput,
): Promise<void> {
  const { tenant, uid, newIcs, oldIcs, organizerPrincipalId } = input;
  const newByAddress = byLowerAddress(
    extractSchedulingParticipants(newIcs).attendees,
  );
  const oldByAddress = oldIcs
    ? byLowerAddress(extractSchedulingParticipants(oldIcs).attendees)
    : new Map<string, SchedulingAttendee>();

  for (const [key, attendee] of newByAddress) {
    const user = await resolveLocalUser(dataSource, attendee.address, tenant);
    if (!user || user.principalId === organizerPrincipalId) {
      continue;
    }
    await deliverRequest(
      dataSource,
      tenant,
      uid,
      newIcs,
      user,
      attendee.address,
      oldByAddress.has(key),
    );
  }

  if (!oldIcs) {
    return;
  }
  for (const [key, attendee] of oldByAddress) {
    if (newByAddress.has(key)) {
      continue;
    }
    const user = await resolveLocalUser(dataSource, attendee.address, tenant);
    if (!user || user.principalId === organizerPrincipalId) {
      continue;
    }
    await deliverCancel(
      dataSource,
      tenant,
      uid,
      oldIcs,
      user,
      attendee.address,
    );
  }
}
