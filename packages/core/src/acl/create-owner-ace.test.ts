import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource } from '../db/data-source.js';
import {
  ALL_ENTITIES,
  Collection,
  CollectionAce,
  FileAce,
  FileResource,
  Principal,
  Tenant,
} from '../entities/index.js';
import { ALL_MIGRATIONS } from '../migrations/sqlite/index.js';
import { createOwnerAllAce } from './create-owner-ace.js';

describe('createOwnerAllAce', () => {
  let dataSource: DataSource;
  let collection: Collection;
  let file: FileResource;
  let ownerPrincipal: Principal;

  beforeEach(async () => {
    dataSource = createDataSource(
      {},
      { entities: ALL_ENTITIES, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();
    await dataSource.runMigrations();

    const tenant = await dataSource
      .getRepository(Tenant)
      .save(
        dataSource
          .getRepository(Tenant)
          .create({ slug: 'acme', name: 'Acme Inc.' }),
      );
    ownerPrincipal = await dataSource
      .getRepository(Principal)
      .save(
        dataSource
          .getRepository(Principal)
          .create({ tenantId: tenant.id, kind: 'user', specialKind: null }),
      );
    collection = await dataSource.getRepository(Collection).save(
      dataSource.getRepository(Collection).create({
        tenantId: tenant.id,
        parentCollectionId: null,
        ownerPrincipalId: ownerPrincipal.id,
        displayName: 'Root',
      }),
    );
    file = await dataSource.getRepository(FileResource).save(
      dataSource.getRepository(FileResource).create({
        tenantId: tenant.id,
        collectionId: collection.id,
        name: 'doc.txt',
        contentType: 'text/plain',
        etag: 'etag-1',
        sizeBytes: 5,
        ownerPrincipalId: ownerPrincipal.id,
      }),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('creates exactly one protected all/grant ACE for a collection', async () => {
    await dataSource.transaction(async (manager) => {
      await createOwnerAllAce(
        manager,
        'collection',
        collection.id,
        ownerPrincipal.id,
      );
    });

    const aces = await dataSource
      .getRepository(CollectionAce)
      .findBy({ collectionId: collection.id });
    expect(aces).toEqual([
      expect.objectContaining({
        principalId: ownerPrincipal.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    ]);
  });

  it('creates exactly one protected all/grant ACE for a file', async () => {
    await dataSource.transaction(async (manager) => {
      await createOwnerAllAce(manager, 'file', file.id, ownerPrincipal.id);
    });

    const aces = await dataSource
      .getRepository(FileAce)
      .findBy({ fileResourceId: file.id });
    expect(aces).toEqual([
      expect.objectContaining({
        principalId: ownerPrincipal.id,
        privilege: 'all',
        grantDeny: 'grant',
        protected: true,
        position: 0,
      }),
    ]);
  });

  // A "protected" ACE is only meaningful once something can attempt to
  // remove it — the ACL HTTP method (milestones/M3-webdav-acl/04-acl-http-method)
  // isn't built yet, so actual removal-rejection is exercised there, not
  // here. This is the reference point that criterion depends on: the flag
  // itself is set correctly on creation.
  it('marks the created ACE as protected, the flag the ACL method will check before allowing removal', async () => {
    await dataSource.transaction(async (manager) => {
      await createOwnerAllAce(
        manager,
        'collection',
        collection.id,
        ownerPrincipal.id,
      );
    });

    const ace = await dataSource
      .getRepository(CollectionAce)
      .findOneByOrFail({ collectionId: collection.id });
    expect(ace.protected).toBe(true);
  });
});
