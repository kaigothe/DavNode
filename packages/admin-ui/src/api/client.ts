import type { components } from './schema';

type Schemas = components['schemas'];

export type Me = Schemas['Me'];
export type Providers = Schemas['Providers'];
export type Role = Schemas['Role'];

/** What a request needs to reach the Admin API as a user. */
export interface Credentials {
  /** The tenant the user logs in to; the API's URL prefix is `/admin/{tenantSlug}`. */
  tenantSlug: string;
  /** The complete `Authorization` header value. */
  authorization: string;
}

/** A failed Admin API call; `code` is the API's error code or a client-side one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Builds an HTTP Basic header; the credentials are encoded as UTF-8 (RFC 7617). */
export function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `Basic ${btoa(binary)}`;
}

/** Options of {@link apiRequest}. */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  /** Appended to the URL; `undefined` values are left out. */
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

const FALLBACK_CODES: Record<number, string> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
};

/**
 * Calls the Admin API as `credentials` and returns the parsed JSON body
 * (`undefined` for `204`).
 *
 * @throws {@link ApiError} For an error response (code and message from the
 * API's `{"error": {...}}` body) and for an unreachable server (`status` 0).
 */
export async function apiRequest<T>(
  credentials: Credentials,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(
    `/admin/${encodeURIComponent(credentials.tenantSlug)}${path}`,
    window.location.origin,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: credentials.authorization,
        Accept: 'application/json',
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      // The credentials are sent explicitly; never let the browser add or
      // pop up its own Basic-auth dialog or cookies.
      credentials: 'omit',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'network_error', 'The server could not be reached.');
  }

  if (!response.ok) {
    let code = FALLBACK_CODES[response.status] ?? `http_${response.status}`;
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // No JSON body (a 401 has none): the status already says enough.
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export type User = Schemas['User'];
export type Group = Schemas['Group'];
export type Tenant = Schemas['Tenant'];
export type Member = Schemas['Member'];
export type QuotaOverview = Schemas['QuotaOverview'];

export type Calendar = Schemas['Calendar'];
export type CalendarEvent = Schemas['Event'];
export type Addressbook = Schemas['Addressbook'];
export type Contact = Schemas['Contact'];

export type UserGroup = Schemas['UserGroup'];

export type LogEntry = Schemas['LogEntry'];
export type LogPage = Schemas['LogPage'];
