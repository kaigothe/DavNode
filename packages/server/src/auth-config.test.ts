import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTH_CONFIG, parseAuthConfig } from './auth-config.js';

const issuers = JSON.stringify([
  {
    issuer: 'https://idp.example.com',
    audience: 'davnode',
    jwksUri: 'https://idp.example.com/jwks',
  },
]);

describe('parseAuthConfig', () => {
  it('defaults to Basic only', () => {
    expect(parseAuthConfig({})).toEqual(DEFAULT_AUTH_CONFIG);
    expect(parseAuthConfig({ DAVNODE_AUTH_PROVIDERS: ' ' })).toEqual(
      DEFAULT_AUTH_CONFIG,
    );
  });

  it('parses a comma-separated list, trimmed, case-insensitive, without duplicates', () => {
    const config = parseAuthConfig({
      DAVNODE_AUTH_PROVIDERS: ' Digest, basic ,digest',
    });

    expect(config.providers).toEqual(['digest', 'basic']);
  });

  it('uses DAVNODE_AUTH_REALM, defaulting to davnode', () => {
    expect(parseAuthConfig({ DAVNODE_AUTH_REALM: 'files' }).realm).toBe(
      'files',
    );
    expect(parseAuthConfig({ DAVNODE_AUTH_REALM: ' ' }).realm).toBe('davnode');
  });

  it('rejects an unknown provider with a clear message', () => {
    expect(() =>
      parseAuthConfig({ DAVNODE_AUTH_PROVIDERS: 'basic,kerberos' }),
    ).toThrow(/Unknown auth provider "kerberos".*basic, digest, oauth2/);
  });

  it('refuses oauth2 without any configured issuer', () => {
    expect(() => parseAuthConfig({ DAVNODE_AUTH_PROVIDERS: 'oauth2' })).toThrow(
      /DAVNODE_OAUTH2_ISSUERS/,
    );
    expect(() =>
      parseAuthConfig({
        DAVNODE_AUTH_PROVIDERS: 'basic,oauth2',
        DAVNODE_OAUTH2_ISSUERS: '[]',
      }),
    ).toThrow(/no issuer/);
  });

  it('returns the issuers when oauth2 is active and ignores them otherwise', () => {
    const active = parseAuthConfig({
      DAVNODE_AUTH_PROVIDERS: 'basic,oauth2',
      DAVNODE_OAUTH2_ISSUERS: issuers,
    });
    expect(active.oauth2Issuers.map((i) => i.issuer)).toEqual([
      'https://idp.example.com',
    ]);

    expect(
      parseAuthConfig({ DAVNODE_OAUTH2_ISSUERS: issuers }).oauth2Issuers,
    ).toEqual([]);
  });

  it('propagates a malformed issuer configuration', () => {
    expect(() =>
      parseAuthConfig({
        DAVNODE_AUTH_PROVIDERS: 'oauth2',
        DAVNODE_OAUTH2_ISSUERS: 'nope',
      }),
    ).toThrow(/not valid JSON/);
  });
});
