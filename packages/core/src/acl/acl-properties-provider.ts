import type { EntityManager } from 'typeorm';
import { fragment } from 'xmlbuilder2';
import { Collection } from '../entities/collection.entity.js';
import { Principal } from '../entities/principal.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import { toPrincipalUrl } from '../principals/principal-url.js';
import { toSpecialPrincipalXmlElement } from '../principals/special-principals.js';
import type { XmlNode } from '../webdav/xml/xml-value.js';
import { DAV_NAMESPACE } from '../webdav/xml/request-parser.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
  WebDavResource,
} from '../webdav/properties/property-provider.interface.js';
import { type AceLike, type CollectedAce, collectWebDavAces } from './collect-aces.js';
import { getCurrentUserPrivilegeSet } from './evaluate-privilege.js';
import type { Privilege } from './privilege.js';

const ACL_PROPERTY_NAMES = new Set([
  'owner',
  'supported-privilege-set',
  'current-user-privilege-set',
  'acl',
  'principal-collection-set',
  'current-user-principal',
]);

function property(name: string, value: string): PropertyValue {
  return { namespace: DAV_NAMESPACE, name, value };
}

function hrefValue(url: string): string {
  return fragment().ele(DAV_NAMESPACE, 'D:href').txt(url).toString();
}

/** A principal, resolved to however RFC 3744 represents it in XML: an `<D:href>` for a real user/group, or its own element for a special principal (e.g. `<D:all/>`). */
type ResolvedPrincipalRef =
  | { kind: 'href'; url: string }
  | { kind: 'special'; elementName: string };

async function resolvePrincipalRef(
  manager: EntityManager,
  tenant: Tenant,
  principalId: string,
): Promise<ResolvedPrincipalRef> {
  const principal = await manager
    .getRepository(Principal)
    .findOneByOrFail({ id: principalId });
  if (principal.kind === 'special' && principal.specialKind) {
    return {
      kind: 'special',
      elementName: toSpecialPrincipalXmlElement(principal.specialKind),
    };
  }
  return { kind: 'href', url: toPrincipalUrl(principal, tenant) };
}

function principalRefValue(ref: ResolvedPrincipalRef): string {
  return ref.kind === 'special'
    ? fragment().ele(DAV_NAMESPACE, `D:${ref.elementName}`).toString()
    : hrefValue(ref.url);
}

function appendPrincipalRef(parent: XmlNode, ref: ResolvedPrincipalRef): void {
  const principalElement = parent.ele(DAV_NAMESPACE, 'D:principal');
  if (ref.kind === 'special') {
    principalElement.ele(DAV_NAMESPACE, `D:${ref.elementName}`);
  } else {
    principalElement.ele(DAV_NAMESPACE, 'D:href').txt(ref.url);
  }
}

/**
 * Resolves `collectionId`'s DAV href by walking its `parentCollectionId`
 * chain up to the tenant root and joining the collected `displayName`s —
 * the reverse of `ResourcePathResolver.resolve` (which goes href →
 * resource, not resource → href). Needed only for `DAV:acl`'s
 * `<D:inherited><D:href>...</D:href></D:inherited>` (RFC 3744 §5.5),
 * which must name the ancestor collection an inherited ACE came from.
 */
async function resolveCollectionHref(
  manager: EntityManager,
  tenant: Tenant,
  collectionId: string,
): Promise<string> {
  const collections = manager.getRepository(Collection);
  const segments: string[] = [];
  let current = await collections.findOneByOrFail({ id: collectionId });
  while (current.parentCollectionId !== null) {
    segments.unshift(current.displayName);
    current = await collections.findOneByOrFail({
      id: current.parentCollectionId,
    });
  }
  const suffix = segments.map(encodeURIComponent).join('/');
  return `/dav/${tenant.slug}/files${suffix ? `/${suffix}` : ''}`;
}

/** Builds the `<D:acl>` property's value: one `<D:ace>` per collected ACE (RFC 3744 §5.5). */
async function buildAclValue(
  manager: EntityManager,
  tenant: Tenant,
  aces: readonly CollectedAce<AceLike>[],
): Promise<string> {
  const principalRefs = await Promise.all(
    aces.map((ace) => resolvePrincipalRef(manager, tenant, ace.principalId)),
  );
  const inheritedHrefs = await Promise.all(
    aces.map((ace) =>
      ace.inheritedFrom
        ? resolveCollectionHref(manager, tenant, ace.inheritedFrom)
        : Promise.resolve(null),
    ),
  );

  const root = fragment();
  aces.forEach((ace, index) => {
    const aceElement = root.ele(DAV_NAMESPACE, 'D:ace');
    appendPrincipalRef(aceElement, principalRefs[index]);

    const grantDenyElement = aceElement.ele(
      DAV_NAMESPACE,
      `D:${ace.grantDeny}`,
    );
    grantDenyElement
      .ele(DAV_NAMESPACE, 'D:privilege')
      .ele(DAV_NAMESPACE, `D:${ace.privilege}`);

    if (ace.protected) {
      aceElement.ele(DAV_NAMESPACE, 'D:protected');
    }
    const inheritedHref = inheritedHrefs[index];
    if (inheritedHref) {
      aceElement
        .ele(DAV_NAMESPACE, 'D:inherited')
        .ele(DAV_NAMESPACE, 'D:href')
        .txt(inheritedHref);
    }
  });

  return root.toString();
}

/** Builds a `<D:privilege>` list value (used by `current-user-privilege-set`). */
function buildPrivilegeListValue(privileges: readonly Privilege[]): string {
  const root = fragment();
  for (const privilege of privileges) {
    root.ele(DAV_NAMESPACE, 'D:privilege').ele(DAV_NAMESPACE, `D:${privilege}`);
  }
  return root.toString();
}

/** One node of the static `DAV:supported-privilege-set` tree (RFC 3744 §5.3). */
interface PrivilegeTreeNode {
  privilege: Privilege;
  description: string;
  children?: PrivilegeTreeNode[];
}

/**
 * The privilege catalog's aggregation structure (see
 * `milestones/M3-webdav-acl/01-ace-entities-and-privileges/02-privilege-catalog.md`
 * and `expandPrivilege` in `privilege-aggregation.ts`), described as the
 * static tree `DAV:supported-privilege-set` reports: `all` aggregates
 * everything, `write` aggregates `write-content`/`write-properties`.
 */
const PRIVILEGE_TREE: PrivilegeTreeNode = {
  privilege: 'all',
  description: 'All privileges',
  children: [
    { privilege: 'read', description: 'Read any object' },
    {
      privilege: 'write',
      description: 'Write any object',
      children: [
        { privilege: 'write-content', description: "Write a resource's content" },
        { privilege: 'write-properties', description: "Write a resource's properties" },
      ],
    },
    { privilege: 'bind', description: 'Add a member to a collection' },
    { privilege: 'unbind', description: 'Remove a member from a collection' },
    { privilege: 'unlock', description: 'Unlock a resource' },
    { privilege: 'read-acl', description: "Read a resource's ACL" },
    { privilege: 'write-acl', description: "Write a resource's ACL" },
    {
      privilege: 'read-current-user-privilege-set',
      description: "Read a resource's current-user-privilege-set property",
    },
  ],
};

function appendSupportedPrivilege(parent: XmlNode, node: PrivilegeTreeNode): void {
  const element = parent.ele(DAV_NAMESPACE, 'D:supported-privilege');
  element.ele(DAV_NAMESPACE, 'D:privilege').ele(DAV_NAMESPACE, `D:${node.privilege}`);
  element
    .ele(DAV_NAMESPACE, 'D:description')
    .att('xml:lang', 'en')
    .txt(node.description);
  for (const child of node.children ?? []) {
    appendSupportedPrivilege(element, child);
  }
}

// Static (independent of resource/principal/tenant) — computed once
// rather than rebuilt on every listLiveProperties call.
const SUPPORTED_PRIVILEGE_SET_VALUE = ((): string => {
  const root = fragment();
  appendSupportedPrivilege(root, PRIVILEGE_TREE);
  return root.toString();
})();

/**
 * The RFC 3744/RFC 5397 ACL-related live properties, registered into the
 * same {@link PropertyProviderRegistry} as `WebDavLiveProperties` (M2)
 * so PROPFIND serves them alongside the core WebDAV property set:
 *
 * - `DAV:owner` — the resource's `ownerPrincipalId`, as a principal URL.
 * - `DAV:supported-privilege-set` — the static privilege-catalog tree
 *   (the module-private `PRIVILEGE_TREE` constant).
 * - `DAV:current-user-privilege-set` — `getCurrentUserPrivilegeSet`'s
 *   result for the requesting principal (the ACL-evaluation engine, M3
 *   sub-task 3).
 * - `DAV:acl` — the resource's full, direct-plus-inherited ACE list
 *   (`collectWebDavAces`, M3 sub-task 3), each `<D:ace>` marked
 *   `<D:protected/>`/`<D:inherited>` as appropriate.
 * - `DAV:principal-collection-set` — `/dav/{tenant}/principals/`
 *   (RFC 3744 §5.8).
 * - `DAV:current-user-principal` — the requesting principal's own URL
 *   (RFC 5397). Every DAV route already requires Basic Auth, so the
 *   requester is always an authenticated `Principal` by the time this
 *   runs — `<D:unauthenticated/>` is a real RFC 5397 option this
 *   provider never needs to produce.
 *
 * **Deliberately not implemented** (RFC 3744, both optional): `DAV:group`
 * (DavNode has no concept of a resource's "primary group") and
 * `DAV:acl-restrictions`/`DAV:inherited-acl-set` (no ACL restrictions or
 * externally-inherited ACLs to describe beyond what `DAV:acl` already
 * reports).
 */
export class AclPropertiesProvider implements PropertyProvider {
  /** See {@link PropertyProvider.listLiveProperties}. */
  async listLiveProperties(
    resource: WebDavResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    const { tenant, principal, manager } = context;

    const [ownerRef, currentUserPrivileges, aces] = await Promise.all([
      resolvePrincipalRef(manager, tenant, resource.ownerPrincipalId),
      getCurrentUserPrivilegeSet(manager, principal, resource),
      collectWebDavAces(manager, resource),
    ]);
    const aclValue = await buildAclValue(manager, tenant, aces);

    return [
      property('owner', principalRefValue(ownerRef)),
      property('supported-privilege-set', SUPPORTED_PRIVILEGE_SET_VALUE),
      property(
        'current-user-privilege-set',
        buildPrivilegeListValue(currentUserPrivileges),
      ),
      property('acl', aclValue),
      property(
        'principal-collection-set',
        hrefValue(`/dav/${tenant.slug}/principals/`),
      ),
      property(
        'current-user-principal',
        hrefValue(toPrincipalUrl(principal, tenant)),
      ),
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && ACL_PROPERTY_NAMES.has(name);
  }
}
