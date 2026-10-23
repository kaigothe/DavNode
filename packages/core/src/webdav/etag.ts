/**
 * An ETag as it goes on the wire: in double quotes (RFC 7232 §2.3, RFC 4918
 * §15.6 for `DAV:getetag`). The server stores and compares ETags without
 * the quotes; every place that sends one goes through here, and a request's
 * `If-Match`/`If-None-Match`/`If` header is read with or without them.
 */
export function formatEtag(etag: string): string {
  return `"${etag}"`;
}
