import type { ReportContext } from '../report-registry.js';
import type { MultistatusPropertyResult } from '../xml/multistatus-builder.js';
import type { PropertyName } from '../xml/request-parser.js';
import type { ChangeLogRepository } from './change-log.js';

/** One direct child of a {@link SyncCollectionTarget}, as `sync-collection` reports it. */
export interface SyncCollectionMember {
  /** The member's own path segment — matches `ChangeEntry.name`. */
  name: string;
  /** The member's `<D:href>`. */
  resolveHref(): Promise<string>;
  /** Resolves `requested` against the member's properties (`200` if found, `404` otherwise). */
  resolveProperties(
    requested: readonly PropertyName[],
  ): Promise<MultistatusPropertyResult[]>;
}

/**
 * A collection a `sync-collection` REPORT was resolved against, with
 * everything the shared handler needs from it — expressed as closures
 * rather than a generic resource type so the handler stays free of any
 * one domain's entities (`Collection`/`FileResource` for WebDAV,
 * `AddressbookCollection`/`AddressObject` for CardDAV).
 */
export interface SyncCollectionTarget {
  /** The collection's id — what its sync tokens are bound to. */
  id: string;
  /** The collection's current `syncSeq` counter. */
  syncSeq: number;
  /** This collection's change log. */
  changeLog: ChangeLogRepository;
  /** Whether the requesting principal has `read` on this collection. */
  canRead(): Promise<boolean>;
  /** The collection's own `<D:href>`, without a trailing slash. */
  resolveHref(): Promise<string>;
  /** Every direct child currently in the collection. */
  listMembers(): Promise<SyncCollectionMember[]>;
}

/**
 * One resource domain's side of the `sync-collection` REPORT (RFC 6578):
 * knows which URL subtree belongs to it and how to turn a request into
 * a {@link SyncCollectionTarget}. `{DAV:}sync-collection` is a single
 * registry key, so `SyncCollectionReportHandler` holds a list of these
 * and lets the first one that recognizes the request path handle it.
 */
export interface SyncCollectionDomain {
  /**
   * Resolves `context.segments` to this domain's target collection.
   *
   * @returns The target, or `null` if the path isn't in this domain's
   * subtree or names no existing collection — both end in `404`.
   */
  resolveTarget(context: ReportContext): Promise<SyncCollectionTarget | null>;
}
