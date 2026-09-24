import { In, type EntityManager } from 'typeorm';
import { AddressbookAce } from '../entities/addressbook-ace.entity.js';
import type { AddressbookCollection } from '../entities/addressbook-collection.entity.js';
import { AddressObjectAce } from '../entities/address-object-ace.entity.js';
import type { AddressObject } from '../entities/address-object.entity.js';
import { CalendarAce } from '../entities/calendar-ace.entity.js';
import { CalendarObjectAce } from '../entities/calendar-object-ace.entity.js';
import type { CalendarCollection } from '../entities/calendar-collection.entity.js';
import type { CalendarObject } from '../entities/calendar-object.entity.js';
import { Principal } from '../entities/principal.entity.js';
import { GroupMembershipService } from '../services/group-membership.service.js';
import type { AddressbookAclResource } from '../carddav/addressbook-acl-resource.js';
import type { WebDavTreeResource } from '../webdav/resource-path-resolver.js';
import {
  type AceLike,
  type CollectedAce,
  collectAces,
  collectAddressbookAces,
  collectCalendarAces,
  collectWebDavAces,
} from './collect-aces.js';
import type { CalendarAclResource } from '../caldav/calendar-acl-resource.js';
import {
  ALL_PRIVILEGES,
  type CalendarPrivilege,
  type Privilege,
} from './privilege.js';
import {
  calendarPrivilegeSatisfies,
  privilegeSatisfies,
} from './privilege-aggregation.js';

/**
 * Every principal id an ACE could match for a given requesting
 * `principal` on a given resource — built once per evaluation (or once
 * for a whole batch, see {@link getCurrentUserPrivilegeSet}) and reused
 * across every ACE/privilege check, since it doesn't depend on either.
 *
 * Includes: `principal`'s own id; the id of every group (direct or
 * transitive, via `resolveGroupsForPrincipal`) `principal` belongs to;
 * the tenant's `DAV:authenticated` and `DAV:all` special principals
 * (always — by the time this runs, the request has already passed Basic
 * Auth, so the requester is always an authenticated principal); and the
 * tenant's `DAV:owner` special principal, but only when `principal` is
 * actually `resourceOwnerPrincipalId` — an ACE granting to `DAV:owner`
 * is a reusable rule ("whoever ends up owning this resource"), not a
 * concrete identity, so it applies to the current requester exactly
 * when they are that owner (see `TenantService.createTenant`, which
 * creates the per-tenant `DAV:owner` row this looks up).
 */
async function buildMatchingPrincipalIds(
  manager: EntityManager,
  principal: Principal,
  resourceOwnerPrincipalId: string,
): Promise<Set<string>> {
  const matchingPrincipalIds = new Set<string>([principal.id]);

  const groups = await new GroupMembershipService(
    manager.connection,
  ).resolveGroupsForPrincipal(principal.id);
  for (const group of groups) {
    matchingPrincipalIds.add(group.principalId);
  }

  const specialPrincipals = await manager.getRepository(Principal).findBy({
    tenantId: principal.tenantId,
    kind: 'special',
  });
  const isOwner = principal.id === resourceOwnerPrincipalId;
  for (const special of specialPrincipals) {
    if (
      special.specialKind === 'authenticated' ||
      special.specialKind === 'all' ||
      (special.specialKind === 'owner' && isOwner)
    ) {
      matchingPrincipalIds.add(special.id);
    }
  }

  return matchingPrincipalIds;
}

/**
 * RFC 3744 §5.4's first-match-wins algorithm over an already-collected,
 * ordered ACE list: the first ACE whose `principalId` is in
 * `matchingPrincipalIds` and whose `privilege` covers
 * `requestedPrivilege` (via `satisfies`) decides the outcome — `grant` →
 * `true`, `deny` → `false` — and evaluation stops there, without looking
 * at the rest of the list. No matching ACE at all is default-deny
 * (`false`).
 *
 * Pure and synchronous (no I/O): `aces` is already fully collected, and
 * `matchingPrincipalIds` already fully resolved. Generic over the
 * privilege vocabulary and its aggregation rule (`satisfies`), so it
 * works for any domain's `collectAces` output: `privilegeSatisfies` for
 * WebDAV and CardDAV, `calendarPrivilegeSatisfies` for calendars.
 */
function evaluateAces<
  TPrivilege extends CalendarPrivilege,
  TAce extends AceLike<TPrivilege>,
>(
  aces: readonly CollectedAce<TAce>[],
  matchingPrincipalIds: ReadonlySet<string>,
  requestedPrivilege: TPrivilege,
  satisfies: (granted: TPrivilege, requested: TPrivilege) => boolean,
): boolean {
  for (const ace of aces) {
    if (
      matchingPrincipalIds.has(ace.principalId) &&
      satisfies(ace.privilege, requestedPrivilege)
    ) {
      return ace.grantDeny === 'grant';
    }
  }
  return false;
}

/**
 * Decides whether `principal` has `requestedPrivilege` on `resource`
 * (RFC 3744 §5.4): collects `resource`'s direct-then-inherited ACE list
 * ({@link collectWebDavAces}), builds `principal`'s matching principal-id
 * set, and evaluates first-match-wins over the list. Default-deny — no
 * matching ACE at all means `false`, not `true`.
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource access is being checked against.
 * @param requestedPrivilege - The privilege being checked for.
 */
export async function hasPrivilege(
  manager: EntityManager,
  principal: Principal,
  resource: WebDavTreeResource,
  requestedPrivilege: Privilege,
): Promise<boolean> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectWebDavAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return evaluateAces(
    aces,
    matchingPrincipalIds,
    requestedPrivilege,
    privilegeSatisfies,
  );
}

/**
 * Resolves `principal`'s full effective privilege set on `resource` —
 * every catalog privilege (`ALL_PRIVILEGES`, including the aggregated
 * `write`/`all`) that {@link hasPrivilege} would return `true` for.
 * Backs the `DAV:current-user-privilege-set` live property (RFC 3744
 * §5.4, M3's ACL-Properties sub-task).
 *
 * Collects the ACE list and the matching principal-id set exactly once
 * and evaluates every privilege against that same pair, rather than
 * calling {@link hasPrivilege} in a loop (which would redo both fetches
 * for every one of the eleven privileges).
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource to resolve the privilege set for.
 * @returns The allowed privileges, in `ALL_PRIVILEGES` order.
 */
export async function getCurrentUserPrivilegeSet(
  manager: EntityManager,
  principal: Principal,
  resource: WebDavTreeResource,
): Promise<Privilege[]> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectWebDavAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return ALL_PRIVILEGES.filter((privilege) =>
    evaluateAces(aces, matchingPrincipalIds, privilege, privilegeSatisfies),
  );
}

/**
 * The addressbook-domain instantiation of {@link hasPrivilege}: decides
 * whether `principal` has `requestedPrivilege` on `resource` (RFC 3744
 * §5.4), collecting ACEs via {@link collectAddressbookAces} instead of
 * {@link collectWebDavAces}. Same default-deny semantics — no matching
 * ACE at all means `false`.
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource access is being checked against.
 * @param requestedPrivilege - The privilege being checked for.
 */
export async function hasAddressbookPrivilege(
  manager: EntityManager,
  principal: Principal,
  resource: AddressbookAclResource,
  requestedPrivilege: Privilege,
): Promise<boolean> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectAddressbookAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return evaluateAces(
    aces,
    matchingPrincipalIds,
    requestedPrivilege,
    privilegeSatisfies,
  );
}

/**
 * The calendar-domain instantiation of {@link hasPrivilege}: decides
 * whether `principal` has `requestedPrivilege` on `resource` (RFC 3744
 * §5.4), collecting ACEs via {@link collectCalendarAces} and aggregating
 * privileges by `calendarPrivilegeSatisfies`, so `CALDAV:read-free-busy`
 * is covered by `read` and `all` (RFC 4791 §6.1.1) yet grantable alone.
 * Same default-deny semantics — no matching ACE at all means `false`.
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param resource - The resource access is being checked against.
 * @param requestedPrivilege - The privilege being checked for.
 */
export async function hasCalendarPrivilege(
  manager: EntityManager,
  principal: Principal,
  resource: CalendarAclResource,
  requestedPrivilege: CalendarPrivilege,
): Promise<boolean> {
  const [aces, matchingPrincipalIds] = await Promise.all([
    collectCalendarAces(manager, resource),
    buildMatchingPrincipalIds(manager, principal, resource.ownerPrincipalId),
  ]);
  return evaluateAces(
    aces,
    matchingPrincipalIds,
    requestedPrivilege,
    calendarPrivilegeSatisfies,
  );
}

/** How many address object ids one `IN (...)` ACE lookup carries — well below every supported driver's bound-parameter limit. */
const ACE_LOOKUP_CHUNK_SIZE = 500;

/**
 * The batched form of {@link hasAddressbookPrivilege} for many address
 * objects of one addressbook — what the CardDAV REPORTs need, since
 * every contact in a result must pass the same `read` check `GET` does
 * (a contact's own ACEs can deny what its addressbook grants) and one
 * full evaluation per contact would cost several queries each.
 *
 * Gives exactly the per-object answer `hasAddressbookPrivilege` would,
 * but loads the addressbook's ACEs once, every object's own ACEs in
 * `IN (...)` chunks, and the matching-principal set once per distinct
 * object owner (`DAV:owner` matches per object, and PUT makes the
 * writing principal a contact's owner — not necessarily the
 * addressbook's).
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param addressbook - The addressbook every object in `addressObjects`
 * belongs to (the source of their inherited ACEs).
 * @param addressObjects - The objects to check.
 * @param requestedPrivilege - The privilege being checked for.
 * @returns The ids of the objects `principal` holds `requestedPrivilege` on.
 */
export async function selectAddressObjectsWithPrivilege(
  manager: EntityManager,
  principal: Principal,
  addressbook: AddressbookCollection,
  addressObjects: readonly AddressObject[],
  requestedPrivilege: Privilege,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (addressObjects.length === 0) {
    return allowed;
  }

  const addressbookAces = await manager
    .getRepository(AddressbookAce)
    .findBy({ addressbookId: addressbook.id });

  const ownAcesByObject = new Map<string, AddressObjectAce[]>();
  for (
    let start = 0;
    start < addressObjects.length;
    start += ACE_LOOKUP_CHUNK_SIZE
  ) {
    const ids = addressObjects
      .slice(start, start + ACE_LOOKUP_CHUNK_SIZE)
      .map((addressObject) => addressObject.id);
    const rows = await manager
      .getRepository(AddressObjectAce)
      .findBy({ addressObjectId: In(ids) });
    for (const row of rows) {
      const own = ownAcesByObject.get(row.addressObjectId);
      if (own) {
        own.push(row);
      } else {
        ownAcesByObject.set(row.addressObjectId, [row]);
      }
    }
  }

  const matchingByOwner = new Map<string, Set<string>>();
  for (const addressObject of addressObjects) {
    let matchingPrincipalIds = matchingByOwner.get(
      addressObject.ownerPrincipalId,
    );
    if (!matchingPrincipalIds) {
      matchingPrincipalIds = await buildMatchingPrincipalIds(
        manager,
        principal,
        addressObject.ownerPrincipalId,
      );
      matchingByOwner.set(addressObject.ownerPrincipalId, matchingPrincipalIds);
    }
    const aces = await collectAces(
      ownAcesByObject.get(addressObject.id) ?? [],
      addressbook.id,
      () => Promise.resolve(addressbookAces),
      () => Promise.resolve(null),
    );
    if (
      evaluateAces(
        aces,
        matchingPrincipalIds,
        requestedPrivilege,
        privilegeSatisfies,
      )
    ) {
      allowed.add(addressObject.id);
    }
  }
  return allowed;
}

/** How many calendar object ids one `IN (...)` ACE lookup carries — well below every supported driver's bound-parameter limit. */
const CALENDAR_ACE_LOOKUP_CHUNK_SIZE = 500;

/**
 * The batched form of {@link hasCalendarPrivilege} for many objects of
 * one calendar — what the CalDAV REPORTs need, since every object in a
 * result must pass the same `read` check `GET` does (an object's own
 * ACEs can deny what the calendar grants) and one full evaluation per
 * object would cost several queries each.
 *
 * Gives exactly the per-object answer {@link hasCalendarPrivilege} would,
 * but loads the calendar's ACEs once, every object's own ACEs in
 * `IN (...)` chunks, and the matching-principal set once per distinct
 * object owner (`DAV:owner` matches per object, and a `bind`-only writer
 * makes the writing principal an object's owner — not necessarily the
 * calendar's).
 *
 * @param manager - The `EntityManager` to query with.
 * @param principal - The requesting principal (already authenticated).
 * @param calendar - The calendar every object in `calendarObjects`
 * belongs to (the source of their inherited ACEs).
 * @param calendarObjects - The objects to check.
 * @param requestedPrivilege - The privilege being checked for.
 * @returns The ids of the objects `principal` holds `requestedPrivilege` on.
 */
export async function selectCalendarObjectsWithPrivilege(
  manager: EntityManager,
  principal: Principal,
  calendar: CalendarCollection,
  calendarObjects: readonly CalendarObject[],
  requestedPrivilege: CalendarPrivilege,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (calendarObjects.length === 0) {
    return allowed;
  }

  const calendarAces = await manager
    .getRepository(CalendarAce)
    .findBy({ calendarId: calendar.id });

  const ownAcesByObject = new Map<string, CalendarObjectAce[]>();
  for (
    let start = 0;
    start < calendarObjects.length;
    start += CALENDAR_ACE_LOOKUP_CHUNK_SIZE
  ) {
    const ids = calendarObjects
      .slice(start, start + CALENDAR_ACE_LOOKUP_CHUNK_SIZE)
      .map((object) => object.id);
    const rows = await manager
      .getRepository(CalendarObjectAce)
      .findBy({ calendarObjectId: In(ids) });
    for (const row of rows) {
      const own = ownAcesByObject.get(row.calendarObjectId);
      if (own) {
        own.push(row);
      } else {
        ownAcesByObject.set(row.calendarObjectId, [row]);
      }
    }
  }

  const matchingByOwner = new Map<string, Set<string>>();
  for (const object of calendarObjects) {
    let matchingPrincipalIds = matchingByOwner.get(object.ownerPrincipalId);
    if (!matchingPrincipalIds) {
      matchingPrincipalIds = await buildMatchingPrincipalIds(
        manager,
        principal,
        object.ownerPrincipalId,
      );
      matchingByOwner.set(object.ownerPrincipalId, matchingPrincipalIds);
    }
    const aces = await collectAces(
      ownAcesByObject.get(object.id) ?? [],
      calendar.id,
      () => Promise.resolve(calendarAces),
      () => Promise.resolve(null),
    );
    if (
      evaluateAces(
        aces,
        matchingPrincipalIds,
        requestedPrivilege,
        calendarPrivilegeSatisfies,
      )
    ) {
      allowed.add(object.id);
    }
  }
  return allowed;
}
