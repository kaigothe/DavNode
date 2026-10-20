import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, basicAuthorization } from './client';

const credentials = { tenantSlug: 'acme', authorization: 'Basic abc' };

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('basicAuthorization', () => {
  it('encodes user and password as Basic credentials', () => {
    expect(basicAuthorization('alice', 'pw')).toBe(`Basic ${btoa('alice:pw')}`);
  });

  it('encodes non-ASCII characters as UTF-8', () => {
    // "ü" is 0xC3 0xBC in UTF-8.
    expect(basicAuthorization('jürgen', 'p')).toBe(
      `Basic ${btoa('jÃ¼rgen:p')}`,
    );
  });
});

describe('apiRequest', () => {
  it('calls /admin/{tenant}{path} with the credentials and no cookies', async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));

    const body = await apiRequest(credentials, '/users', {
      query: { limit: 10, q: undefined, raw: false },
    });

    expect(body).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.pathname).toBe('/admin/acme/users');
    expect(url.search).toBe('?limit=10&raw=false');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic abc',
    );
  });

  it('never puts the credentials into the address', async () => {
    const fetchMock = stubFetch(Response.json({}));

    await apiRequest(
      {
        tenantSlug: 'acme',
        authorization: basicAuthorization('alice', 's3cret'),
      },
      '/me',
      { query: { q: 'x' } },
    );

    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.href).not.toMatch(/s3cret|alice:|Basic|@/);
  });

  it('escapes the tenant slug in the path', async () => {
    const fetchMock = stubFetch(Response.json({}));

    await apiRequest({ ...credentials, tenantSlug: 'a/b' }, '/me');

    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.pathname).toBe('/admin/a%2Fb/me');
  });

  it('sends a body as JSON', async () => {
    const fetchMock = stubFetch(Response.json({}, { status: 201 }));

    await apiRequest(credentials, '/users', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('returns undefined for 204', async () => {
    stubFetch(new Response(null, { status: 204 }));

    expect(
      await apiRequest(credentials, '/users/1', { method: 'DELETE' }),
    ).toBeUndefined();
  });

  it('turns the API error body into an ApiError', async () => {
    stubFetch(
      Response.json(
        { error: { code: 'insufficient_role', message: 'Nope.' } },
        { status: 403 },
      ),
    );

    await expect(apiRequest(credentials, '/tenants')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'insufficient_role',
      message: 'Nope.',
    });
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'http_500'],
  ])('maps a bodiless %i to the code %s', async (status, code) => {
    stubFetch(new Response(null, { status }));

    await expect(apiRequest(credentials, '/me')).rejects.toMatchObject({
      status,
      code,
    });
  });

  it('reports an unreachable server as network_error', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    const error = await apiRequest(credentials, '/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });
});
