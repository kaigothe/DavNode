/** What the operator switched on for the admin UI (M14). */
export interface AdminUiConfig {
  /** Serve the admin UI (`DAVNODE_ADMIN_UI_ENABLED`, default off). */
  enabled: boolean;
  /** Let admins read users' calendars and contacts (`DAVNODE_ADMIN_UI_CONTENT_VIEW`, default off). */
  contentView: boolean;
  /** Let server administrators read the recent log (`DAVNODE_ADMIN_UI_LOG_VIEW`, default off). */
  logView: boolean;
  /** How many log lines the view keeps (`DAVNODE_ADMIN_UI_LOG_BUFFER`, default 2000). */
  logBuffer: number;
  /** Directory with the built UI (`DAVNODE_ADMIN_UI_DIR`); unset means the one shipped next to the server. */
  directory?: string;
}

function flag(name: string, raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error(`${name} must be "true" or "false", got "${raw}".`);
}

const DEFAULT_LOG_BUFFER = 2_000;
const MIN_LOG_BUFFER = 100;
const MAX_LOG_BUFFER = 50_000;

function logBufferSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_LOG_BUFFER;
  }
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < MIN_LOG_BUFFER ||
    value > MAX_LOG_BUFFER
  ) {
    throw new Error(
      `DAVNODE_ADMIN_UI_LOG_BUFFER must be a whole number from ${MIN_LOG_BUFFER} to ${MAX_LOG_BUFFER}, got "${raw}".`,
    );
  }
  return value;
}

/**
 * Reads `DAVNODE_ADMIN_UI_ENABLED`, `DAVNODE_ADMIN_UI_CONTENT_VIEW` and
 * `DAVNODE_ADMIN_UI_LOG_VIEW` (all default to off), the optional
 * `DAVNODE_ADMIN_UI_LOG_BUFFER` and `DAVNODE_ADMIN_UI_DIR`.
 *
 * @throws An `Error` for a value other than `true`/`false`, for a log buffer
 * outside 100–50000, and when the content view or the log view is requested
 * without the UI: reading other users' data or the server log must never be
 * switched on by accident.
 */
export function parseAdminUiConfig(env: NodeJS.ProcessEnv): AdminUiConfig {
  const enabled = flag(
    'DAVNODE_ADMIN_UI_ENABLED',
    env.DAVNODE_ADMIN_UI_ENABLED,
  );
  const contentView = flag(
    'DAVNODE_ADMIN_UI_CONTENT_VIEW',
    env.DAVNODE_ADMIN_UI_CONTENT_VIEW,
  );
  const logView = flag(
    'DAVNODE_ADMIN_UI_LOG_VIEW',
    env.DAVNODE_ADMIN_UI_LOG_VIEW,
  );
  const logBuffer = logBufferSize(env.DAVNODE_ADMIN_UI_LOG_BUFFER);
  if (contentView && !enabled) {
    throw new Error(
      'DAVNODE_ADMIN_UI_CONTENT_VIEW requires DAVNODE_ADMIN_UI_ENABLED=true.',
    );
  }
  if (logView && !enabled) {
    throw new Error(
      'DAVNODE_ADMIN_UI_LOG_VIEW requires DAVNODE_ADMIN_UI_ENABLED=true.',
    );
  }
  return {
    enabled,
    contentView,
    logView,
    logBuffer,
    directory: env.DAVNODE_ADMIN_UI_DIR?.trim() || undefined,
  };
}
