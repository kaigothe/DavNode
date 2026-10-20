import type { Credentials } from '../api/client';

/** A logged-in user as the tab remembers them. */
export interface Session extends Credentials {
  username: string;
}

const KEY = 'davnode.session';
const TENANT_KEY = 'davnode.lastTenant';

/**
 * The session lives in `sessionStorage` only: it ends with the tab and is
 * never shared with other tabs or written to disk. Nothing here may throw —
 * storage can be blocked — so a failure just means "not logged in".
 */
export function loadSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as Partial<Session>;
    return typeof value.tenantSlug === 'string' &&
      typeof value.username === 'string' &&
      typeof value.authorization === 'string'
      ? (value as Session)
      : null;
  } catch {
    return null;
  }
}

/** Remembers `session` for this tab. */
export function saveSession(session: Session): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Without storage the user has to log in again after a reload.
  }
}

/** Forgets the session. */
export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** The tenant slug typed at the last login; a convenience, never a secret. */
export function loadLastTenant(): string {
  try {
    return window.localStorage.getItem(TENANT_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Remembers the tenant slug for the next login form. */
export function saveLastTenant(slug: string): void {
  try {
    window.localStorage.setItem(TENANT_KEY, slug);
  } catch {
    // A convenience only.
  }
}
