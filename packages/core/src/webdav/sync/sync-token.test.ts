import { describe, expect, it } from 'vitest';
import { decodeSyncToken, encodeSyncToken } from './sync-token.js';

describe('encodeSyncToken / decodeSyncToken', () => {
  it('round-trips a collection id and sequence number', () => {
    const token = encodeSyncToken('11111111-1111-1111-1111-111111111111', 42);
    expect(decodeSyncToken(token)).toEqual({
      collectionId: '11111111-1111-1111-1111-111111111111',
      seq: 42,
    });
  });

  it('round-trips seq 0', () => {
    const token = encodeSyncToken('11111111-1111-1111-1111-111111111111', 0);
    expect(decodeSyncToken(token)).toEqual({
      collectionId: '11111111-1111-1111-1111-111111111111',
      seq: 0,
    });
  });

  it('returns null for a string without the davnode-sync: prefix', () => {
    expect(decodeSyncToken('not-a-sync-token')).toBeNull();
  });

  it('returns null for a token missing the sequence number', () => {
    expect(decodeSyncToken('davnode-sync:some-id')).toBeNull();
  });

  it('returns null for a token with a non-numeric sequence number', () => {
    expect(decodeSyncToken('davnode-sync:some-id:abc')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeSyncToken('')).toBeNull();
  });

  it('returns null for a token with an empty collection id', () => {
    expect(decodeSyncToken('davnode-sync::42')).toBeNull();
  });
});
