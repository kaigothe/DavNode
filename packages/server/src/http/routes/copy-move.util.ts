/** A `Destination` header, successfully parsed as a `/dav/{tenantSlug}/files/...` path. */
export interface ParsedDestination {
  tenantSlug: string;
  segments: string[];
}

const DAV_FILES_PATH = /^\/dav\/([^/]+)\/files(?:\/(.*))?$/;

/**
 * Parses a COPY/MOVE `Destination` header (RFC 4918 §10.3) into its
 * tenant slug and `/files`-relative path segments. Accepts both an
 * absolute URI (what most real clients send, e.g.
 * `http://host/dav/acme/files/report.txt`) and a bare absolute path.
 *
 * @returns `null` if the header is missing, isn't a well-formed URI or
 * path, or doesn't point somewhere under `/dav/{tenantSlug}/files` at
 * all (e.g. a principal URL) — the caller maps that to a bad-request
 * response. A destination that parses fine but names a *different*
 * tenant than the request's own isn't rejected here — see
 * `tenantSlug`; that's the caller's own forbidden-response decision to
 * make against its already-resolved tenant, not a parse failure.
 */
export function parseDestinationHeader(
  header: string | undefined,
): ParsedDestination | null {
  if (!header) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(header).pathname;
  } catch {
    pathname = header;
  }

  const match = DAV_FILES_PATH.exec(pathname);
  if (!match) {
    return null;
  }

  const tenantSlug = decodeURIComponent(match[1]);
  const rest = match[2];
  const segments = rest
    ? rest
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => decodeURIComponent(segment))
    : [];
  return { tenantSlug, segments };
}

/**
 * The COPY/MOVE `Overwrite` header (RFC 4918 §10.6): `T` (the default,
 * including when the header is absent) allows replacing an existing
 * destination; `F` forbids it. Any other literal value is treated as
 * `T` too, matching how permissively most real clients and servers
 * treat this header in practice.
 */
export function parseOverwriteHeader(header: string | undefined): boolean {
  return header !== 'F';
}

/**
 * Whether `destination` is `source` itself or lies inside `source`'s
 * own subtree — e.g. copying/moving `/a` to `/a/b` would make `/a`'s
 * new parent be a descendant of `/a`, an unreachable cycle. Purely a
 * path-segment comparison (no database access needed): `destination`
 * conflicts if every one of `source`'s segments is a prefix of it.
 */
export function isDestinationWithinSource(
  source: readonly string[],
  destination: readonly string[],
): boolean {
  if (destination.length < source.length) {
    return false;
  }
  return source.every((segment, index) => destination[index] === segment);
}
