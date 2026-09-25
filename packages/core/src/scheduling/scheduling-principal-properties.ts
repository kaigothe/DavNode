import { fragment } from 'xmlbuilder2';
import { CALDAV_NAMESPACE } from '../caldav/caldav-namespace.js';
import { toCalendarHomeUrl } from '../caldav/calendar-home-url.js';
import { User } from '../entities/user.entity.js';
import type { PrincipalTreeResource } from '../principals/principal-tree-resource.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from '../webdav/properties/property-provider.interface.js';

const LIVE_PROPERTY_NAMES = new Set([
  'schedule-inbox-URL',
  'schedule-outbox-URL',
  'calendar-user-address-set',
]);

function hrefValue(url: string): string {
  return fragment().ele(DAV_NAMESPACE, 'D:href').txt(url).toString();
}

function property(name: string, value: string): PropertyValue {
  return { namespace: CALDAV_NAMESPACE, name, value };
}

/**
 * The calendar user addresses (RFC 6638 §2.4.1) that identify `user` in
 * `ORGANIZER`/`ATTENDEE` property values: their own principal URL and
 * their `mailto:` address — the same pair
 * `CALDAV:calendar-user-address-set` (below) reports over PROPFIND.
 * Shared with `detect-scheduling-role.ts`, so a change to how these are
 * built (e.g. a future secondary email) can't make the two drift apart.
 */
export function calendarUserAddressesFor(
  user: { principalId: string; email: string },
  tenant: { slug: string },
): [principalUrl: string, mailtoAddress: string] {
  return [
    `/dav/${tenant.slug}/principals/users/${user.principalId}`,
    `mailto:${user.email}`,
  ];
}

/**
 * Contributes the RFC 6638 principal properties a scheduling-aware
 * client needs to find a user's scheduling inbox/outbox, and to match
 * `ORGANIZER`/`ATTENDEE` addresses in incoming iTIP messages back to a
 * local user:
 * - `CALDAV:schedule-inbox-URL` (§2.2) — `{calendar home}/inbox/`
 * - `CALDAV:schedule-outbox-URL` (§2.2) — `{calendar home}/outbox/`
 * - `CALDAV:calendar-user-address-set` (§2.4.1) — the user's own
 *   principal URL plus `mailto:{User.email}`, so an `ATTENDEE`/
 *   `ORGANIZER` value in either form resolves to the same user
 *
 * Registered next to `CalendarHomeSetProperty` into the same
 * `PropertyProviderRegistry<PrincipalTreeResource>`; only `User`
 * principals get values — groups and special principals have no
 * calendar home, inbox or outbox of their own.
 */
export class SchedulingPrincipalProperties implements PropertyProvider<PrincipalTreeResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface even though this implementation has no actual await.
  async listLiveProperties(
    resource: PrincipalTreeResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    if (!(resource instanceof User)) {
      return [];
    }
    const homeUrl = toCalendarHomeUrl(resource.principalId, context.tenant);
    const [principalUrl, mailtoAddress] = calendarUserAddressesFor(
      resource,
      context.tenant,
    );
    return [
      property('schedule-inbox-URL', hrefValue(`${homeUrl}/inbox/`)),
      property('schedule-outbox-URL', hrefValue(`${homeUrl}/outbox/`)),
      property(
        'calendar-user-address-set',
        hrefValue(principalUrl) + hrefValue(mailtoAddress),
      ),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === CALDAV_NAMESPACE && LIVE_PROPERTY_NAMES.has(name);
  }
}
