# Große Aufgabe: ACL-/Lock-/Sync-Wiederverwendung

## Ziel
Die Addressbook-Domäne nutzt dieselbe ACL-Evaluation-Engine (M3),
Lock-Evaluation (M4) und Sync-Infrastruktur (M4) wie die WebDAV-Domäne —
instanziiert für die neuen Tabellen, nicht neu implementiert. Diese
Aufgabe enthält auch die in
[00-setting-goal.md](../00-setting-goal.md) angekündigten
Generizitäts-Retrofits an M4.

## Sub-Tasks
1. [ACL-Engine für Addressbücher instanziieren](01-acl-engine-instantiation.md)
2. [Lock-Evaluation genericizen & instanziieren](02-lock-evaluation-genericize.md)
3. [sync-collection für Addressbücher](03-sync-collection-for-addressbooks.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
