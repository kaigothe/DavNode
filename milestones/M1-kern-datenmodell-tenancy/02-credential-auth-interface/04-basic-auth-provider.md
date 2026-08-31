# Sub-Task: Basic-Auth-Provider

## Kontext
Erster konkreter Auth-Provider, wie in
[planning/02-roadmap.md](../../../planning/02-roadmap.md) für M1
vorgesehen. Nutzt das Interface aus
[Auth-Provider-Interface](03-auth-provider-interface.md) und das Utility
aus [Password-Hashing-Utility](02-password-hashing-utility.md).

## Aufgabe
- `packages/core/src/auth/basic-auth-provider.ts`: Implementierung des
  Auth-Provider-Interface mit `type = 'basic'`
- `verify({ tenantSlug, username, password })`: lädt den `User` anhand
  `(tenant_id, username)` (Tenant zuerst über `slug` auflösen), lädt
  dessen `Credential` vom Typ `basic`, prüft das Passwort über
  `verifyPassword`, gibt bei Erfolg den zugehörigen `Principal` zurück,
  sonst `null`
- **Timing-sichere Rückgabe**: auch wenn der User nicht existiert, soll
  intern trotzdem eine Hash-Verifikation gegen einen Dummy-Hash laufen
  (verhindert Timing-Angriffe, die zwischen "User existiert nicht" und
  "Passwort falsch" unterscheiden könnten)
- Provider bei der Registry aus Sub-Task 3 registrieren
- Vitest-Tests: korrekte Credentials → Principal, falsches Passwort →
  `null`, unbekannter User → `null`, unbekannter Tenant → `null`

## Akzeptanzkriterien
- [ ] Alle vier Testfälle (korrekt / falsches PW / unbekannter User /
      unbekannter Tenant) sind abgedeckt und grün
- [ ] Verifikationszeit für "unbekannter User" und "falsches Passwort"
      unterscheidet sich nicht signifikant (Timing-Schutz greift)
- [ ] Kein direkter DB-Zugriff außerhalb der Repository-Schicht (siehe
      [Repository-/Service-Layer](../04-repository-service-layer/00-overview.md)
      — falls diese Große Aufgabe noch nicht existiert, hier zunächst
      direkt über TypeORM-Repository arbeiten und in Große Aufgabe 4
      nachziehen)

## Referenzen
- [planning/02-roadmap.md](../../../planning/02-roadmap.md) — M1
