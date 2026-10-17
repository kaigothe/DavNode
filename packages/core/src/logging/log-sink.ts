/** Structured fields attached to a log message. */
export type LogFields = Record<string, unknown>;

/**
 * Where `@davnode/core` sends the few messages it logs itself (the quota
 * reconciliation job). The core has no logging dependency; the server hands
 * it its own structured logger with {@link setLogSink}, so core messages
 * come out in the same JSON format, with the request id when there is one.
 */
export interface LogSink {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const consoleSink: LogSink = {
  info: (message, fields) => console.log(message, ...(fields ? [fields] : [])),
  warn: (message, fields) => console.warn(message, ...(fields ? [fields] : [])),
  error: (message, fields) =>
    console.error(message, ...(fields ? [fields] : [])),
};

let current: LogSink = consoleSink;

/** Replaces the sink; pass nothing to restore the console default. */
export function setLogSink(sink?: LogSink): void {
  current = sink ?? consoleSink;
}

/** The sink core code logs to. */
export function getLogSink(): LogSink {
  return current;
}
