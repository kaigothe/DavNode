import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming-strategy.js';

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
 * Migrations are generated separately per database engine (see
 * `src/migrations/{sqlite,postgres,mysql}/`), since `migration:generate`
 * bakes driver-specific raw SQL into each migration file — a migration
 * generated against SQLite uses syntax Postgres and MySQL both reject
 * (e.g. double-quoted identifiers, which MySQL treats as string literals
 * by default). This maps a `DavNodeDbType` to its migrations directory
 * name.
 */
const MIGRATIONS_DIR_BY_DB_TYPE: Record<DavNodeDbType, string> = {
  'better-sqlite3': 'sqlite',
  postgres: 'postgres',
  mysql: 'mysql',
};

/**
 * Optional explicit entity/migration classes, overriding the default
 * filesystem-glob discovery in {@link createDataSourceOptions}.
 *
 * The default glob (`src/entities/*.entity.ts` / `dist/entities/*.entity.js`)
 * dynamically imports whatever it matches at runtime, which only works
 * for plain compiled JavaScript — a raw `.ts` file using TypeORM's
 * decorators fails that dynamic import outside of a TypeScript-aware
 * loader. Passing explicit classes here (loaded via a normal static
 * `import`, which any TypeScript toolchain already transforms) avoids
 * that entirely; this is required for this package's own test suite,
 * which runs directly against `src/`, and is also available to library
 * consumers who prefer deterministic, bundler-safe class references over
 * filesystem globbing.
 */
export interface DavNodeDbSchema {
  entities?: DataSourceOptions['entities'];
  migrations?: DataSourceOptions['migrations'];
}

/**
 * Builds TypeORM {@link DataSourceOptions} from environment variables.
 * Switching database engines only means changing `DAVNODE_DB_TYPE` and
 * its matching connection variables — no code changes are required.
 *
 * Entities are loaded from `src/entities/*.entity.ts` (`dist/entities/*.entity.js`
 * once built) — the `.entity.` suffix keeps the glob from also picking up
 * co-located `*.test.ts` files or non-entity helper modules in that
 * directory. Migrations are loaded from `src/migrations/<engine>/`
 * (`sqlite`/`postgres`/`mysql`), since each engine has its own,
 * separately-generated migration history. Pass `schema` to use explicit
 * classes instead of either glob — see {@link DavNodeDbSchema}.
 *
 * @param env - Environment variables to read; defaults to `process.env`.
 * @param schema - Explicit entity/migration classes, bypassing the default
 * filesystem glob.
 * @returns Options ready to pass to `new DataSource(...)`.
 */
export function createDataSourceOptions(
  env: DavNodeDbEnv = process.env,
  schema: DavNodeDbSchema = {},
): DataSourceOptions {
  const rawType = env.DAVNODE_DB_TYPE ?? 'better-sqlite3';
  if (!isDavNodeDbType(rawType)) {
    throw new Error(
      `Unsupported DAVNODE_DB_TYPE "${rawType}". Expected one of: ${SUPPORTED_DB_TYPES.join(', ')}.`,
    );
  }

  const entities = schema.entities ?? [
    path.join(currentDir, '../entities/*.entity.{js,ts}'),
  ];
  // Matches the `<timestamp>-<Name>.ts` naming the TypeORM CLI itself
  // generates (see the Baseline migration), which keeps the glob from
  // also picking up `migrations/<engine>/index.ts` (the ALL_MIGRATIONS
  // barrel).
  const migrations = schema.migrations ?? [
    path.join(
      currentDir,
      `../migrations/${MIGRATIONS_DIR_BY_DB_TYPE[rawType]}/[0-9]*-*.{js,ts}`,
    ),
  ];
  const namingStrategy = new SnakeNamingStrategy();

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
        migrations,
        namingStrategy,
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
        migrations,
        namingStrategy,
      };
    case 'better-sqlite3':
      return {
        type: 'better-sqlite3',
        database: env.DAVNODE_DB_FILE ?? ':memory:',
        synchronize: false,
        entities,
        migrations,
        namingStrategy,
      };
  }
}

/**
 * Creates a new TypeORM {@link DataSource} configured from environment
 * variables. See {@link createDataSourceOptions} for the variables read,
 * how each database engine maps to them, and the optional `schema`
 * parameter.
 *
 * @param env - Environment variables to read; defaults to `process.env`.
 * @param schema - Explicit entity/migration classes, bypassing the default
 * filesystem glob.
 * @returns An unconnected DataSource; call `.initialize()` to connect.
 */
export function createDataSource(
  env: DavNodeDbEnv = process.env,
  schema: DavNodeDbSchema = {},
): DataSource {
  return new DataSource(createDataSourceOptions(env, schema));
}
