import { decodeSyncToken } from './sync-token.js';

/**
 * The result of validating a `sync-collection` REPORT's `<D:sync-token>`
 * against the collection it was submitted against.
 */
export type SyncTokenValidationResult =
  | { valid: true; seq: number }
  | { valid: false };

/**
 * Validates a `sync-collection` REPORT's `<D:sync-token>` (RFC 6578
 * §3.6) against `collectionId`'s current `syncSeq`.
 *
 * A missing or empty token is **not** invalid — RFC 6578 §3.6 treats
 * that as the client's first-ever sync against this collection, so
 * every currently existing direct child is reported as `added`; this
 * is expressed here as a valid token for `seq: 0` (before any change
 * could ever have been recorded).
 *
 * A non-empty token is rejected — `{ valid: false }`, the caller's cue
 * to respond `403 Forbidden` with a `<D:valid-sync-token/>`
 * precondition (RFC 6578 §3.6) — when:
 * - it doesn't parse ({@link decodeSyncToken} returns `null`);
 * - it names a different collection than `collectionId` (the client
 *   submitted a token issued for some other collection); or
 * - its `seq` is greater than `currentSyncSeq` — a sequence number this
 *   collection's own counter hasn't reached yet, which can't happen
 *   through normal use and most likely means the database was restored
 *   from a backup older than the token.
 *
 * @param token - The raw `<D:sync-token>` request value, or `null`/`undefined`/`''`
 * for a missing or empty element.
 * @param collectionId - The collection the REPORT was issued against.
 * @param currentSyncSeq - That collection's current `syncSeq` counter.
 */
export function validateSyncToken(
  token: string | null | undefined,
  collectionId: string,
  currentSyncSeq: number,
): SyncTokenValidationResult {
  if (token === null || token === undefined || token === '') {
    return { valid: true, seq: 0 };
  }

  const decoded = decodeSyncToken(token);
  if (
    !decoded ||
    decoded.collectionId !== collectionId ||
    decoded.seq > currentSyncSeq
  ) {
    return { valid: false };
  }

  return { valid: true, seq: decoded.seq };
}
