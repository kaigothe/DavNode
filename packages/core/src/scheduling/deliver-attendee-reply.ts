import type { DataSource } from 'typeorm';
import type { Tenant } from '../entities/tenant.entity.js';
import { buildReplyMessage } from './build-itip-message.js';
import { extractSchedulingParticipants } from './detect-scheduling-role.js';
import { mergeReplyIntoOrganizerCopy } from './merge-reply-into-organizer-copy.js';
import {
  insertInboxItem,
  resolveLocalUser,
} from './scheduling-write-helpers.js';

/** What {@link deliverAttendeeReply} needs. */
export interface DeliverAttendeeReplyInput {
  tenant: Tenant;
  /** The event's `UID`. */
  uid: string;
  /** The attendee's own event text before this write. */
  oldIcs: string;
  /** The attendee's own event text as just stored. */
  newIcs: string;
  /** The writing attendee's own calendar user addresses (`calendarUserAddressesFor`) — used to find which `ATTENDEE` line is theirs. */
  writerAddresses: readonly string[];
}

/**
 * Delivers a `REPLY` to the "Organizer" when the writing "Attendee"'s
 * own `PARTSTAT` actually changed (RFC 6638 §3.2.2, M7
 * "Attendee-Workflow"), and immediately folds it into the organizer's
 * own copy (`mergeReplyIntoOrganizerCopy`) — called after an
 * "Attendee"'s PUT of their own copy of a scheduling object resource has
 * already been saved.
 *
 * A change to anything *other* than the writer's own `PARTSTAT` (a
 * private note, say, if the data model ever allows one) is **not**
 * reply-relevant and delivers nothing — only `PARTSTAT` is compared.
 * Neither is a brand-new object with no prior state to diff against
 * (there is no "change" to report). An organizer that isn't locally
 * resolvable also delivers nothing, but the attendee's own write already
 * succeeded regardless — this function runs purely for its side
 * effects, after the fact.
 */
export async function deliverAttendeeReply(
  dataSource: DataSource,
  input: DeliverAttendeeReplyInput,
): Promise<void> {
  const { tenant, uid, oldIcs, newIcs, writerAddresses } = input;
  const own = new Set(writerAddresses.map((address) => address.toLowerCase()));

  const newAttendee = extractSchedulingParticipants(newIcs).attendees.find(
    (attendee) => own.has(attendee.address.toLowerCase()),
  );
  if (!newAttendee) {
    // Not reachable when the caller already established the role as
    // 'attendee' for this same ics, but there is nothing to diff without it.
    return;
  }
  const oldAttendee = extractSchedulingParticipants(oldIcs).attendees.find(
    (attendee) =>
      attendee.address.toLowerCase() === newAttendee.address.toLowerCase(),
  );
  if ((oldAttendee?.partstat ?? null) === (newAttendee.partstat ?? null)) {
    return;
  }

  const organizerAddress = extractSchedulingParticipants(newIcs).organizer;
  if (!organizerAddress) {
    return;
  }
  const organizer = await resolveLocalUser(
    dataSource,
    organizerAddress,
    tenant,
  );
  if (!organizer) {
    return;
  }

  await insertInboxItem(
    dataSource,
    tenant,
    organizer,
    'REPLY',
    uid,
    buildReplyMessage(newIcs, newAttendee.address),
  );

  await mergeReplyIntoOrganizerCopy(dataSource, {
    tenantId: tenant.id,
    uid,
    organizerPrincipalId: organizer.principalId,
    attendeeAddress: newAttendee.address,
    partstat: newAttendee.partstat ?? 'NEEDS-ACTION',
  });
}
