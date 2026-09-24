/** One entity-tag of an `If-Match`/`If-None-Match` header, without its quotes. */
interface ListedEntityTag {
  /** `true` for a weak validator (`W/"..."`). */
  weak: boolean;
  /** The tag itself, unquoted — the form this server stores and sends ETags in. */
  tag: string;
}

/** Either the `*` wildcard, or the entity-tags a conditional header lists. */
type ParsedConditional = '*' | ListedEntityTag[];

/**
 * Parses an `If-Match`/`If-None-Match` header value (RFC 7232 §3.1/§3.2):
 * `*`, or a comma-separated list of entity-tags, quoted (`"abc"`,
 * `W/"abc"`) or — since this server sends its ETags unquoted, and a client
 * echoes them as it got them — bare. Splits with a tokenizer rather than
 * on commas, as a quoted tag may itself contain one.
 */
function parseConditional(headerValue: string): ParsedConditional {
  if (headerValue.trim() === '*') {
    return '*';
  }
  const tags: ListedEntityTag[] = [];
  for (const match of headerValue.matchAll(/(W\/)?"([^"]*)"|([^,\s]+)/g)) {
    if (match[3] !== undefined) {
      tags.push({ weak: false, tag: match[3] });
    } else {
      tags.push({ weak: match[1] !== undefined, tag: match[2] });
    }
  }
  return tags;
}

/**
 * Whether an `If-Match` header holds for a resource whose current ETag is
 * `etag`: `*` matches any existing resource, otherwise one of the listed
 * tags must equal `etag` under *strong* comparison (RFC 7232 §3.1), so a
 * weak validator never matches.
 *
 * For a resource that does not exist the header can only fail — callers
 * check that themselves, since there is no `etag` to compare.
 */
export function ifMatchSatisfied(headerValue: string, etag: string): boolean {
  const parsed = parseConditional(headerValue);
  return (
    parsed === '*' || parsed.some((entry) => !entry.weak && entry.tag === etag)
  );
}

/**
 * Whether an `If-None-Match` header matches the resource's current
 * `etag` — `*`, or a listed tag equal under *weak* comparison (RFC 7232
 * §3.2) — which makes a `GET` answer `304` and a `PUT` fail with `412`.
 */
export function ifNoneMatchMatches(headerValue: string, etag: string): boolean {
  const parsed = parseConditional(headerValue);
  return parsed === '*' || parsed.some((entry) => entry.tag === etag);
}
