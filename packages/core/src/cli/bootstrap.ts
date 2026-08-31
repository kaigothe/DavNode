import { pathToFileURL } from 'node:url';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../db/data-source.js';
import { Collection } from '../entities/collection.entity.js';
import type { Tenant } from '../entities/tenant.entity.js';
import type { User } from '../entities/user.entity.js';
import { DuplicateEntryError } from '../services/errors.js';
import { TenantService } from '../services/tenant.service.js';
import { UserService } from '../services/user.service.js';

/** Parsed command-line arguments for the bootstrap script. */
export interface BootstrapArgs {
  tenantSlug: string;
  tenantName: string;
  username: string;
  email: string;
  password: string;
}

const REQUIRED_ARG_KEYS = [
  'tenant-slug',
  'tenant-name',
  'username',
  'email',
  'password',
] as const;

/**
 * Parses `--key=value` command-line arguments into {@link BootstrapArgs}.
 * A small, fixed set of required flags is all this script needs, so
 * simple hand-rolled parsing is enough — no argument-parsing library.
 *
 * @throws An `Error` whose message is always safe to print (it never
 * echoes back an argument's value, so a malformed `--password=...` flag
 * can't end up in a log line) if an argument isn't in `--key=value` form,
 * or a required argument is missing.
 */
export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  const raw: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-z0-9-]+)=(.*)$/.exec(arg);
    if (!match) {
      const [flagName] = arg.split('=');
      throw new Error(`Invalid argument "${flagName}". Expected --key=value.`);
    }
    const [, key, value] = match;
    raw[key] = value;
  }

  const missing = REQUIRED_ARG_KEYS.filter((key) => raw[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required argument(s): ${missing.map((key) => `--${key}`).join(', ')}.`,
    );
  }

  return {
    tenantSlug: raw['tenant-slug'],
    tenantName: raw['tenant-name'],
    username: raw.username,
    email: raw.email,
    password: raw.password,
  };
}

/** The tenant, user, and root collection created by a successful {@link runBootstrap} call. */
export interface BootstrapResult {
  tenant: Tenant;
  user: User;
  rootCollection: Collection;
}

/**
 * Creates the tenant (with its per-tenant special principals), its first
 * user — with `role: 'server_admin'`, since there's no admin API yet
 * (that's M9) to promote a user afterward — and that tenant's WebDAV root
 * collection (owned by the new user), so there's something to
 * PROPFIND/MKCOL/PUT against at `/dav/{tenant}/files/` right away.
 * Exported separately from `main` so it can be exercised directly against
 * a test `DataSource`, without going through argv parsing or process exit
 * handling.
 *
 * The root collection is created last, after the tenant and user both
 * exist: a duplicate `args.tenantSlug` is caught at the tenant-creation
 * step, before this ever runs, so a repeated bootstrap attempt can never
 * reach — and therefore never duplicate — this step.
 *
 * @throws {@link DuplicateEntryError} If `args.tenantSlug` (or, far less
 * likely on a fresh tenant, `args.username`) is already in use — `main`
 * turns this into a clear CLI message instead of a raw stack trace.
 */
export async function runBootstrap(
  dataSource: DataSource,
  args: BootstrapArgs,
): Promise<BootstrapResult> {
  const tenant = await new TenantService(dataSource).createTenant({
    slug: args.tenantSlug,
    name: args.tenantName,
  });

  const user = await new UserService(dataSource).createUser({
    tenantId: tenant.id,
    username: args.username,
    email: args.email,
    password: args.password,
    role: 'server_admin',
  });

  const collectionRepository = dataSource.getRepository(Collection);
  const rootCollection = await collectionRepository.save(
    collectionRepository.create({
      tenantId: tenant.id,
      parentCollectionId: null,
      ownerPrincipalId: user.principalId,
      displayName: tenant.name,
    }),
  );

  return { tenant, user, rootCollection };
}

async function main(): Promise<void> {
  let args: BootstrapArgs;
  try {
    args = parseBootstrapArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const { tenant, user, rootCollection } = await runBootstrap(
      dataSource,
      args,
    );
    console.log(
      `Bootstrap complete: tenant "${tenant.slug}" (${tenant.id}), admin user "${user.username}" (${user.id}), root collection (${rootCollection.id}).`,
    );
  } catch (error) {
    if (error instanceof DuplicateEntryError) {
      console.error(`Bootstrap aborted: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

// Only run when this file is executed directly (`node dist/cli/bootstrap.js`),
// not when it's imported — e.g. by tests exercising runBootstrap/parseBootstrapArgs.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error('Bootstrap failed:', error);
    process.exitCode = 1;
  });
}
