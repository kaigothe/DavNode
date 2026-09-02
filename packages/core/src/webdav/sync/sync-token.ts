/**
 * The opaque `<D:sync-token>` value's prefix (RFC 6578 §3.6 leaves the
 * format entirely up to the server) — a project-chosen literal, not
 * part of any standard, distinguishing a DavNode sync token from
 * anything else a client might mistakenly submit.
 */
const SYNC_TOKEN_PREFIX = 'davnode-sync:';

/** A sync token's decoded contents: which collection it's for, and the `syncSeq` it was issued at. */
export interface DecodedSyncToken {
  collectionId: string;
  seq: number;
}

/**
 * Encodes a sync token for `collectionId` at sequence `seq` — the value
 * returned to a client after a `sync-collection` REPORT, to be
 * submitted back as `<D:sync-token>` on its next request.
 */
export function encodeSyncToken(collectionId: string, seq: number): string {
  return `${SYNC_TOKEN_PREFIX}${collectionId}:${seq}`;
}

/**
 * Decodes a sync token produced by {@link encodeSyncToken}.
 *
 * @returns The decoded `collectionId`/`seq`, or `null` if `token` isn't
 * well-formed — a client-supplied string is never trusted structurally,
 * so this never throws.
 */
export function decodeSyncToken(token: string): DecodedSyncToken | null {
  if (!token.startsWith(SYNC_TOKEN_PREFIX)) {
    return null;
  }
  const rest = token.slice(SYNC_TOKEN_PREFIX.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon === -1) {
    return null;
  }

  const collectionId = rest.slice(0, lastColon);
  const seqPart = rest.slice(lastColon + 1);
  if (collectionId === '' || !/^\d+$/.test(seqPart)) {
    return null;
  }

  return { collectionId, seq: Number(seqPart) };
}
