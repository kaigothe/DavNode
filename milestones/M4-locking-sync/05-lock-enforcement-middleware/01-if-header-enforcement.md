# Sub-Task: If-Header-Enforcement

## Kontext
RFC 4918 §10.4: mutierende Methoden auf gesperrte Ressourcen benötigen
den passenden Lock-Token im `If`-Header. Wird zwischen die
ACL-Autorisierung aus M3 und die eigentlichen Route-Handler in
`packages/server/src/app.ts` eingehängt (siehe
[00-setting-goal.md](../00-setting-goal.md)) — **keine** Änderung an den
M2/M3-Routen-Dateien selbst nötig.

## Aufgabe
- `packages/server/src/http/lock-enforcement.middleware.ts`: parst den
  `If`-Header **nur** für Lock-Token-Referenzen (Syntax
  `(<urn:uuid:...>)`, optional `(Not <urn:uuid:...>)`) — die
  ETag-Kombinationsmöglichkeit desselben Headers wird **nicht**
  unterstützt (ETag-Conditionals laufen separat über `If-Match`/
  `If-None-Match`, siehe M2); bewusste Scope-Einschränkung, im Code
  kommentiert
- Prüft je nach Methode die **relevanten** Ressourcen (nicht nur die
  Zielressource) über `getEffectiveLocks` +
  [hasValidLockToken](../02-lock-evaluation/01-collect-locks-and-conflict-check.md):

  | Methode | Zu prüfende Ressource(n) |
  |---|---|
  | MKCOL, PUT (Neuanlage) | Eltern-Collection (neues Mitglied) |
  | PUT (Überschreiben), PROPPATCH | Zielressource |
  | DELETE | Zielressource **und** deren Eltern-Collection |
  | MOVE | Quellressource, Eltern-Collection der Quelle, Eltern-Collection des Ziels |
  | COPY | nur Ziel-Eltern-Collection, und **nur falls** ein bestehendes Ziel überschrieben wird |

- Fehlt für eine der geprüften Ressourcen ein gültiger Token trotz
  wirksamem Lock → `423 Locked`
- Läuft **nach** der ACL-Autorisierung (M3): ein Nutzer ohne
  Schreibrecht bekommt weiterhin `403`, nicht `423` (Rechte-Fehler geht
  vor Lock-Fehler)

## Akzeptanzkriterien
- [ ] PUT (Überschreiben) einer gesperrten Datei ohne `If`-Header
      liefert `423`
- [ ] PUT (Überschreiben) mit korrektem Lock-Token im `If`-Header
      gelingt
- [ ] MKCOL in einer mit `Depth: infinity` gesperrten Collection ohne
      Token liefert `423`
- [ ] DELETE einer ungesperrten Datei in einer **gesperrten**
      Eltern-Collection (`Depth: infinity`) liefert ohne Token `423`
- [ ] Ein Nutzer ohne `write-content` auf einer gesperrten Ressource
      bekommt `403` (nicht `423`), unabhängig vom `If`-Header

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918 §10.4
