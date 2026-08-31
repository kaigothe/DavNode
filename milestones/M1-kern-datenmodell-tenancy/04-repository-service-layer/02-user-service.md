# Sub-Task: UserService

## Kontext
Nutzt [TenantService](01-tenant-service.md) (Tenant muss existieren) und
das [Password-Hashing-Utility](../02-credential-auth-interface/02-password-hashing-utility.md).

## Aufgabe
- `packages/core/src/services/user.service.ts` mit:
  - `createUser({ tenantId, username, email, password }): Promise<User>`
    — legt in einer Transaktion an: `Principal` (`kind: 'user'`), `User`
    (verweist auf den Principal), `Credential` (`type: 'basic'`, Hash
    über `hashPassword`)
  - `findUserByUsername(tenantId, username): Promise<User | null>`
  - `updateUserQuota(userId, { quotaLimitBytes }): Promise<User>`
- Validierung: `username` innerhalb des Tenants eindeutig (nutzt den
  Unique-Index aus der [User-Entity](../01-core-entities/03-user-entity.md),
  aber mit klarer Fehlermeldung statt roher DB-Exception)

## Akzeptanzkriterien
- [ ] `createUser` legt Principal + User + Credential konsistent in
      einer Transaktion an (Rollback-Test bei simuliertem Fehler)
- [ ] Doppelter `username` im selben Tenant wird mit einem sprechenden
      Fehler abgelehnt
- [ ] Passwort landet ausschließlich gehasht in der DB (Test liest die
      `credentials`-Zeile und prüft, dass sie nicht dem Klartext
      entspricht)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
