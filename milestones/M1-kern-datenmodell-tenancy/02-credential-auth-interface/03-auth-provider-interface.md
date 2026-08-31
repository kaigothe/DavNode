# Sub-Task: Auth-Provider-Interface

## Kontext
Pluggable-Auth-Architektur: `core` definiert das Provider-Interface
unabhängig von HTTP, `server` implementiert später die HTTP-Mechanik
(Header-Parsing, `WWW-Authenticate`) und ruft in dieses Interface hinein
— siehe [planning/04-architecture.md](../../../planning/04-architecture.md),
Abschnitt "Auth-Schnittstellen-Split".

## Aufgabe
- `packages/core/src/auth/auth-provider.interface.ts` mit einem
  TypeScript-Interface, z.B.:
  - `type` (String-Identifier des Providers, z.B. `'basic'`)
  - `verify(input: unknown): Promise<Principal | null>` — nimmt
    provider-spezifische Credentials entgegen (bei Basic:
    `{ username, password }`), liefert den zugehörigen User-Principal
    oder `null` bei ungültigen Credentials
- Ein einfaches Registry-/Lookup-Modul
  (`packages/core/src/auth/auth-provider-registry.ts`), das Provider
  nach `type` registriert und auflöst — so können `server` (M2) und
  spätere Provider (M10) sich eintragen, ohne `core` zu ändern
- Explizit **kein** HTTP-Code in diesem Modul (kein Express-Import, kein
  Header-Parsing)

## Akzeptanzkriterien
- [ ] Interface und Registry sind ohne jede HTTP-Abhängigkeit kompilierbar
      (Grep-Check: kein `express`-Import in `packages/core/src/auth/`)
- [ ] Ein Dummy-Provider lässt sich registrieren und per `type` wieder
      auflösen (Test)

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md)
