# Große Aufgabe: Credential-Entity & Auth-Provider-Interface

## Ziel
`@davnode/core` kann Nutzer-Credentials speichern (zunächst nur Basic
Auth) und über ein pluggables Provider-Interface verifizieren — komplett
ohne HTTP-Bezug (die HTTP-seitige Auth-Mechanik gehört zu `server`,
M2+).

## Sub-Tasks
1. [Credential-Entity](01-credential-entity.md)
2. [Password-Hashing-Utility](02-password-hashing-utility.md)
3. [Auth-Provider-Interface](03-auth-provider-interface.md)
4. [Basic-Auth-Provider](04-basic-auth-provider.md)

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md) — Auth-Schnittstellen-Split
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 2 (pluggable Auth), Runde 12 (Digest-Hinweis, hier nicht relevant)
