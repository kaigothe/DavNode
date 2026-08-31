import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database engines DavNode can connect to, selected via `DAVNODE_DB_TYPE`.
 *
 * Note: TypeORM's classic `sqlite` driver (backed by the `sqlite3`
 * package) is no longer available as of TypeORM 1.x — `better-sqlite3`
 * is the supported local/embedded engine.
 */
export type DavNodeDbType = 'postgres' | 'mysql' | 'better-sqlite3';

/**
 * The subset of environment variables read to configure the TypeORM
 * {@link DataSource}. Shaped like `process.env` so the real environment
 * can be passed directly, while tests can supply a plain object instead.
 */
export interface DavNodeDbEnv {
  DAVNODE_DB_TYPE?: string;
  DAVNODE_DB_HOST?: string;
  DAVNODE_DB_PORT?: string;
  DAVNODE_DB_NAME?: string;
  DAVNODE_DB_USER?: string;
  DAVNODE_DB_PASSWORD?: string;
  DAVNODE_DB_FILE?: string;
}

const SUPPORTED_DB_TYPES: readonly DavNodeDbType[] = [
  'postgres',
  'mysql',
  'better-sqlite3',
];

function isDavNodeDbType(value: string): value is DavNodeDbType {
  return (SUPPORTED_DB_TYPES as readonly string[]).includes(value);
}

/**
 * Builds TypeORM {@link DataSourceOptions} from environment variables.
 * Switching database engines only means changing `DAVNODE_DB_TYPE` and
 * its matching connection variables — no code changes are required.
 *
 * Entities are loaded from `src/entities/` (`dist/entities/` once built),
 * which is still empty at this stage of the project; it is populated
 * with actual entity classes starting in M1.
 *
 * @param env - Environment variables to read; defaults to `process.env`.
 * @returns Options ready to pass to `new DataSource(...)`.
 */
export function createDataSourceOptions(
  env: DavNodeDbEnv = process.env,
): DataSourceOptions {
  const rawType = env.DAVNODE_DB_TYPE ?? 'better-sqlite3';
  if (!isDavNodeDbType(rawType)) {
    throw new Error(
      `Unsupported DAVNODE_DB_TYPE "${rawType}". Expected one of: ${SUPPORTED_DB_TYPES.join(', ')}.`,
    );
  }

  const entities = [path.join(currentDir, '../entities/*.{js,ts}')];

  switch (rawType) {
    case 'postgres':
      return {
        type: 'postgres',
        host: env.DAVNODE_DB_HOST ?? 'localhost',
        port: env.DAVNODE_DB_PORT ? Number(env.DAVNODE_DB_PORT) : 5432,
        username: env.DAVNODE_DB_USER,
        password: env.DAVNODE_DB_PASSWORD,
        database: env.DAVNODE_DB_NAME,
        synchronize: false,
        entities,
      };
    case 'mysql':
      return {
        type: 'mysql',
        host: env.DAVNODE_DB_HOST ?? 'localhost',
        port: env.DAVNODE_DB_PORT ? Number(env.DAVNODE_DB_PORT) : 3306,
        username: env.DAVNODE_DB_USER,
        password: env.DAVNODE_DB_PASSWORD,
        database: env.DAVNODE_DB_NAME,
        synchronize: false,
        entities,
      };
    case 'better-sqlite3':
      return {
        type: 'better-sqlite3',
        database: env.DAVNODE_DB_FILE ?? ':memory:',
        synchronize: false,
        entities,
      };
  }
}

/**
 * Creates a new TypeORM {@link DataSource} configured from environment
 * variables. See {@link createDataSourceOptions} for the variables read
 * and how each database engine maps to them.
 *
 * @param env - Environment variables to read; defaults to `process.env`.
 * @returns An unconnected DataSource; call `.initialize()` to connect.
 */
export function createDataSource(env: DavNodeDbEnv = process.env): DataSource {
  return new DataSource(createDataSourceOptions(env));
}
