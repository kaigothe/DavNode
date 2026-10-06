import type { Principal, Tenant } from '@davnode/core';

/**
 * Duplicates `packages/server/src/http/express.d.ts`'s `req.tenant`/
 * `req.principal` augmentation (not the `IRouter.acl`/`.mkcalendar`
 * part, which only the DAV layer needs). `admin-api` can't import it
 * from `server` — planning/04-architecture.md: "`server` und `admin-api`
 * hängen von `core` ab, nicht umgekehrt" — and the augmentation itself
 * can't move into `core` either, since `core` has no Express/HTTP
 * dependency at all by design. This router's own contract (`router.ts`)
 * is that `server` has already set both fields via the same
 * tenant-resolution/Basic-Auth middleware instances the DAV routes use,
 * before ever reaching this package's code.
 */
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      principal?: Principal;
    }
  }
}
