import type { DataSource } from 'typeorm';
import { deleteCalendarObject } from '../caldav/calendar-object-writes.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { buildCancelMessage } from './build-itip-message.js';
import { extractSchedulingParticipants } from './detect-scheduling-role.js';
import {
  findOwnCalendarObjectCopy,
  insertInboxItem,
  resolveLocalUser,
} from './scheduling-write-helpers.js';

/** What {@link deliverOrganizerCancellation} needs. */
export interface DeliverOrganizerCancellationInput {
  tenant: Tenant;
  /** The deleted event's `UID`. */
  uid: string;
  /** The organizer's event text, as it was immediately before the delete. */
  ics: string;
  /** The deleting organizer's own principal id — never delivered to, mirroring `deliverOrganizerInvites`. */
  organizerPrincipalId: string;
}

/**
 * Delivers a `CANCEL` to every locally resolvable `ATTENDEE` of a
 * scheduling object resource an "Organizer" just deleted entirely (RFC
 * 6638 §3.2.1.3, M7 "CANCEL-Workflow"), and removes each of their
 * auto-filed calendar copies — called after the organizer's own object
 * has already been deleted.
 *
 * Unlike {@link deliverOrganizerInvites}'s per-removed-attendee `CANCEL`
 * (which names only the attendees actually dropped from an otherwise
 * still-live event), this is a *whole-event* cancellation: one
 * `buildCancelMessage(ics)` call with no address list — RFC 5546 §3.2.5
 * explicitly allows "a single CANCEL message for all Attendees" — reused
 * for every recipient, since they're all being told the same thing.
 */
export async function deliverOrganizerCancellation(
  dataSource: DataSource,
  input: DeliverOrganizerCancellationInput,
): Promise<void> {
  const { tenant, uid, ics, organizerPrincipalId } = input;
  const attendees = extractSchedulingParticipants(ics).attendees;
  if (attendees.length === 0) {
    return;
  }
  const cancelMessage = buildCancelMessage(ics);

  for (const attendee of attendees) {
    const user = await resolveLocalUser(dataSource, attendee.address, tenant);
    if (!user || user.principalId === organizerPrincipalId) {
      continue;
    }
    await insertInboxItem(
      dataSource,
      tenant,
      user,
      'CANCEL',
      uid,
      cancelMessage,
    );

    if (!user.defaultCalendarId) {
      continue;
    }
    const copy = await findOwnCalendarObjectCopy(
      dataSource,
      user,
      uid,
      user.defaultCalendarId,
    );
    if (copy) {
      await deleteCalendarObject(dataSource, {
        calendarId: user.defaultCalendarId,
        object: copy,
      });
    }
  }
}
