import type { AuthProvider } from './auth-provider.interface.js';

/**
 * A registry of {@link AuthProvider}s, indexed by their `type`. Lets
 * `@davnode/server` (M2) and later providers (M10, e.g. digest/OAuth2)
 * register themselves without `@davnode/core` needing to know about them
 * ahead of time.
 */
export class AuthProviderRegistry {
  private readonly providers = new Map<string, AuthProvider>();

  /**
   * Registers a provider under its `type`. Registering a second provider
   * with the same `type` replaces the previously registered one.
   */
  register(provider: AuthProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * Looks up a previously registered provider.
   *
   * @param type - The provider's `type` identifier (e.g. `'basic'`).
   * @returns The registered provider, or `undefined` if none is
   * registered under `type`.
   */
  resolve(type: string): AuthProvider | undefined {
    return this.providers.get(type);
  }
}
