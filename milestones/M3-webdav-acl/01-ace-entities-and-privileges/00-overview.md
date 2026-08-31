# Große Aufgabe: ACE-Entities & Privilege-Katalog

## Ziel
Die WebDAV-Domäne bekommt ihre ACE-Tabellen (`collection_aces`,
`file_aces`), ein zentrales Privilege-Vokabular mit
Aggregations-Auflösung, und eine wiederverwendbare Funktion, die neu
erzeugten Ressourcen automatisch eine Default-Owner-ACE gibt (nötig
wegen des default-deny-Verhaltens von RFC 3744, siehe
[00-setting-goal.md](../00-setting-goal.md)).

## Sub-Tasks
1. [ACE-Entities](01-ace-entities.md)
2. [Privilege-Katalog](02-privilege-catalog.md)
3. [Default-Owner-ACE-Utility](03-default-owner-ace-utility.md)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — ACL-Privilege-Katalog
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 11, 12
