/** One condition inside an `If` header list: a lock token or an entity tag, optionally negated. */
export interface IfCondition {
  not: boolean;
  kind: 'token' | 'etag';
  /** The token URI (for example `urn:uuid:...`) or the entity tag without its brackets. */
  value: string;
}

/** One parenthesized list of an `If` header; all its conditions must hold for the list to hold. */
export interface IfList {
  /** The resource the list is tagged with (`<url>` before it), or `null` for an untagged list, which applies to the request resource. */
  resourceTag: string | null;
  conditions: IfCondition[];
}

/**
 * Parses an `If` header (RFC 4918 §10.4).
 *
 * ```
 * If = 1*No-tag-list | 1*Tagged-list
 * Tagged-list = Resource-Tag 1*List       List = "(" 1*Condition ")"
 * Condition = ["Not"] (State-token | "[" entity-tag "]")
 * ```
 *
 * @returns The lists in order, or `null` when not even the first list
 * is valid under that grammar — callers then ignore the precondition
 * rather than guess. A header that is valid up to some point and broken
 * after it (a client cut it off, as litmus does on purpose) yields the
 * lists before the break: those lists decide, the unreadable remainder
 * counts as a list that does not hold, so a bogus tail cannot turn a
 * failing precondition into a passing one.
 */
export function parseIfHeader(header: string | undefined): IfList[] | null {
  if (header === undefined || header.trim() === '') {
    return null;
  }
  const lists: IfList[] = [];
  let rest = header.trim();
  let tag: string | null = null;

  while (rest.length > 0) {
    const tagMatch = /^<([^>]*)>\s*/.exec(rest);
    if (tagMatch) {
      tag = tagMatch[1] ?? null;
      rest = rest.slice(tagMatch[0].length);
      if (!rest.startsWith('(')) {
        break;
      }
    }
    const listMatch = /^\(([^()]*)\)\s*/.exec(rest);
    if (!listMatch) {
      break;
    }
    rest = rest.slice(listMatch[0].length);

    const conditions: IfCondition[] = [];
    let malformedList = false;
    let body = (listMatch[1] ?? '').trim();
    while (body.length > 0) {
      const condition =
        /^(Not\s+)?(?:<([^>]*)>|\[((?:[^\]\\]|\\.)*)\])\s*/i.exec(body);
      if (!condition) {
        malformedList = true;
        break;
      }
      body = body.slice(condition[0].length);
      conditions.push({
        not: condition[1] !== undefined,
        kind: condition[2] !== undefined ? 'token' : 'etag',
        value: condition[2] ?? condition[3] ?? '',
      });
    }
    if (malformedList || conditions.length === 0) {
      break;
    }
    lists.push({ resourceTag: tag, conditions });
  }
  return lists.length > 0 ? lists : null;
}

/** The state of a resource that `If` conditions are checked against. */
export interface IfResourceState {
  /** Its current entity tag, or `null` if the resource does not exist. */
  etag: string | null;
  /** Tokens of the locks effective on it (empty if unlocked or nonexistent). */
  lockTokens: ReadonlySet<string>;
}

const stripEtag = (etag: string): string =>
  etag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');

/** The path of an `If` resource tag, which may be a full URL or an absolute path. */
function tagPath(tag: string): string {
  try {
    return decodeURIComponent(new URL(tag, 'http://placeholder').pathname);
  } catch {
    return tag;
  }
}

function conditionHolds(
  condition: IfCondition,
  state: IfResourceState,
): boolean {
  const matches =
    condition.kind === 'token'
      ? // "DAV:no-lock" is a state token no resource ever has.
        condition.value !== 'DAV:no-lock' &&
        state.lockTokens.has(condition.value)
      : state.etag !== null &&
        stripEtag(condition.value) === stripEtag(state.etag);
  return condition.not ? !matches : matches;
}

/**
 * Evaluates an `If` header's precondition for a request on the resource
 * at `requestPath` whose state is `state` (RFC 4918 §10.4.3): the header
 * holds if **any** list holds, and a list holds if **all** its conditions
 * do.
 *
 * Lists tagged with a *different* resource cannot be judged here (their
 * state is not known), so they are skipped. The result is therefore:
 * `true` if some applicable list holds, `false` if there are applicable
 * lists and none holds and nothing was skipped, and `true` ("no
 * objection") when nothing could be evaluated, or when a skipped list
 * might have held — a client sending `If` for a COPY destination or a
 * collection member must not be rejected on the strength of lists we
 * cannot check.
 *
 * @param requestPath - The request's path (without host), decoded.
 */
export function evaluateIfHeader(
  lists: readonly IfList[],
  requestPath: string,
  state: IfResourceState,
): boolean {
  let evaluated = 0;
  let skipped = 0;
  for (const list of lists) {
    if (
      list.resourceTag !== null &&
      tagPath(list.resourceTag).replace(/\/+$/, '') !==
        requestPath.replace(/\/+$/, '')
    ) {
      skipped += 1;
      continue;
    }
    evaluated += 1;
    if (
      list.conditions.every((condition) => conditionHolds(condition, state))
    ) {
      return true;
    }
  }
  return evaluated === 0 || skipped > 0;
}
