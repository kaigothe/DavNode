import { fragment } from 'xmlbuilder2';
import { resolveCollectionHref, resolveResourceHref } from '../resource-path-resolver.js';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from '../properties/property-provider.interface.js';
import { getEffectiveLocks, type EffectiveLock } from './collect-locks.js';
import { buildLockDiscoveryContent, type RootedLock } from './lock-discovery.js';

const LOCK_PROPERTY_NAMES = new Set(['supportedlock', 'lockdiscovery']);

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

/** Appends one `<D:lockentry>` (RFC 4918 §14.9) for `scope`/`write` to `root`. */
function appendLockEntry(
  root: ReturnType<typeof fragment>,
  scope: 'exclusive' | 'shared',
): void {
  const lockentry = root.ele(DAV_NAMESPACE, 'D:lockentry');
  lockentry.ele(DAV_NAMESPACE, 'D:lockscope').ele(DAV_NAMESPACE, `D:${scope}`);
  lockentry.ele(DAV_NAMESPACE, 'D:locktype').ele(DAV_NAMESPACE, 'D:write');
}

/**
 * `DAV:supportedlock`'s value (RFC 4918 §15.10): this server always
 * supports both `write`/`exclusive` and `write`/`shared` (RFC 4918
 * defines no other lock type), identically for every resource — so,
 * unlike `lockdiscovery`, it needs no per-request computation at all.
 * Built once at module load rather than on every `listLiveProperties`
 * call.
 */
const SUPPORTED_LOCK_VALUE = ((): string => {
  const root = fragment();
  appendLockEntry(root, 'exclusive');
  appendLockEntry(root, 'shared');
  return root.toString();
})();

/**
 * Resolves one lock's `lockroot` href (RFC 4918 §14.12): the resource
 * being queried itself for a direct lock, or the ancestor collection it
 * was inherited from — the same distinction `getEffectiveLocks` already
 * tracks via `inheritedFrom`, just turned into a URL here rather than
 * left as a `Collection` id.
 */
async function resolveLockRootHref(
  context: PropertyProviderContext,
  resource: WebDavResource,
  lock: EffectiveLock,
): Promise<string> {
  if (lock.inheritedFrom === null) {
    return resolveResourceHref(context.manager, context.tenant, resource);
  }
  return resolveCollectionHref(
    context.manager,
    context.tenant,
    lock.inheritedFrom,
  );
}

/**
 * The RFC 4918 Class 2 locking live properties (M4), registered into
 * the same `PropertyProviderRegistry` as `WebDavLiveProperties` (M2) —
 * which no longer serves `supportedlock`/`lockdiscovery` itself, since
 * this provider now owns both:
 *
 * - `DAV:supportedlock` — a static value (the same for every resource).
 * - `DAV:lockdiscovery` — every lock currently effective on the queried
 *   resource (`getEffectiveLocks`, direct or inherited via
 *   `Depth: infinity`, milestones/M4-locking-sync/02-lock-evaluation),
 *   rendered via `buildLockDiscoveryContent` — the same builder the
 *   LOCK route's own response body uses. Unlike that route (which, per
 *   RFC 4918 §9.10.1, only has to report the lock it just created),
 *   PROPFIND has no such exemption: every effective lock is reported,
 *   each with its own correctly-resolved `lockroot`.
 *
 * An unlocked resource gets a `lockdiscovery` value of `''` — a
 * well-formed, empty `<D:lockdiscovery/>` once the registry's caller
 * wraps it, not an error.
 */
export class LockPropertiesProvider implements PropertyProvider<WebDavResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  async listLiveProperties(
    resource: WebDavResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    const effectiveLocks = await getEffectiveLocks(context.manager, resource);
    const rootedLocks: RootedLock[] = await Promise.all(
      effectiveLocks.map(async (lock) => ({
        lock,
        lockRootHref: await resolveLockRootHref(context, resource, lock),
      })),
    );

    return [
      property('supportedlock', SUPPORTED_LOCK_VALUE),
      property('lockdiscovery', buildLockDiscoveryContent(rootedLocks)),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && LOCK_PROPERTY_NAMES.has(name);
  }
}
