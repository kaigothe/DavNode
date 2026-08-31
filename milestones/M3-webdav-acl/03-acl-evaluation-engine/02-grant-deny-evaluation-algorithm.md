# Sub-Task: Grant/Deny-Auswertungsalgorithmus

## Kontext
Kernstück der ACL-Engine. Nutzt die geordnete ACE-Liste aus
[ACE-Sammlung mit Vererbung](01-ace-collection-with-inheritance.md), den
[Privilege-Katalog](../01-ace-entities-and-privileges/02-privilege-catalog.md)
und [resolveGroupsForPrincipal](../02-group-membership-reverse-lookup/01-resolve-groups-for-principal.md).

## Aufgabe
- `packages/core/src/acl/evaluate-privilege.ts`: Funktion
  `hasPrivilege(principal, resource, requestedPrivilege): Promise<boolean>`
  mit folgendem Algorithmus (RFC 3744 §5.4, first-match-wins über die
  geordnete ACE-Liste):
  1. ACE-Liste holen (direkt vor geerbt, siehe Sub-Task 1)
  2. Principal-Matching-Set aufbauen: der Principal selbst, alle
     Gruppen aus `resolveGroupsForPrincipal`, sowie zutreffende
     Sonder-Principals (`DAV:authenticated` — immer, da der Request
     bereits durch die Basic-Auth-Middleware authentifiziert wurde;
     `DAV:all` — immer; `DAV:owner` — nur wenn
     `resource.ownerPrincipalId === principal.id`)
  3. Für jede ACE in Listen-Reihenfolge: prüft, ob
     `ace.principalId` im Matching-Set enthalten ist **und** ob
     `privilegeSatisfies(ace.privilege, requestedPrivilege)` — beim
     ersten Treffer: `grantDeny === 'grant'` → `true` zurückgeben,
     `grantDeny === 'deny'` → `false` zurückgeben, Auswertung stoppt
     sofort (kein Weiterlesen der restlichen Liste)
  4. Keine passende ACE gefunden → `false` (default-deny)
- Zusätzliche Funktion `getCurrentUserPrivilegeSet(principal, resource): Promise<Privilege[]>`
  (für die `current-user-privilege-set`-Property, siehe
  [ACL-Properties](../../05-acl-properties/00-overview.md)): wertet
  **alle** elementaren Privileges aus dem Katalog aus und gibt die
  Liste der erlaubten zurück (Effizienz: eine ACE-Sammlung, mehrfache
  Auswertung statt mehrfaches Neuladen)

## Akzeptanzkriterien
- [ ] Eine `grant`-ACE für den Principal direkt erlaubt den Zugriff
- [ ] Eine `deny`-ACE, die **vor** einer passenden `grant`-ACE in der
      Reihenfolge steht, gewinnt (Test mit bewusst widersprüchlichen
      ACEs in definierter Reihenfolge)
- [ ] Eine `grant`-ACE für eine Gruppe erlaubt den Zugriff für jedes
      (auch transitive) Mitglied dieser Gruppe
- [ ] `DAV:owner`-ACEs greifen nur für den tatsächlichen Eigentümer,
      nicht für andere Nutzer
- [ ] Keine passende ACE → `false` (Default-Deny-Test)
- [ ] `getCurrentUserPrivilegeSet` liefert für die Default-Owner-ACE
      (`all`) alle elf Privileges

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744
