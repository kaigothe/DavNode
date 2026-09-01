import type { EntityManager } from 'typeorm';
import { CollectionAce } from '../entities/collection-ace.entity.js';
import { FileAce } from '../entities/file-ace.entity.js';

/** Which ACE table {@link createOwnerAllAce} inserts its row into. */
export type OwnerAceResourceType = 'collection' | 'file';

/**
 * Creates the default-owner ACE every newly created `Collection`/
 * `FileResource` needs: a `protected = true` row granting `DAV:all` to
 * `ownerPrincipalId`, at `position = 0` (always evaluated first).
 *
 * RFC 3744 is default-deny (see milestones/M3-webdav-acl/00-setting-goal.md,
 * Runde 19) — without this, a freshly created resource would be
 * inaccessible even to its own owner. Every resource-creation code path
 * (root-collection bootstrap, MKCOL, PUT on new-resource creation, COPY)
 * must call this in the *same transaction* as the resource's own row
 * insert, so the two either both commit or both roll back together.
 * `protected = true` marks the row so the `ACL` HTTP method
 * (milestones/M3-webdav-acl/04-acl-http-method) refuses to remove it —
 * enforced there, not by this function.
 *
 * @param manager - The same `EntityManager` the resource's own creation
 * is using.
 * @param resourceType - Whether `resourceId` names a `Collection` or a
 * `FileResource` — selects `collection_aces` vs. `file_aces`.
 * @param resourceId - Id of the newly created resource.
 * @param ownerPrincipalId - Id of the principal granted `DAV:all`.
 */
export async function createOwnerAllAce(
  manager: EntityManager,
  resourceType: OwnerAceResourceType,
  resourceId: string,
  ownerPrincipalId: string,
): Promise<void> {
  if (resourceType === 'collection') {
    const aces = manager.getRepository(CollectionAce);
    await aces.save(
      aces.create({
        collectionId: resourceId,
        principalId: ownerPrincipalId,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    );
    return;
  }

  const aces = manager.getRepository(FileAce);
  await aces.save(
    aces.create({
      fileResourceId: resourceId,
      principalId: ownerPrincipalId,
      privilege: 'all',
      grantDeny: 'grant',
      protected: true,
      position: 0,
    }),
  );
}
