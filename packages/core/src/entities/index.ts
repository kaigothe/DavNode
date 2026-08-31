import { Tenant } from './tenant.entity.js';

export { Tenant };

/**
 * Every entity class registered in `@davnode/core`. Used to configure a
 * `DataSource` via `createDataSource`'s `schema` parameter (see
 * `DavNodeDbSchema` in `db/data-source.ts`) without relying on filesystem
 * globbing — needed wherever code runs directly against TypeScript
 * sources rather than the compiled `dist/` output, such as this package's
 * own test suite.
 */
export const ALL_ENTITIES = [Tenant];
