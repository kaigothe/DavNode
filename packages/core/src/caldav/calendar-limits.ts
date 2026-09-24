/**
 * The largest calendar object resource a calendar accepts, in octets
 * (`CALDAV:max-resource-size`, RFC 4791 §5.2.5): a `PUT` over it violates
 * the `CALDAV:max-resource-size` precondition (§5.3.2.1). Generous enough
 * for events with inline attachments, small enough to bound what one
 * request makes the server hold and parse — the same 5 MiB the CardDAV
 * `PUT` accepts.
 */
export const MAX_CALENDAR_OBJECT_BYTES = 5 * 1024 * 1024;
