import { describe, expect, it } from 'vitest';
import { evaluateIfHeader, parseIfHeader } from './if-header.js';

const TOKEN = 'urn:uuid:25bf1d28-4b25-4215-83f6-8af8bee75fb4';

describe('parseIfHeader', () => {
  it('parses untagged lists with tokens, entity tags and Not', () => {
    expect(parseIfHeader(`(<${TOKEN}> ["abc"]) (Not <DAV:no-lock>)`)).toEqual([
      {
        resourceTag: null,
        conditions: [
          { not: false, kind: 'token', value: TOKEN },
          { not: false, kind: 'etag', value: '"abc"' },
        ],
      },
      {
        resourceTag: null,
        conditions: [{ not: true, kind: 'token', value: 'DAV:no-lock' }],
      },
    ]);
  });

  it('parses tagged lists, a tag applying to every list after it until the next tag', () => {
    const lists = parseIfHeader(
      `</a/b> (<${TOKEN}>) ([x]) <http://h/c> (<t2>)`,
    );

    expect(lists?.map((list) => list.resourceTag)).toEqual([
      '/a/b',
      '/a/b',
      'http://h/c',
    ]);
  });

  it('accepts entity tags that contain brackets-free text with escapes', () => {
    expect(parseIfHeader('(["a\\]b"])')?.[0]?.conditions[0]?.value).toBe(
      '"a\\]b"',
    );
  });

  it.each([
    undefined,
    '',
    '  ',
    'nonsense',
    '(',
    '()',
    '(<x)',
    '<tag>',
    '(Nott <x>)',
  ])('returns null for %j', (header) => {
    expect(parseIfHeader(header)).toBeNull();
  });
});

describe('evaluateIfHeader', () => {
  const locked = { etag: 'abc', lockTokens: new Set([TOKEN]) };
  const unlocked = { etag: 'abc', lockTokens: new Set<string>() };
  const check = (
    header: string,
    state = locked,
    path = '/dav/acme/files/a.txt',
  ) => evaluateIfHeader(parseIfHeader(header)!, path, state);

  it('holds for a lock token the resource has, and fails for one it does not', () => {
    expect(check(`(<${TOKEN}>)`)).toBe(true);
    expect(check(`(<${TOKEN}>)`, unlocked)).toBe(false);
    expect(check('(<urn:uuid:other>)')).toBe(false);
  });

  it('compares entity tags regardless of quotes and weak prefix', () => {
    expect(check('(["abc"])')).toBe(true);
    expect(check('([abc])')).toBe(true);
    expect(check('([W/"abc"])')).toBe(true);
    expect(check('(["other"])')).toBe(false);
    expect(check('(["abc"])', { etag: null, lockTokens: new Set() })).toBe(
      false,
    );
  });

  it('requires every condition of one list (AND) but only one list (OR)', () => {
    expect(check(`(<${TOKEN}> ["abc"])`)).toBe(true);
    expect(check(`(<${TOKEN}> ["wrong"])`)).toBe(false);
    expect(check(`(<${TOKEN}> ["wrong"]) (["abc"])`)).toBe(true);
  });

  it('treats DAV:no-lock as a token no resource has', () => {
    expect(check('(<DAV:no-lock>)')).toBe(false);
    expect(check('(Not <DAV:no-lock>)')).toBe(true);
    expect(check(`(<${TOKEN}>) (Not <DAV:no-lock>)`, unlocked)).toBe(true);
    expect(check(`(<${TOKEN}> ["abc"]) (Not <DAV:no-lock> ["wrong"])`)).toBe(
      true,
    );
    expect(check(`(<${TOKEN}> ["wrong"]) (Not <DAV:no-lock> ["wrong"])`)).toBe(
      false,
    );
  });

  it('applies a list tagged with the request URL, as path or absolute URL, trailing slash ignored', () => {
    expect(check(`</dav/acme/files/a.txt> (<${TOKEN}>)`)).toBe(true);
    expect(check(`<http://h:8/dav/acme/files/a.txt/> (<${TOKEN}>)`)).toBe(true);
    expect(check(`</dav/acme/files/a.txt> (<urn:uuid:no>)`)).toBe(false);
    expect(
      check(
        `</dav/acme/files/a%20b.txt> (<${TOKEN}>)`,
        locked,
        '/dav/acme/files/a b.txt',
      ),
    ).toBe(true);
  });

  it('a truncated tail cannot rescue a failing list (litmus fail_complex_cond_put)', () => {
    expect(check(`(<${TOKEN}> ["wrong"]) (Not <DAV:no-lock> ["wr`)).toBe(false);
    expect(check(`(<${TOKEN}> ["abc"]) (Not <DAV:no-lock> ["wr`)).toBe(true);
  });

  it('does not object when it can only see lists tagged with other resources', () => {
    expect(check('</dav/acme/files/other.txt> (<urn:uuid:no>)')).toBe(true);
    expect(
      check('</dav/acme/files/a.txt> (<urn:uuid:no>) </dav/other> (<x>)'),
    ).toBe(true);
  });
});
