import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES, Credential, Tenant, User } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import { AuthProviderRegistry } from './auth-provider-registry.js';
import { OAuth2AuthProvider } from './oauth2-auth-provider.js';
import { parseOAuth2IssuersConfig } from './oauth2-config.js';
import {
  createTestSigningKey,
  hmacToken,
  jwksBody,
  signTestToken,
  unsignedToken,
  type TestSigningKey,
} from './oauth2-test.util.js';

const ISSUER = 'https://idp.example.com';
const OTHER_ISSUER = 'https://other-idp.example.com';

describe('OAuth2AuthProvider', () => {
  let dataSource: DataSource;
  let tenant: Tenant;
  let alice: User;
  let key: TestSigningKey;
  let otherKey: TestSigningKey;
  let fetchFn: ReturnType<typeof vi.fn>;
  let provider: OAuth2AuthProvider;

  const verify = (token: string, tenantSlug = 'acme') =>
    provider.verify({ token, tenantSlug });

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    alice = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'alice',
      email: 'alice@example.com',
      password: 'pw',
    });
    await dataSource.getRepository(Credential).save({
      userId: alice.id,
      type: 'oauth2',
      oauth2Issuer: ISSUER,
      oauth2Subject: 'subject-1',
    });

    key = await createTestSigningKey('k1');
    otherKey = await createTestSigningKey('k2', 'ES256');
    fetchFn = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith(ISSUER) ? jwksBody(key) : jwksBody(otherKey),
        ),
      ),
    );
    provider = new OAuth2AuthProvider(
      dataSource,
      [
        { issuer: ISSUER, audience: 'davnode', jwksUri: `${ISSUER}/jwks` },
        {
          issuer: OTHER_ISSUER,
          audience: 'davnode-other',
          jwksUri: `${OTHER_ISSUER}/jwks`,
        },
      ],
      { jwks: { fetchFn: fetchFn as unknown as typeof fetch } },
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('returns the principal of the linked user for a valid token', async () => {
    const principal = await verify(await signTestToken(key));

    expect(principal?.id).toBe(alice.principalId);
  });

  it('accepts ES256 tokens from a second configured issuer', async () => {
    const bob = await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'bob',
      email: 'bob@example.com',
      password: 'pw',
    });
    await dataSource.getRepository(Credential).save({
      userId: bob.id,
      type: 'oauth2',
      oauth2Issuer: OTHER_ISSUER,
      oauth2Subject: 'bob-sub',
    });

    const token = await signTestToken(otherKey, {
      iss: OTHER_ISSUER,
      aud: 'davnode-other',
      sub: 'bob-sub',
    });

    expect((await verify(token))?.id).toBe(bob.principalId);
  });

  it('caches the key set: validating several tokens fetches the JWKS once', async () => {
    await verify(await signTestToken(key));
    await verify(await signTestToken(key));
    await verify(await signTestToken(key));

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;

    expect(await verify(await signTestToken(key, { exp: past }))).toBeNull();
  });

  it('rejects a token that is not valid yet (nbf)', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;

    expect(await verify(await signTestToken(key, { nbf: future }))).toBeNull();
  });

  it('rejects a token without exp', async () => {
    expect(
      await verify(await signTestToken(key, { exp: undefined })),
    ).toBeNull();
  });

  it('rejects a wrong audience, a wrong issuer and a token signed by someone else', async () => {
    expect(
      await verify(await signTestToken(key, { aud: 'other-app' })),
    ).toBeNull();
    // Right key, but the issuer's audience belongs to the other issuer.
    expect(
      await verify(await signTestToken(key, { iss: OTHER_ISSUER })),
    ).toBeNull();
    const attacker = await createTestSigningKey('k1');
    expect(await verify(await signTestToken(attacker))).toBeNull();
  });

  describe('algorithm confusion (security regression)', () => {
    it('categorically rejects alg none', async () => {
      const token = unsignedToken({
        iss: ISSUER,
        aud: 'davnode',
        sub: 'subject-1',
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      expect(await verify(token)).toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('categorically rejects HS256, even keyed with the issuer public key', async () => {
      const publicKeyText = JSON.stringify(key.publicJwk);
      const token = await hmacToken(publicKeyText, 'k1', {
        iss: ISSUER,
        aud: 'davnode',
        sub: 'subject-1',
      });

      expect(await verify(token)).toBeNull();
    });

    it('rejects an algorithm that does not match the key type', async () => {
      const rsaKeyWithEcAlg = await signTestToken(otherKey, {}, { kid: 'k1' });

      expect(await verify(rsaKeyWithEcAlg)).toBeNull();
    });
  });

  it('does not touch the network for an issuer that is not configured', async () => {
    const token = await signTestToken(key, { iss: 'https://evil.example.com' });

    expect(await verify(token)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a token without kid or with an unknown kid', async () => {
    expect(
      await verify(await signTestToken(key, {}, { kid: undefined })),
    ).toBeNull();
    expect(
      await verify(await signTestToken(key, {}, { kid: 'nope' })),
    ).toBeNull();
  });

  it('returns null for a valid token of a subject that is not linked (no JIT provisioning)', async () => {
    const usersBefore = await dataSource.getRepository(User).count();

    expect(
      await verify(await signTestToken(key, { sub: 'stranger' })),
    ).toBeNull();
    expect(await dataSource.getRepository(User).count()).toBe(usersBefore);
  });

  it('does not authenticate a user of another tenant', async () => {
    const token = await signTestToken(key);

    expect(await verify(token, 'other-tenant')).toBeNull();
  });

  it('returns null for malformed input and garbage tokens', async () => {
    for (const input of [
      null,
      {},
      { token: 'x' },
      { tenantSlug: 'acme' },
      { token: 5, tenantSlug: 'acme' },
      { token: 'not.a.jwt', tenantSlug: 'acme' },
      { token: '', tenantSlug: 'acme' },
      { token: 'a'.repeat(20_000), tenantSlug: 'acme' },
    ]) {
      expect(await provider.verify(input)).toBeNull();
    }
  });

  it('registers under the oauth2 type in the registry', () => {
    const registry = new AuthProviderRegistry();
    registry.register(provider);

    expect(registry.resolve('oauth2')).toBe(provider);
  });
});

describe('parseOAuth2IssuersConfig', () => {
  const entry = {
    issuer: 'https://idp.example.com',
    audience: 'davnode',
    jwksUri: 'https://idp.example.com/jwks',
  };

  it('returns an empty list when unset or blank', () => {
    expect(parseOAuth2IssuersConfig(undefined)).toEqual([]);
    expect(parseOAuth2IssuersConfig('  ')).toEqual([]);
  });

  it('parses a JSON array of issuers', () => {
    expect(parseOAuth2IssuersConfig(JSON.stringify([entry]))).toEqual([entry]);
  });

  it.each([
    ['not json', /not valid JSON/],
    ['{"issuer":"x"}', /must be a JSON array/],
    [JSON.stringify([{ ...entry, audience: '' }]), /audience/],
    [
      JSON.stringify([{ issuer: entry.issuer, jwksUri: entry.jwksUri }]),
      /audience/,
    ],
    [
      JSON.stringify([{ ...entry, jwksUri: 'not a url' }]),
      /jwksUri is not a valid URL/,
    ],
    [JSON.stringify([entry, entry]), /configured twice/],
    [JSON.stringify([null]), /issuer/],
  ])('rejects %s', (raw, message) => {
    expect(() => parseOAuth2IssuersConfig(raw)).toThrow(message);
  });
});
