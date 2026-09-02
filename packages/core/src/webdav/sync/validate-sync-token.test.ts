import { describe, expect, it } from 'vitest';
import { encodeSyncToken } from './sync-token.js';
import { validateSyncToken } from './validate-sync-token.js';

const COLLECTION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_COLLECTION_ID = '22222222-2222-2222-2222-222222222222';

describe('validateSyncToken', () => {
  it('treats a missing token as a valid initial sync (seq 0)', () => {
    expect(validateSyncToken(undefined, COLLECTION_ID, 10)).toEqual({
      valid: true,
      seq: 0,
    });
  });

  it('treats null the same as missing', () => {
    expect(validateSyncToken(null, COLLECTION_ID, 10)).toEqual({
      valid: true,
      seq: 0,
    });
  });

  it('treats an empty string the same as missing', () => {
    expect(validateSyncToken('', COLLECTION_ID, 10)).toEqual({
      valid: true,
      seq: 0,
    });
  });

  it('accepts a well-formed token for the requested collection at or below the current syncSeq', () => {
    const token = encodeSyncToken(COLLECTION_ID, 5);
    expect(validateSyncToken(token, COLLECTION_ID, 10)).toEqual({
      valid: true,
      seq: 5,
    });
  });

  it('accepts a token whose seq exactly equals the current syncSeq', () => {
    const token = encodeSyncToken(COLLECTION_ID, 10);
    expect(validateSyncToken(token, COLLECTION_ID, 10)).toEqual({
      valid: true,
      seq: 10,
    });
  });

  it('rejects a token issued for a different collection', () => {
    const token = encodeSyncToken(OTHER_COLLECTION_ID, 5);
    expect(validateSyncToken(token, COLLECTION_ID, 10)).toEqual({
      valid: false,
    });
  });

  it('rejects a token whose seq is greater than the current syncSeq', () => {
    const token = encodeSyncToken(COLLECTION_ID, 11);
    expect(validateSyncToken(token, COLLECTION_ID, 10)).toEqual({
      valid: false,
    });
  });

  it('rejects an unparseable token', () => {
    expect(validateSyncToken('garbage', COLLECTION_ID, 10)).toEqual({
      valid: false,
    });
  });
});
