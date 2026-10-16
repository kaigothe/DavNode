import { describe, expect, it, vi } from 'vitest';
import { JwksClient } from './jwks-client.js';
import { createTestSigningKey, jwksBody } from './oauth2-test.util.js';

describe('JwksClient', () => {
  function setup(initial: unknown) {
    let now = 1_000_000;
    let body: unknown = initial;
    const fetchFn = vi.fn(() =>
      Promise.resolve(Response.json(body as object)),
    ) as unknown as typeof fetch;
    const client = new JwksClient('https://idp.example.com/jwks', {
      fetchFn,
      now: () => now,
    });
    return {
      client,
      fetchFn: fetchFn as unknown as ReturnType<typeof vi.fn>,
      advance: (ms: number) => {
        now += ms;
      },
      publish: (next: unknown) => {
        body = next;
      },
    };
  }

  it('loads the key set once and serves known kids from cache', async () => {
    const key = await createTestSigningKey('k1');
    const { client, fetchFn } = setup(jwksBody(key));

    expect(await client.getKey('k1', 'RS256')).not.toBeNull();
    expect(await client.getKey('k1', 'RS256')).not.toBeNull();
    expect(await client.getKey('k1', 'RS256')).not.toBeNull();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes exactly once for an unknown kid, then rate-limits further attempts', async () => {
    const key = await createTestSigningKey('k1');
    const { client, fetchFn, advance } = setup(jwksBody(key));
    await client.getKey('k1', 'RS256');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    advance(61_000);
    expect(await client.getKey('forged', 'RS256')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    for (let i = 0; i < 5; i += 1) {
      expect(await client.getKey('forged', 'RS256')).toBeNull();
    }
    advance(30_000);
    expect(await client.getKey('other-forged', 'RS256')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    advance(31_000);
    await client.getKey('forged', 'RS256');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('picks up a rotated key once the rate limit allows a refresh', async () => {
    const oldKey = await createTestSigningKey('old');
    const newKey = await createTestSigningKey('new');
    const { client, advance, publish } = setup(jwksBody(oldKey));
    await client.getKey('old', 'RS256');

    publish(jwksBody(oldKey, newKey));
    expect(await client.getKey('new', 'RS256')).toBeNull();
    advance(61_000);

    expect(await client.getKey('new', 'RS256')).not.toBeNull();
  });

  it('shares one fetch between concurrent lookups', async () => {
    const key = await createTestSigningKey('k1');
    const { client, fetchFn } = setup(jwksBody(key));

    await Promise.all([
      client.getKey('k1', 'RS256'),
      client.getKey('k1', 'RS256'),
      client.getKey('nope', 'RS256'),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('ignores symmetric and encryption keys', async () => {
    const key = await createTestSigningKey('good');
    const { client } = setup({
      keys: [
        { kty: 'oct', kid: 'secret', k: 'c2VjcmV0' },
        { ...key.publicJwk, kid: 'enc', use: 'enc' },
        key.publicJwk,
      ],
    });

    expect(await client.getKey('secret', 'HS256')).toBeNull();
    expect(await client.getKey('enc', 'RS256')).toBeNull();
    expect(await client.getKey('good', 'RS256')).not.toBeNull();
  });

  it('survives a failing endpoint and keeps previously cached keys', async () => {
    const key = await createTestSigningKey('k1');
    let failing = false;
    let now = 0;
    const fetchFn = vi.fn(() =>
      failing
        ? Promise.reject(new Error('down'))
        : Promise.resolve(Response.json(jwksBody(key))),
    ) as unknown as typeof fetch;
    const client = new JwksClient('https://idp.example.com/jwks', {
      fetchFn,
      now: () => now,
    });
    await client.getKey('k1', 'RS256');

    failing = true;
    now += 61_000;
    expect(await client.getKey('unknown', 'RS256')).toBeNull();

    expect(await client.getKey('k1', 'RS256')).not.toBeNull();
  });

  it('treats non-JSON and HTTP errors as an empty result', async () => {
    const bad = new JwksClient('https://idp.example.com/jwks', {
      fetchFn: (() =>
        Promise.resolve(new Response('nope', { status: 500 }))) as typeof fetch,
    });
    const garbage = new JwksClient('https://idp.example.com/jwks', {
      fetchFn: (() =>
        Promise.resolve(
          new Response('<html>', { status: 200 }),
        )) as typeof fetch,
    });

    expect(await bad.getKey('k', 'RS256')).toBeNull();
    expect(await garbage.getKey('k', 'RS256')).toBeNull();
  });
});
