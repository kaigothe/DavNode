import { createDataSource } from './data-source.js';

/**
 * DataSource instance used by the TypeORM CLI (`migration:generate`,
 * `migration:run`, `migration:revert`), configured from `process.env`.
 * Application code should use {@link createDataSource} instead, which
 * doesn't implicitly depend on the global environment.
 */
export default createDataSource();
