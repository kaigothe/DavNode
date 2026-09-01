import { describe, expect, it } from 'vitest';
import type { EffectiveLock } from './collect-locks.js';
import { buildActiveLockXml, buildLockDiscoveryContent } from './lock-discovery.js';

function baseLock(overrides: Partial<EffectiveLock> = {}): EffectiveLock {
  return {
    id: 'lock-1',
    collectionId: 'collection-1',
    principalId: 'principal-1',
    token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
    scope: 'exclusive',
    depth: 'infinity',
    timeoutSeconds: null,
    expiresAt: null,
    ownerInfo: null,
    createdAt: new Date(),
    inherited: false,
    inheritedFrom: null,
    ...overrides,
  } as EffectiveLock;
}

describe('buildActiveLockXml', () => {
  it('renders lockscope, locktype, token and lockroot', () => {
    const xml = buildActiveLockXml(
      baseLock({ scope: 'exclusive' }),
      '/dav/acme/files/doc.txt',
    );

    expect(xml).toContain('<D:activelock xmlns:D="DAV:">');
    expect(xml).toContain('<D:exclusive/>');
    expect(xml).toContain('<D:write/>');
    expect(xml).toContain(
      '<D:locktoken><D:href>urn:uuid:11111111-1111-1111-1111-111111111111</D:href></D:locktoken>',
    );
    expect(xml).toContain(
      '<D:lockroot><D:href>/dav/acme/files/doc.txt</D:href></D:lockroot>',
    );
  });

  it('renders shared scope', () => {
    const xml = buildActiveLockXml(baseLock({ scope: 'shared' }), '/x');
    expect(xml).toContain('<D:shared/>');
  });

  it('renders depth infinity for a CollectionLock with depth: infinity', () => {
    const xml = buildActiveLockXml(baseLock({ depth: 'infinity' }), '/x');
    expect(xml).toContain('<D:depth>infinity</D:depth>');
  });

  it('renders depth 0 for a CollectionLock with depth: zero', () => {
    const xml = buildActiveLockXml(baseLock({ depth: 'zero' }), '/x');
    expect(xml).toContain('<D:depth>0</D:depth>');
  });

  it('renders depth 0 for a FileLock, which has no depth field at all', () => {
    const lock = {
      id: 'lock-1',
      fileResourceId: 'file-1',
      principalId: 'principal-1',
      token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
      scope: 'exclusive',
      timeoutSeconds: null,
      expiresAt: null,
      ownerInfo: null,
      createdAt: new Date(),
      inherited: false,
      inheritedFrom: null,
    } as EffectiveLock;

    const xml = buildActiveLockXml(lock, '/x');
    expect(xml).toContain('<D:depth>0</D:depth>');
  });

  it('omits <D:owner> when ownerInfo is null', () => {
    const xml = buildActiveLockXml(baseLock({ ownerInfo: null }), '/x');
    expect(xml).not.toContain('<D:owner>');
  });

  it('re-embeds ownerInfo raw content unchanged when present', () => {
    const xml = buildActiveLockXml(
      baseLock({ ownerInfo: '<D:href>mailto:alice@example.com</D:href>' }),
      '/x',
    );
    expect(xml).toContain(
      '<D:owner><D:href>mailto:alice@example.com</D:href></D:owner>',
    );
  });

  it('renders "Infinite" timeout for a null expiresAt', () => {
    const xml = buildActiveLockXml(baseLock({ expiresAt: null }), '/x');
    expect(xml).toContain('<D:timeout>Infinite</D:timeout>');
  });

  it('renders "Second-N" timeout computed from the remaining time until expiresAt', () => {
    const xml = buildActiveLockXml(
      baseLock({ expiresAt: new Date(Date.now() + 3600_000) }),
      '/x',
    );
    const match = /<D:timeout>Second-(\d+)<\/D:timeout>/.exec(xml);
    expect(match).not.toBeNull();
    const seconds = Number(match?.[1]);
    expect(seconds).toBeGreaterThan(3590);
    expect(seconds).toBeLessThanOrEqual(3600);
  });
});

describe('buildLockDiscoveryContent', () => {
  it('returns an empty string for no locks', () => {
    expect(buildLockDiscoveryContent([])).toBe('');
  });

  it('concatenates one activelock fragment per lock, in order', () => {
    const content = buildLockDiscoveryContent([
      {
        lock: baseLock({
          token: 'urn:uuid:11111111-1111-1111-1111-111111111111',
        }),
        lockRootHref: '/dav/acme/files/a',
      },
      {
        lock: baseLock({
          token: 'urn:uuid:22222222-2222-2222-2222-222222222222',
        }),
        lockRootHref: '/dav/acme/files/b',
      },
    ]);

    const firstIndex = content.indexOf('11111111');
    const secondIndex = content.indexOf('22222222');
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(content.match(/<D:activelock/g)).toHaveLength(2);
  });
});
