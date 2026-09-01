import type { DataSource } from 'typeorm';
import { CollectionProperty } from '../../entities/collection-property.entity.js';
import { FileProperty } from '../../entities/file-property.entity.js';
import type { PropertyValue } from './property-provider.interface.js';

/**
 * Reads dead properties (RFC 4918) — arbitrary client-set values stored
 * verbatim in the `collection_properties`/`file_properties` tables,
 * rather than derived from a resource's own columns like
 * `WebDavLiveProperties` does — for PROPFIND. Writing them (PROPPATCH,
 * `milestones/M2-webdav-core/05-proppatch`) is added when that
 * milestone needs it.
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
}
