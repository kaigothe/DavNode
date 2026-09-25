import type { DataSource } from 'typeorm';
import { saveCalendarObject } from '../caldav/calendar-object-writes.js';
import { parseCalendarObject } from '../caldav/icalendar-parser.js';
import {
  findOwnCalendarObjectCopy,
  icsDataOf,
  setAttendeePartstat,
  sha256,
} from './scheduling-write-helpers.js';

/** What {@link mergeReplyIntoOrganizerCopy} needs. */
export interface MergeReplyIntoOrganizerCopyInput {
  tenantId: string;
  /** The event's `UID` — used to find the organizer's own `CalendarObject` among their calendars. */
  uid: string;
  /** The organizer's own principal id. */
  organizerPrincipalId: string;
  /** The replying attendee's calendar user address, exactly as it appears in the organizer's own `ATTENDEE` property. */
  attendeeAddress: string;
  /** The attendee's new `PARTSTAT`. */
  partstat: string;
}

/**
 * Folds a delivered `REPLY` into the "Organizer"'s own copy of the event
 * (RFC 6638 §3.2.2, M7 "Inbox-Merge beim Organizer"): finds their
 * `CalendarObject` for `uid` (by `ownerPrincipalId`, not a specific
 * calendar — the organizer could have created it in any of their own
 * calendars, unlike an attendee's copy which always lives in their
 * `defaultCalendarId`) and sets the replying `ATTENDEE`'s `PARTSTAT` on
 * it, leaving every other `ATTENDEE` line untouched.
 *
 * Called directly after `insertInboxItem` delivers the `REPLY`
 * (`deliver-attendee-reply.ts`), in the same call — not a separate poll
 * — and writes through {@link saveCalendarObject} exactly like a real
 * PUT would, except:
 *
 * - `SEQUENCE` is **not** touched: a `PARTSTAT` merge isn't a content
 *   change in the iTIP sense, so nothing needs to be re-announced;
 * - it calls `saveCalendarObject` directly rather than going through the
 *   PUT route, so it never re-enters the scheduling hook that lives
 *   there (`detectSchedulingRole`/`deliverOrganizerInvites`) — a reply
 *   merge can never itself trigger a fresh round of `REQUEST`s, which
 *   would otherwise loop.
 *
 * A no-op (not an error) if the organizer has no matching object — the
 * event may have been deleted, or the "organizer" resolved from the
 * `ORGANIZER` address turns out to not actually have one.
 */
export async function mergeReplyIntoOrganizerCopy(
  dataSource: DataSource,
  input: MergeReplyIntoOrganizerCopyInput,
): Promise<void> {
  const organizerCopy = await findOwnCalendarObjectCopy(
    dataSource,
    { principalId: input.organizerPrincipalId },
    input.uid,
  );
  if (!organizerCopy) {
    return;
  }
  const currentIcs = await icsDataOf(dataSource, organizerCopy);
  if (currentIcs === null) {
    return;
  }

  const mergedIcs = setAttendeePartstat(
    currentIcs,
    input.attendeeAddress,
    input.partstat,
  );
  await saveCalendarObject(dataSource, {
    tenantId: input.tenantId,
    calendarId: organizerCopy.calendarId,
    name: organizerCopy.name,
    ownerPrincipalId: organizerCopy.ownerPrincipalId,
    ics: mergedIcs,
    parsed: parseCalendarObject(mergedIcs),
    etag: sha256(mergedIcs),
    existing: organizerCopy,
  });
}
