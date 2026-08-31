# Sub-Task: Privilege-Katalog

## Kontext
Der Privilege-Katalog aus
[planning/05-data-model.md](../../../planning/05-data-model.md)
(Abschnitt "ACL-Privilege-Katalog"): ein gemeinsames Vokabular über alle
ACE-Tabellen hinweg, mit Aggregation, die zur Auswertungszeit (nicht in
der DB) aufgelöst wird.

## Aufgabe
- `packages/core/src/acl/privilege.ts`: TypeScript-Enum/Union-Typ mit
  den Werten `read`, `write`, `write-properties`, `write-content`,
  `bind`, `unbind`, `unlock`, `read-acl`, `write-acl`,
  `read-current-user-privilege-set`, `all`
- `packages/core/src/acl/privilege-aggregation.ts`: Funktion
  `expandPrivilege(privilege): Privilege[]`, die ein aggregiertes
  Privilege in seine Bestandteile auflöst:
  - `all` → alle elf Werte
  - `write` → `write-properties`, `write-content`
  - alle anderen → nur sich selbst
- Kehrfunktion `privilegeSatisfies(granted: Privilege, requested: Privilege): boolean`
  — prüft, ob eine gewährte (aggregierte) Privilege eine angefragte
  (ggf. elementare) Privilege abdeckt (z.B. `privilegeSatisfies('all', 'read')`
  → `true`)
- Tests für alle Aggregationsfälle aus
  [planning/05-data-model.md](../../../planning/05-data-model.md)

## Akzeptanzkriterien
- [ ] `expandPrivilege('all')` enthält alle elf Werte, keine Duplikate
- [ ] `expandPrivilege('write')` enthält genau `write-properties` und
      `write-content`
- [ ] `privilegeSatisfies('write', 'write-content')` → `true`,
      `privilegeSatisfies('write-content', 'write-properties')` → `false`
- [ ] Alle elementaren (nicht-aggregierten) Privileges befriedigen nur
      sich selbst

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — ACL-Privilege-Katalog
