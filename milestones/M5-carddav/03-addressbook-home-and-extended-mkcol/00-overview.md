# Große Aufgabe: Addressbook-Home & Extended-MKCOL

## Ziel
`/dav/{tenant}/addressbooks/{userId}/` ist als virtuelle Home-Collection
PROPFIND-fähig, und Clients können darunter per Extended MKCOL (RFC
5689) neue Adressbücher anlegen — der in RFC 6352 vorgesehene Weg,
**nicht** ein separater Admin-Mechanismus.

## Sub-Tasks
1. [Addressbook-Home-Route](01-addressbook-home-route.md)
2. [Extended-MKCOL](02-extended-mkcol.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6352 §7.1.1, RFC 5689
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
