/** What the operator switched on for the admin UI (M14). */
export interface AdminUiConfig {
  /** Serve the admin UI (`DAVNODE_ADMIN_UI_ENABLED`, default off). */
  enabled: boolean;
  /** Let admins read users' calendars and contacts (`DAVNODE_ADMIN_UI_CONTENT_VIEW`, default off). */
  contentView: boolean;
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

/**
 * Reads `DAVNODE_ADMIN_UI_ENABLED` and `DAVNODE_ADMIN_UI_CONTENT_VIEW`;
 * both default to off.
 *
 * @throws An `Error` for a value other than `true`/`false`, and when the
 * content view is requested without the UI: reading other users' data
 * must never be switched on by accident.
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
  if (contentView && !enabled) {
    throw new Error(
      'DAVNODE_ADMIN_UI_CONTENT_VIEW requires DAVNODE_ADMIN_UI_ENABLED=true.',
    );
  }
  return { enabled, contentView };
}
