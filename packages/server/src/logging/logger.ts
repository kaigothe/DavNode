import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogSink } from '@davnode/core';
import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger } from 'pino';

/** What is known about the request currently being handled. */
export interface RequestContext {
  requestId: string;
}

/**
 * Carries the id of the running request through every asynchronous step it
 * triggers, so any log line written while handling it — from a route, the
 * core library or a background step it started — can name the request
 * without it being passed around by hand.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Levels `DAVNODE_LOG_LEVEL` accepts. */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
/** One of {@link LOG_LEVELS}. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Reads `DAVNODE_LOG_LEVEL` (default `info`).
 *
 * @throws An `Error` for an unknown level: a typo must not silently switch
 * logging off or flood the log.
 */
export function parseLogLevel(raw: string | undefined): LogLevel {
  const level = (raw?.trim() || 'info').toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new Error(
      `Unknown DAVNODE_LOG_LEVEL "${raw}". Known levels: ${LOG_LEVELS.join(', ')}.`,
    );
  }
  return level as LogLevel;
}

/**
 * Paths whose values are replaced by `[redacted]` wherever they appear in a
 * logged object. The request logger never logs headers or bodies at all;
 * this list is the second line of defence for anything that is logged
 * (error objects, fields added later): passwords, password hashes, Digest
 * HA1 values, bearer tokens and Authorization headers must never reach a
 * log, on any level.
 */
export const REDACTED_PATHS = [
  'password',
  'passwordHash',
  'digestHa1',
  'token',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.digestHa1',
  '*.token',
  '*.authorization',
  '*.headers.authorization',
  '*.headers.cookie',
];

/** Keeps an error's name, message and stack and drops everything else (query parameters on database errors, request objects on HTTP errors). */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { type: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

/**
 * Creates the server's JSON logger: one object per line with `timestamp`,
 * `level`, `message` and, inside a request, `requestId`.
 *
 * @param level - The minimum level written (`silent` writes nothing).
 * @param destination - Where lines go; defaults to standard output.
 */
export function createLogger(
  level: LogLevel | 'silent',
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level,
      messageKey: 'message',
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      base: null,
      formatters: { level: (label) => ({ level: label }) },
      mixin: () => {
        const context = requestContext.getStore();
        return context ? { requestId: context.requestId } : {};
      },
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      serializers: { err: serializeError },
    },
    destination,
  );
}

/** Adapts a {@link Logger} to the sink `@davnode/core` logs to. */
export function toLogSink(logger: Logger): LogSink {
  return {
    info: (message, fields) => logger.info(fields ?? {}, message),
    warn: (message, fields) => logger.warn(fields ?? {}, message),
    error: (message, fields) => logger.error(fields ?? {}, message),
  };
}
