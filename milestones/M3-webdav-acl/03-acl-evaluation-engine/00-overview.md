# Große Aufgabe: ACL-Evaluation-Engine

## Ziel
Eine generische, domänen-übergreifend wiederverwendbare Engine in
`core`, die für einen gegebenen Principal, eine Ressource und ein
angefragtes Privilege entscheidet: erlaubt oder verboten. Nutzt
ACE-Vererbung (Collection → Kinder) und Gruppen-/Sonder-Principal-
Auflösung.

**Wichtig für die Wiederverwendbarkeit**: die Engine muss generisch über
den ACE-Tabellentyp arbeiten (TypeScript-Interface/Generics), damit
dieselbe Logik später für `calendar_aces`/`calendar_object_aces` (M6)
und `addressbook_aces`/`address_object_aces` (M5) wiederverwendet werden
kann, statt pro Domäne neu geschrieben zu werden — konsistent mit der in
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 11
festgehaltenen Konsequenz der Domänentrennung.

## Sub-Tasks
1. [ACE-Sammlung mit Vererbung](01-ace-collection-with-inheritance.md)
2. [Grant/Deny-Auswertungsalgorithmus](02-grant-deny-evaluation-algorithm.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 11, 12
