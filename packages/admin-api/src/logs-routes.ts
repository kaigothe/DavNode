import type { DataSource } from '@davnode/core';
import type { Router } from 'express';
import { sendAdminError } from './admin-error-response.js';
import { requireAdminRole } from './require-admin-role.middleware.js';

/** One log line, as `GET /logs` returns it. */
export interface LogEntryBody {
  seq: number;
  timestamp: string;
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

/** What the logs route needs from the server's in-memory log. */
export interface LogSource {
  /** The entries matching the query, newest first. */
  query(query: {
    limit: number;
    minLevel?: string;
    text?: string;
    after?: number;
  }): {
    entries: LogEntryBody[];
    newest: number;
    buffered: number;
    capacity: number;
  };
}

/** The levels `level` may name. */
export const LOG_LEVEL_NAMES = ['error', 'warn', 'info', 'debug'] as const;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_TEXT_LENGTH = 200;

/**
 * Registers `GET /logs` (M15): the most recent lines of the server log, from
 * the in-memory buffer. `server_admin` only — the log spans all tenants and
 * holds user names, paths and addresses — and it exists only when the server
 * runs with `DAVNODE_ADMIN_UI_LOG_VIEW`.
 *
 * Query: `limit` (1–1000, default 200), `level` (the lowest level wanted),
 * `q` (text in the message or the fields) and `after` (a `seq`, to fetch only
 * what is newer).
 */
export function registerLogRoutes(
  router: Router,
  dataSource: DataSource,
  logs: LogSource,
): void {
  router.get(
    '/logs',
    requireAdminRole(dataSource, 'server_admin'),
    (req, res) => {
      const { limit, level, q, after } = req.query;
      const invalid = (code: string, message: string) =>
        sendAdminError(res, 400, code, message);

      let parsedLimit = DEFAULT_LIMIT;
      if (limit !== undefined) {
        parsedLimit =
          typeof limit === 'string' && /^\d+$/.test(limit)
            ? Number(limit)
            : NaN;
        if (!(parsedLimit >= 1 && parsedLimit <= MAX_LIMIT)) {
          invalid('invalid_limit', `"limit" must be from 1 to ${MAX_LIMIT}.`);
          return;
        }
      }
      if (
        level !== undefined &&
        !(LOG_LEVEL_NAMES as readonly unknown[]).includes(level)
      ) {
        invalid(
          'invalid_level',
          `"level" must be one of ${LOG_LEVEL_NAMES.join(', ')}.`,
        );
        return;
      }
      if (
        q !== undefined &&
        (typeof q !== 'string' || q.length > MAX_TEXT_LENGTH)
      ) {
        invalid(
          'invalid_text',
          `"q" must be text of at most ${MAX_TEXT_LENGTH} characters.`,
        );
        return;
      }
      let parsedAfter: number | undefined;
      if (after !== undefined) {
        parsedAfter =
          typeof after === 'string' && /^\d+$/.test(after)
            ? Number(after)
            : NaN;
        if (!Number.isSafeInteger(parsedAfter)) {
          invalid('invalid_after', '"after" must be a non-negative integer.');
          return;
        }
      }

      res.json(
        logs.query({
          limit: parsedLimit,
          minLevel: level as string | undefined,
          text: typeof q === 'string' && q.trim() !== '' ? q.trim() : undefined,
          after: parsedAfter,
        }),
      );
    },
  );
}
