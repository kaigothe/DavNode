import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const timingSafeEqualSpy = vi.hoisted(() => vi.fn());
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  timingSafeEqualSpy.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: timingSafeEqualSpy };
});

import { createDataSource } from '../db/data-source.js';
import { ALL_ENTITIES, Tenant, User } from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';
import { AuthProviderRegistry } from './auth-provider-registry.js';
import { DigestAuthProvider } from './digest-auth-provider.js';
import { computeDigestHa1 } from './digest-ha1.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** What a conforming RFC 7616 client computes. */
function clientResponse(parts: {
  username: string;
  realm: string;
  password: string;
  method: string;
  uri: string;
  nonce: string;
  nc: string;
  cnonce: string;
  qop: string;
}): string {
  const ha1 = sha256(`${parts.username}:${parts.realm}:${parts.password}`);
  const ha2 = sha256(`${parts.method}:${parts.uri}`);
  return sha256(
    `${ha1}:${parts.nonce}:${parts.nc}:${parts.cnonce}:${parts.qop}:${ha2}`,
  );
}

describe('DigestAuthProvider', () => {
  let dataSource: DataSource;
  let provider: DigestAuthProvider;
  let tenant: Tenant;
  let user: User;

  const REALM = 'davnode';
  const PASSWORD = 'correct horse battery staple';
  const base = {
    tenantSlug: 'acme',
    username: 'alice',
    realm: REALM,
    nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c0',
    uri: '/dav/acme/files/report.txt',
    method: 'GET',
    qop: 'auth',
    nc: '00000001',
    cnonce: '0a4f113b',
  };
  const validResponse = () => clientResponse({ ...base, password: PASSWORD });

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    provider = new DigestAuthProvider(dataSource);
    tenant = await new TenantService(dataSource).createTenant({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    user = await new UserService(dataSource, { digestRealm: REALM }).createUser(
      {
        tenantId: tenant.id,
        username: 'alice',
        email: 'alice@example.com',
        password: PASSWORD,
      },
    );
    timingSafeEqualSpy.mockClear();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('returns the principal for a correctly computed response', async () => {
    const principal = await provider.verify({
      ...base,
      response: validResponse(),
    });

    expect(principal?.id).toBe(user.principalId);
  });

  it('accepts an upper-case hex response', async () => {
    const principal = await provider.verify({
      ...base,
      response: validResponse().toUpperCase(),
    });

    expect(principal?.id).toBe(user.principalId);
  });

  it('matches the RFC 7616 §3.9.1 example vector', async () => {
    // Mufasa / "Circle of Life", SHA-256, from the RFC's own example.
    const ha1 = computeDigestHa1(
      'Mufasa',
      'http-auth@example.org',
      'Circle of Life',
    );
    expect(
      sha256(
        `${ha1}:7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v:00000001:f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ:auth:${sha256('GET:/dir/index.html')}`,
      ),
    ).toBe('753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1');
  });

  it('returns null for a wrong response, a wrong password and tampered fields', async () => {
    const good = validResponse();
    const wrong = clientResponse({ ...base, password: 'nope' });

    for (const input of [
      { ...base, response: wrong },
      { ...base, response: good.replace(/^./, good[0] === '0' ? '1' : '0') },
      { ...base, nonce: 'other-nonce', response: good },
      { ...base, nc: '00000002', response: good },
      { ...base, method: 'PUT', response: good },
      { ...base, uri: '/dav/acme/files/other.txt', response: good },
      { ...base, response: '' },
    ]) {
      expect(await provider.verify(input)).toBeNull();
    }
  });

  it('only supports qop=auth', async () => {
    const response = clientResponse({
      ...base,
      qop: 'auth-int',
      password: PASSWORD,
    });

    expect(
      await provider.verify({ ...base, qop: 'auth-int', response }),
    ).toBeNull();
  });

  it('returns null for an unknown user or tenant, still doing the same comparison as for a wrong response', async () => {
    const wrongResponse = clientResponse({ ...base, password: 'nope' });

    await provider.verify({ ...base, response: wrongResponse });
    const knownUserCalls = timingSafeEqualSpy.mock.calls.length;
    timingSafeEqualSpy.mockClear();

    expect(
      await provider.verify({
        ...base,
        username: 'ghost',
        response: wrongResponse,
      }),
    ).toBeNull();
    expect(
      await provider.verify({
        ...base,
        tenantSlug: 'nope',
        response: wrongResponse,
      }),
    ).toBeNull();

    expect(knownUserCalls).toBe(1);
    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null, without error, for a user that only has a basic credential', async () => {
    await new UserService(dataSource).createUser({
      tenantId: tenant.id,
      username: 'basic-only',
      email: 'b@example.com',
      password: PASSWORD,
    });
    const response = clientResponse({
      ...base,
      username: 'basic-only',
      password: PASSWORD,
    });

    expect(
      await provider.verify({ ...base, username: 'basic-only', response }),
    ).toBeNull();
  });

  it('returns null for malformed input', async () => {
    for (const input of [
      null,
      undefined,
      'x',
      {},
      { ...base },
      { ...base, response: 5 },
    ]) {
      expect(await provider.verify(input)).toBeNull();
    }
  });

  it('registers under the digest type in the registry', () => {
    const registry = new AuthProviderRegistry();
    registry.register(provider);

    expect(registry.resolve('digest')).toBe(provider);
  });
});
