import { describe, expect, it } from 'vitest';
import type { Principal } from '../entities/principal.entity.js';
import { AuthProviderRegistry } from './auth-provider-registry.js';
import type { AuthProvider } from './auth-provider.interface.js';

function createDummyProvider(type: string): AuthProvider {
  return {
    type,
    async verify(): Promise<Principal | null> {
      return null;
    },
  };
}

describe('AuthProviderRegistry', () => {
  it('registers a provider and resolves it again by type', () => {
    const registry = new AuthProviderRegistry();
    const provider = createDummyProvider('dummy');

    registry.register(provider);

    expect(registry.resolve('dummy')).toBe(provider);
  });

  it('returns undefined for an unregistered type', () => {
    const registry = new AuthProviderRegistry();

    expect(registry.resolve('unknown')).toBeUndefined();
  });

  it('replaces a previously registered provider of the same type', () => {
    const registry = new AuthProviderRegistry();
    const first = createDummyProvider('dummy');
    const second = createDummyProvider('dummy');

    registry.register(first);
    registry.register(second);

    expect(registry.resolve('dummy')).toBe(second);
  });
});
