import type { Request, Response } from 'express';
import { sendAdminError } from './admin-error-response.js';

/** Upper bound of `limit`, so one request can never ask for everything at once. */
export const MAX_PAGE_LIMIT = 500;

/** A parsed `limit`/`offset`/`q` query. `limit` is `undefined` when the client did not page. */
export interface ListQuery {
  limit?: number;
  offset: number;
  /** Lower-cased search text, `undefined` when absent or blank. */
  q?: string;
}

const NON_NEGATIVE_INTEGER = /^\d+$/;

/**
 * Parses the optional `limit`, `offset` and `q` query parameters shared by
 * the list routes, answering a malformed one with `400` itself.
 *
 * Without `limit` a list route keeps returning everything, so clients
 * written before pagination existed behave as before.
 *
 * @returns The parsed query, or `null` after the error response was sent.
 */
export function parseListQuery(req: Request, res: Response): ListQuery | null {
  const { limit, offset, q } = req.query;
  const invalid = (name: string) => {
    sendAdminError(
      res,
      400,
      'invalid_pagination',
      `"${name}" must be a non-negative integer${
        name === 'limit' ? ` of at most ${MAX_PAGE_LIMIT} (and at least 1)` : ''
      }.`,
    );
    return null;
  };

  let parsedLimit: number | undefined;
  if (limit !== undefined) {
    parsedLimit =
      typeof limit === 'string' && NON_NEGATIVE_INTEGER.test(limit)
        ? Number(limit)
        : NaN;
    if (!(parsedLimit >= 1 && parsedLimit <= MAX_PAGE_LIMIT)) {
      return invalid('limit');
    }
  }
  let parsedOffset = 0;
  if (offset !== undefined) {
    if (typeof offset !== 'string' || !NON_NEGATIVE_INTEGER.test(offset)) {
      return invalid('offset');
    }
    parsedOffset = Number(offset);
    if (!Number.isSafeInteger(parsedOffset)) {
      return invalid('offset');
    }
  }
  const search = typeof q === 'string' ? q.trim().toLowerCase() : '';
  return {
    limit: parsedLimit,
    offset: parsedOffset,
    q: search === '' ? undefined : search,
  };
}

/** One page of a list plus the number of items that matched before paging. */
export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * Filters `all` by `query.q` (case-insensitive substring of any of the
 * strings `searchable` returns) and cuts out the requested page. The admin
 * lists (tenants, users, groups) are small, so this works on the
 * already-loaded list rather than adding a query per service.
 */
export function paginate<T>(
  all: readonly T[],
  query: ListQuery,
  searchable: (item: T) => ReadonlyArray<string | null | undefined>,
): Page<T> {
  const { q } = query;
  const matching =
    q === undefined
      ? all
      : all.filter((item) =>
          searchable(item).some((text) => text?.toLowerCase().includes(q)),
        );
  const end =
    query.limit === undefined ? undefined : query.offset + query.limit;
  return { items: matching.slice(query.offset, end), total: matching.length };
}
