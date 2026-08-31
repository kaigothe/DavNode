import type { Principal } from '../entities/principal.entity.js';

/**
 * A pluggable authentication provider (core-side): verifies
 * provider-specific credentials and resolves them to the authenticated
 * user's principal, entirely independent of HTTP. The HTTP-side
 * mechanics — parsing an `Authorization` header, issuing a
 * `WWW-Authenticate` challenge, extracting a bearer token — belong to
 * `@davnode/server`, which calls into this interface; see
 * planning/04-architecture.md, "Auth-Schnittstellen-Split".
 */
export interface AuthProvider {
  /** String identifier this provider registers under (e.g. `'basic'`). */
  readonly type: string;

  /**
   * Verifies provider-specific credentials.
   *
   * @param input - Provider-specific credentials, e.g. for `'basic'`:
   * `{ tenantSlug, username, password }`. Each provider is responsible
   * for validating and narrowing its own `input` shape.
   * @returns The authenticated user's principal, or `null` if `input` is
   * malformed or doesn't correspond to valid credentials.
   */
  verify(input: unknown): Promise<Principal | null>;
}
