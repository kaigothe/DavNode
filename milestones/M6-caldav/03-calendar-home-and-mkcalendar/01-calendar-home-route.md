# Sub-Task: Calendar-Home-Route

## Kontext
Virtuelle Collection, nicht in der DB abgebildet — analog zur
Addressbook-Home-Route aus M5
([M5-Addressbook-Home-Route](../../M5-carddav/03-addressbook-home-and-extended-mkcol/01-addressbook-home-route.md)).

## Aufgabe
- `packages/server/src/http/routes/calendar-home.route.ts`: beantwortet
  PROPFIND auf `/dav/{tenant}/calendars/{userId}/` mit allen
  `CalendarCollection`-Zeilen des Nutzers (Depth 0/1)
- Gleiche Zugriffsregel wie bei der Addressbook-Home-Route: nur der
  Nutzer selbst sieht seine eigene Home-Collection, sonst `403`
- `CALDAV:calendar-home-set` auf dem User-Principal (über den seit M3
  vorbereiteten Property-Provider-Mechanismus, bereits für
  `CARD:addressbook-home-set` in M5 genutzt) liefert die URL dieser
  Home-Collection

## Akzeptanzkriterien
- [ ] PROPFIND auf die eigene Home-Collection listet alle eigenen
      Kalender
- [ ] PROPFIND auf die Home-Collection eines anderen Nutzers liefert
      `403`
- [ ] `CALDAV:calendar-home-set` zeigt auf die korrekte URL

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §5.2.1
