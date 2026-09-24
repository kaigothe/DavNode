/**
 * The CalDAV XML namespace (RFC 4791 §1.3, reserved for exclusive use by
 * that specification). Every CalDAV-specific element (e.g.
 * `CALDAV:calendar-home-set`, `CALDAV:calendar`, `CALDAV:mkcalendar`)
 * lives in this namespace, analogous to `CARDDAV_NAMESPACE` for CardDAV
 * and `DAV_NAMESPACE` for core WebDAV elements.
 */
export const CALDAV_NAMESPACE = 'urn:ietf:params:xml:ns:caldav';
