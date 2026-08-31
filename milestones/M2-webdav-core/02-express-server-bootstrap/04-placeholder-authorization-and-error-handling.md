# Sub-Task: Platzhalter-Autorisierung & Error-Handling

## Kontext
M2 hat noch keine ACL-Engine (die kommt in M3). Trotzdem darf nicht
jeder authentifizierte Nutzer auf jede Ressource jedes anderen Nutzers
zugreifen — siehe Hinweis in
[00-setting-goal.md](../00-setting-goal.md). Diese Aufgabe baut die
Übergangsregel plus einheitliches Error-Handling für alle WebDAV-Routen.

## Aufgabe
- `packages/server/src/http/owner-only-authorization.middleware.ts`:
  lädt die Ziel-Ressource (Collection oder FileResource, je nach Route)
  und prüft `resource.ownerPrincipalId === req.principal.id`; bei
  Ungleichheit `403 Forbidden`
- Für **neue** Ressourcen (MKCOL/PUT auf einen noch nicht existierenden
  Pfad) wird stattdessen die **Eltern-Collection** geprüft (wer die
  Elterncollection besitzt, darf darin neue Kinder anlegen)
- Deutlich als **Platzhalter** markiert (Code-Kommentar + Verweis auf
  M3), damit beim Bau der echten ACL-Engine (M3) klar ist, welcher Code
  ersetzt wird
- Zentrales Error-Handling-Middleware (`packages/server/src/http/error-handler.middleware.ts`):
  fängt unbehandelte Fehler ab, mappt bekannte Fehlertypen (z.B.
  "Resource not found", "Conflict") auf die korrekten WebDAV-
  Statuscodes (404, 409, 500 als Fallback), liefert **keine**
  Stacktraces an den Client (nur ins Server-Log)

## Akzeptanzkriterien
- [ ] Nutzer A kann nicht auf eine Ressource von Nutzer B zugreifen
      (`403`, Test mit zwei Usern im selben Tenant)
- [ ] Nutzer A kann in seiner eigenen Collection neue Ressourcen anlegen
- [ ] Ein absichtlich ausgelöster, unerwarteter Fehler (z.B. simulierter
      DB-Fehler) führt zu `500` ohne Stacktrace im Response-Body, aber
      mit vollständigem Stacktrace im Server-Log

## Referenzen
- [planning/02-roadmap.md](../../../planning/02-roadmap.md) — M2/M3-Abgrenzung
