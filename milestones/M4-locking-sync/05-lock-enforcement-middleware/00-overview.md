# Große Aufgabe: Lock-Enforcement-Middleware

## Ziel
Mutierende WebDAV-Methoden (aus M2/M3) respektieren bestehende Locks:
ohne den passenden Lock-Token im `If`-Header wird eine gesperrte
Ressource nicht verändert.

## Sub-Tasks
1. [If-Header-Enforcement](01-if-header-enforcement.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918 §10.4
