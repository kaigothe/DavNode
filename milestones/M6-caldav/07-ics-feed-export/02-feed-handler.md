# Sub-Task: Feed-Handler

## Kontext
`/dav/{tenant}/calendars/{userId}/{calendarId}/feed/{token}.ics` —
**kein** Basic-Auth-Prompt (Round-14-Begründung: Kalender-Abo-Clients
wie Outlook handhaben interaktive Auth-Prompts schlecht). Der Token
selbst **ist** die Authentifizierung.

## Aufgabe
- `packages/server/src/http/routes/ics-feed.route.ts`: **muss** in
  `app.ts` (M2) **vor** der
  [HTTP-Basic-Auth-Middleware](../../M2-webdav-core/02-express-server-bootstrap/03-basic-auth-http-middleware.md)
  eingehängt werden (oder explizit von ihr ausgenommen) — dieser Pfad
  ist bewusst nicht Basic-Auth-geschützt
- Lädt die `CalendarCollection` über `icsFeedToken`; kein Treffer (oder
  `icsFeedToken` ist `null`, also nie generiert) → `404` (nicht `401`
  — kein Hinweis darauf, ob der Kalender überhaupt existiert)
- Aggregiert **alle** `CalendarObject`s des Kalenders zu einem
  einzigen `VCALENDAR`-Dokument (jede Komponente aus jedem
  `CalendarObjectContent` in einen gemeinsamen Wrapper zusammengeführt)
- Antwort: `200 OK`, `Content-Type: text/calendar; charset=utf-8`
- **Caching**: `ETag` und/oder `Last-Modified` aus dem `syncSeq`/dem
  jüngsten `updatedAt` der enthaltenen Objekte ableiten; `If-None-Match`/
  `If-Modified-Since` unterstützen (`304`), damit periodisch pollende
  Clients (Outlook, Google Calendar) nicht bei jedem Poll den vollen
  Kalender neu laden

## Akzeptanzkriterien
- [ ] Feed-URL mit gültigem Token liefert ein valides
      `text/calendar`-Dokument mit allen Terminen des Kalenders, **ohne**
      dass ein `Authorization`-Header nötig ist
- [ ] Feed-URL mit ungültigem/widerrufenem Token liefert `404`
- [ ] Ein zweiter Abruf mit `If-None-Match` (unverändertem Kalender)
      liefert `304`
- [ ] Nach Hinzufügen eines neuen Termins liefert der nächste Abruf
      `200` mit aktualisiertem Inhalt (Cache-Invalidierung funktioniert)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 14, 21
