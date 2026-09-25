import ICAL from 'ical.js';
import type { EntityManager } from 'typeorm';
import { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { User } from '../entities/user.entity.js';
import { parsePrincipalUrl } from '../principals/principal-url.js';

/**
 * `ics`'s top-level `VCALENDAR`, parsed with ical.js — the shared entry
 * point every function in `scheduling/` uses to read raw `ORGANIZER`/
 * `ATTENDEE` properties that `ParsedCalendarObject` (M6) doesn't keep
 * (it is deliberately reduced to what the time-range index and
 * recurrence expansion need, see `icalendar-parser.ts`).
 */
export function parseSchedulingIcs(ics: string): ICAL.Component {
  const jcal = ICAL.parse(ics) as unknown;
  return new ICAL.Component(
    jcal as ConstructorParameters<typeof ICAL.Component>[0],
  );
}

/**
 * The component whose `ORGANIZER`/`ATTENDEE` values this server treats as
 * authoritative for a calendar object resource: the master (no
 * `RECURRENCE-ID`), or, for an object holding only overrides (RFC 4791
 * §4.1 allows this), its first override. M7 v1 scopes scheduling to the
 * whole `CalendarObject`, never a single `RECURRENCE-ID` instance
 * (planning/01-decisions.md, Runde 22's "Abgrenzung"), so every
 * scheduling function needs exactly one component's values, not a
 * per-instance set.
 */
export function schedulingComponentOf(
  root: ICAL.Component,
): ICAL.Component | null {
  const vevents = root.getAllSubcomponents('vevent');
  return (
    vevents.find((component) => !component.hasProperty('recurrence-id')) ??
    vevents[0] ??
    null
  );
}

/** One `ATTENDEE` property's calendar user address and its `PARTSTAT`, if any. */
export interface SchedulingAttendee {
  address: string;
  partstat: string | null;
}

/** The `ORGANIZER`/`ATTENDEE` values of `ics`'s {@link schedulingComponentOf}. */
export interface SchedulingParticipants {
  /** `null` if the component has no `ORGANIZER` (an ordinary, non-scheduled event). */
  organizer: string | null;
  attendees: SchedulingAttendee[];
}

/** Extracts {@link SchedulingParticipants} from `ics`. */
export function extractSchedulingParticipants(
  ics: string,
): SchedulingParticipants {
  const component = schedulingComponentOf(parseSchedulingIcs(ics));
  if (!component) {
    return { organizer: null, attendees: [] };
  }
  const organizerValue = component.getFirstPropertyValue('organizer');
  const attendees = component.getAllProperties('attendee').map((property) => ({
    address: String(property.getFirstValue()),
    partstat: (property.getParameter('partstat') as string | undefined) ?? null,
  }));
  return {
    organizer: typeof organizerValue === 'string' ? organizerValue : null,
    attendees,
  };
}

/** {@link detectSchedulingRole}'s result. */
export type SchedulingRole = 'organizer' | 'attendee' | 'none';

/**
 * Whether `ics` is a scheduling object resource (RFC 6638 §3.2) from
 * `requestingPrincipalAddresses`' point of view, and if so, which side of
 * it they're on:
 *
 * - `'none'` — no `ORGANIZER`/`ATTENDEE` at all (most events), or neither
 *   matches `requestingPrincipalAddresses` (e.g. an admin editing
 *   someone else's calendar directly — no scheduling message is
 *   triggered by that, per planning/01-decisions.md Runde 22)
 * - `'organizer'` — the `ORGANIZER` address matches
 * - `'attendee'` — `ORGANIZER` doesn't match, but an `ATTENDEE` address
 *   does
 *
 * Matching is case-insensitive on both the `mailto:` scheme and the
 * address itself: real-world clients (e.g. Apple Calendar) write
 * `MAILTO:` uppercase, and RFC 5545 doesn't mandate a case.
 *
 * `requestingPrincipalAddresses` is the caller's own calendar user
 * address set (`calendarUserAddressesFor`) — cheap to compute without a
 * database round trip, unlike resolving an *arbitrary* address to a
 * principal (see {@link resolveLocalPrincipalForAddress}), which is why
 * this function is synchronous and takes the addresses directly rather
 * than a principal to look up.
 */
export function detectSchedulingRole(
  ics: string,
  requestingPrincipalAddresses: readonly string[],
): SchedulingRole {
  const { organizer, attendees } = extractSchedulingParticipants(ics);
  if (organizer === null || attendees.length === 0) {
    return 'none';
  }
  const own = new Set(
    requestingPrincipalAddresses.map((address) => address.toLowerCase()),
  );
  if (own.has(organizer.toLowerCase())) {
    return 'organizer';
  }
  if (attendees.some((attendee) => own.has(attendee.address.toLowerCase()))) {
    return 'attendee';
  }
  return 'none';
}

/**
 * Resolves an `ORGANIZER`/`ATTENDEE` calendar user address — a
 * `mailto:` address or a principal URL
 * (`/dav/{tenant}/principals/users/{id}`) — to the local `Principal` it
 * names, or `null` if it names no user of `tenant` (an external
 * attendee/organizer: planning/01-decisions.md Runde 22 — only
 * same-tenant addresses are delivered to).
 *
 * The `mailto:` form is matched against `User.email` case-insensitively
 * (`LOWER()` in the query, not relying on the database's own collation,
 * which — per M5/M6's own gotchas — differs between engines) since email
 * addresses are conventionally treated case-insensitively in practice
 * even though RFC 5321 leaves the local part case-sensitive in theory.
 * `User.email` has no uniqueness constraint (M1); if more than one user
 * shares an address, one is picked arbitrarily — not a scenario this
 * server's own signup flow can currently produce, so not specially
 * guarded against here.
 */
export async function resolveLocalPrincipalForAddress(
  manager: EntityManager,
  address: string,
  tenant: Tenant,
): Promise<Principal | null> {
  if (address.toLowerCase().startsWith('mailto:')) {
    const email = address.slice('mailto:'.length);
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.principal', 'principal')
      .where('user.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
    return user?.principal ?? null;
  }

  const parsed = parsePrincipalUrl(address);
  if (!parsed || parsed.kind !== 'user' || parsed.tenantSlug !== tenant.slug) {
    return null;
  }
  return manager
    .getRepository(Principal)
    .findOneBy({ id: parsed.id, tenantId: tenant.id });
}
