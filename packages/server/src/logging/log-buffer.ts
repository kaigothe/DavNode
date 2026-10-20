/** The levels pino writes, most severe first; `fatal` ranks with `error`. */
const RANK: Record<string, number> = {
  fatal: 4,
  error: 4,
  warn: 3,
  info: 2,
  debug: 1,
  trace: 0,
};

/** The level names {@link LogBuffer.query} accepts as a minimum. */
export const LOG_QUERY_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

/** One log line as the admin UI shows it. */
export interface LogEntry {
  /** Counts up from 1 for the lifetime of the process. */
  seq: number;
  timestamp: string;
  level: string;
  message: string;
  /** Everything else of the line (method, path, status, requestId, …). */
  fields: Record<string, unknown>;
}

/** What {@link LogBuffer.query} asks for. */
export interface LogQuery {
  /** At most this many entries, newest first. */
  limit: number;
  /** Only entries at this level or more severe. */
  minLevel?: string;
  /** Only entries containing this text (case-insensitive) in the message or the fields. */
  text?: string;
  /** Only entries after this `seq`, to fetch what is new. */
  after?: number;
}

/** The answer to {@link LogBuffer.query}. */
export interface LogQueryResult {
  /** Newest first. */
  entries: LogEntry[];
  /** `seq` of the newest entry in the buffer (0 when empty). */
  newest: number;
  /** How many entries the buffer holds right now. */
  buffered: number;
  /** How many it holds at most. */
  capacity: number;
}

/** A line longer than this is shortened: one huge entry must not eat the buffer. */
const MAX_LINE_LENGTH = 8_000;
const MAX_MESSAGE_LENGTH = 2_000;

/**
 * The most recent log lines of this process, kept in memory (M15).
 * Single instance only and gone after a restart — it exists so an
 * administrator can look at what just happened without shell access, not
 * to keep logs; `docker logs` or a log service stay the record.
 */
export class LogBuffer {
  private readonly entries: LogEntry[] = [];
  private seq = 0;

  constructor(readonly capacity = 2_000) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('The log buffer needs a capacity of at least 1.');
    }
  }

  /** Adds one line of pino's JSON output (anything else is kept as a plain message). */
  push(line: string): void {
    const text = line.trim();
    if (text === '') {
      return;
    }
    let level = 'info';
    let message = text.slice(0, MAX_MESSAGE_LENGTH);
    let timestamp = new Date().toISOString();
    let fields: Record<string, unknown> = {};
    if (text.length <= MAX_LINE_LENGTH) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed !== null && typeof parsed === 'object') {
          const {
            level: l,
            message: m,
            timestamp: t,
            ...rest
          } = parsed as {
            level?: unknown;
            message?: unknown;
            timestamp?: unknown;
            [key: string]: unknown;
          };
          level = typeof l === 'string' ? l : level;
          message =
            typeof m === 'string' ? m.slice(0, MAX_MESSAGE_LENGTH) : message;
          timestamp = typeof t === 'string' ? t : timestamp;
          fields = rest;
        }
      } catch {
        // Not JSON: keep the text.
      }
    } else {
      fields = { truncated: true };
    }
    this.seq += 1;
    this.entries.push({ seq: this.seq, timestamp, level, message, fields });
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  /** The entries matching `query`, newest first. */
  query(query: LogQuery): LogQueryResult {
    const minRank =
      query.minLevel === undefined ? 0 : (RANK[query.minLevel] ?? 0);
    const text = query.text?.toLowerCase();
    const entries: LogEntry[] = [];
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      if (entry === undefined) {
        continue;
      }
      if (query.after !== undefined && entry.seq <= query.after) {
        break;
      }
      if ((RANK[entry.level] ?? 2) < minRank) {
        continue;
      }
      if (
        text !== undefined &&
        !entry.message.toLowerCase().includes(text) &&
        !JSON.stringify(entry.fields).toLowerCase().includes(text)
      ) {
        continue;
      }
      entries.push(entry);
      if (entries.length >= query.limit) {
        break;
      }
    }
    return {
      entries,
      newest: this.seq,
      buffered: this.entries.length,
      capacity: this.capacity,
    };
  }
}

/** Where a logger writes: every line goes to `target` as before and into `buffer`. */
export function createBufferedDestination(
  buffer: LogBuffer,
  target: { write(line: string): unknown } = process.stdout,
): { write(line: string): void } {
  return {
    write(line: string): void {
      target.write(line);
      buffer.push(line);
    },
  };
}
