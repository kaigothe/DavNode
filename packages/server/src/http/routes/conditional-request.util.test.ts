import { describe, expect, it } from 'vitest';
import {
  ifMatchSatisfied,
  ifNoneMatchMatches,
} from './conditional-request.util.js';

const ETAG = 'a1b2c3';

describe('ifMatchSatisfied', () => {
  it.each([
    ['the bare ETag as the server sends it', ETAG],
    ['the quoted ETag', `"${ETAG}"`],
    ['a list containing it', `"other", "${ETAG}"`],
    ['a list without spaces', `"x","${ETAG}"`],
    ['the wildcard', '*'],
    ['the wildcard with padding', '  *  '],
  ])('holds for %s', (_label, header) => {
    expect(ifMatchSatisfied(header, ETAG)).toBe(true);
  });

  it.each([
    ['another ETag', '"zzz"'],
    ['a list without it', '"x", "y"'],
    ['a weak validator of it (strong comparison)', `W/"${ETAG}"`],
    ['a prefix of it', ETAG.slice(0, 3)],
    ['nothing', ''],
  ])('does not hold for %s', (_label, header) => {
    expect(ifMatchSatisfied(header, ETAG)).toBe(false);
  });

  it('reads a quoted tag that contains a comma as one tag', () => {
    expect(ifMatchSatisfied('"a,b"', 'a,b')).toBe(true);
    expect(ifMatchSatisfied('"a,b"', 'a')).toBe(false);
  });
});

describe('ifNoneMatchMatches', () => {
  it.each([
    ['the bare ETag', ETAG],
    ['the quoted ETag', `"${ETAG}"`],
    ['a weak validator of it (weak comparison)', `W/"${ETAG}"`],
    ['a list containing it', `"other", "${ETAG}"`],
    ['the wildcard', '*'],
  ])('matches %s', (_label, header) => {
    expect(ifNoneMatchMatches(header, ETAG)).toBe(true);
  });

  it.each([
    ['another ETag', '"zzz"'],
    ['a list without it', '"x", "y"'],
    ['nothing', ''],
  ])('does not match %s', (_label, header) => {
    expect(ifNoneMatchMatches(header, ETAG)).toBe(false);
  });
});
