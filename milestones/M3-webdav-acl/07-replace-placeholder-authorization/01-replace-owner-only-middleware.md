# Sub-Task: Owner-Only-Middleware ersetzen

## Kontext
Ersetzt
[M2s Platzhalter-Autorisierung](../../M2-webdav-core/02-express-server-bootstrap/04-placeholder-authorization-and-error-handling.md)
durch echte Aufrufe der
[ACL-Evaluation-Engine](../03-acl-evaluation-engine/00-overview.md).
RFC 3744 §7 definiert, welches Privilege welche WebDAV-Methode
voraussetzt — das ist der Kern dieser Aufgabe.

## Aufgabe
- `packages/server/src/http/acl-authorization.middleware.ts` ersetzt
  `owner-only-authorization.middleware.ts` (Datei entfernen, nicht nur
  deaktivieren)
- Privilege-Zuordnung je Methode (ruft `hasPrivilege` mit dem jeweils
  passenden Privilege auf der jeweils passenden Ressource auf):
  | Methode | Geprüftes Privilege | Geprüfte Ressource |
  |---|---|---|
  | PROPFIND, GET | `read` | Zielressource |
  | PROPPATCH | `write-properties` | Zielressource |
  | PUT (Überschreiben) | `write-content` | Zielressource |
  | PUT (Neuanlage), MKCOL, COPY (Ziel) | `bind` | Eltern-Collection des Ziels |
  | DELETE, MOVE (Quelle) | `unbind` | Eltern-Collection der Quelle |
  | MOVE (Ziel) | `bind` | Eltern-Collection des Ziels |
  | COPY (Quelle) | `read` | Quellressource |
  | ACL | `write-acl` | Zielressource (bereits in
    [ACL-Method-Handler](../../04-acl-http-method/01-acl-method-handler.md)
    umgesetzt, hier nur konsistent referenziert) |
- Fehlende Berechtigung → `403 Forbidden`
- Alle M2-Routen (PROPFIND, PROPPATCH, MKCOL, GET, PUT, DELETE, COPY,
  MOVE) werden auf die neue Middleware umgestellt

## Akzeptanzkriterien
- [ ] Alle bestehenden M2-Tests (aus
      [milestones/M2-webdav-core](../../M2-webdav-core/00-setting-goal.md))
      laufen weiterhin grün, jetzt gegen die echte ACL-Engine statt der
      Owner-Platzhalter-Regel
- [ ] Ein Nutzer mit einer expliziten `grant`-ACE für `read` (aber nicht
      `write-content`) kann eine fremde Datei per GET lesen, aber nicht
      per PUT überschreiben (`403`)
- [ ] Ein Nutzer mit `bind` auf einer fremden Collection kann darin neue
      Dateien anlegen, aber nicht bestehende fremde Dateien in dieser
      Collection überschreiben (unterschiedliche Privileges greifen
      korrekt getrennt)
- [ ] `owner-only-authorization.middleware.ts` aus M2 existiert nicht
      mehr im Code (vollständig ersetzt, kein Dead Code)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744 §7
