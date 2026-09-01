import type { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { Collection } from '../../entities/collection.entity.js';
import { CollectionProperty } from '../../entities/collection-property.entity.js';
import { FileProperty } from '../../entities/file-property.entity.js';
import type { ProppatchOperation } from '../xml/request-parser.js';
import type { PropertyValue } from './property-provider.interface.js';
import type { WebDavTreeResource } from '../resource-path-resolver.js';

/**
 * Applies one `set`/`remove` operation to a dead-property table, scoped
 * by `resourceScope` (its owning collection/file resource id). Shared
 * by {@link DeadPropertyService.applyOperations}'s two entity types,
 * which are identical in shape apart from that scoping column's name.
 */
async function applyOperation<
  T extends { namespace: string; name: string; value: string },
>(
  repository: Repository<T>,
  resourceScope: Partial<T>,
  operation: ProppatchOperation,
): Promise<void> {
  const where = {
    ...resourceScope,
    namespace: operation.property.namespace,
    name: operation.property.name,
  } as FindOptionsWhere<T>;
  const existing = await repository.findOneBy(where);

  if (operation.kind === 'remove') {
    // Removing a property that was never set isn't an error (RFC 4918
    // §9.2: PROPPATCH remove is idempotent) — reported as success by
    // the caller regardless.
    if (existing) {
      await repository.remove(existing);
    }
    return;
  }

  if (existing) {
    existing.value = operation.value;
    await repository.save(existing);
  } else {
    await repository.save(
      repository.create({ ...where, value: operation.value } as T),
    );
  }
}

/**
 * Reads and writes dead properties (RFC 4918) — arbitrary client-set
 * values stored verbatim in the `collection_properties`/
 * `file_properties` tables, rather than derived from a resource's own
 * columns like `WebDavLiveProperties` does.
 */
export class DeadPropertyService {
  constructor(private readonly dataSource: DataSource) {}

  /** Every dead property set on the collection identified by `collectionId`. */
  async listForCollection(collectionId: string): Promise<PropertyValue[]> {
    const rows = await this.dataSource
      .getRepository(CollectionProperty)
      .findBy({
        collectionId,
      });
    return rows.map((row) => ({
      namespace: row.namespace,
      name: row.name,
      value: row.value,
    }));
  }

  /** Every dead property set on the file resource identified by `fileResourceId`. */
  async listForFileResource(fileResourceId: string): Promise<PropertyValue[]> {
    const rows = await this.dataSource.getRepository(FileProperty).findBy({
      fileResourceId,
    });
    return rows.map((row) => ({
      namespace: row.namespace,
      name: row.name,
      value: row.value,
    }));
  }

  /**
   * Applies every `set`/`remove` operation to `resource` in a single
   * transaction: RFC 4918 §9.2 requires all of a PROPPATCH request's
   * operations to succeed or none to — see
   * `milestones/M2-webdav-core/05-proppatch`. Assumes every operation
   * has already been checked against `isLiveProperty` by the caller;
   * this method has no live-property awareness of its own and applies
   * whatever it's given.
   *
   * A `set` on an already-set property overwrites its value in place
   * (no duplicate row — `(resourceId, namespace, name)` stays unique).
   * A `remove` of a property that was never set is not an error.
   */
  async applyOperations(
    resource: WebDavTreeResource,
    operations: readonly ProppatchOperation[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (resource instanceof Collection) {
        const repository = manager.getRepository(CollectionProperty);
        for (const operation of operations) {
          await applyOperation(
            repository,
            { collectionId: resource.id },
            operation,
          );
        }
      } else {
        const repository = manager.getRepository(FileProperty);
        for (const operation of operations) {
          await applyOperation(
            repository,
            { fileResourceId: resource.id },
            operation,
          );
        }
      }
    });
  }
}
