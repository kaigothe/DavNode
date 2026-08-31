# Sub-Task: MKCALENDAR-Handler

## Kontext
RFC 4791 §5.3.1 definiert `MKCALENDAR` als **eigene** HTTP-Methode
(anders als CardDAV, das Adressbücher über Extended MKCOL erzeugt, siehe
[M5-Extended-MKCOL](../../M5-carddav/03-addressbook-home-and-extended-mkcol/02-extended-mkcol.md)).
Strukturell an
[M2s MKCOL-Handler](../../M2-webdav-core/06-resource-crud/01-mkcol.md)
angelehnt, aber eine eigene Route, kein Retrofit von MKCOL nötig.

**Implementierungshinweis**: `MKCALENDAR` (wie auch `PROPFIND`, `MKCOL`,
`LOCK`, `REPORT`, `ACL`, ...) gehört zu Node.js' bekannten HTTP-Methoden
(`http.METHODS`), daher unterstützt Express dafür dasselbe
`app.mkcalendar(path, handler)`-Muster wie für die anderen
WebDAV-Methoden aus M2–M5 — keine Sonderbehandlung auf Express-Ebene
nötig.

## Aufgabe
- `packages/server/src/http/routes/mkcalendar.route.ts`: Request-Body
  `<C:mkcalendar>` mit `<D:set><D:prop>...</prop></D:set>` (z.B.
  `displayname`, `CALDAV:calendar-description`,
  `CALDAV:supported-calendar-component-set`, `CALDAV:calendar-timezone`)
- Ziel-Pfad muss unterhalb der **eigenen** Calendar-Home-Collection
  liegen (`{userId}` im Pfad = anfragender Principal) — sonst `403`
- Legt eine neue `CalendarCollection` an, `ownerPrincipalId` =
  anfragender Principal, Properties aus dem Body übernommen
  (`supportedComponentSet` fällt auf `['VEVENT']` zurück, falls nicht
  angegeben oder falls andere Typen als `VEVENT` angefragt werden —
  siehe Abgrenzung in [00-setting-goal.md](../00-setting-goal.md))
- Ziel-Pfad existiert bereits → `405 Method Not Allowed`
- Bei Erfolg: [Default-Owner-ACE](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)
  wird angelegt (parametrisiert für `calendar_aces`, siehe
  [Große Aufgabe 5](../05-acl-lock-sync-reuse/00-overview.md))
- Antwort: `201 Created` mit `<C:mkcalendar-response>`-Body

## Akzeptanzkriterien
- [ ] MKCALENDAR unter der eigenen Home-Collection legt einen neuen,
      per PROPFIND sichtbaren Kalender an
- [ ] MKCALENDAR außerhalb der eigenen Home-Collection liefert `403`
- [ ] MKCALENDAR auf einen bereits existierenden Pfad liefert `405`
- [ ] Neu angelegter Kalender hat eine Default-Owner-ACE (sofortiger
      Zugriff für den Eigentümer, kein Default-Deny-Lockout)
- [ ] Angefragte, nicht unterstützte Component-Types (z.B. `VTODO`)
      führen **nicht** zu einem Absturz, sondern zu einem auf `VEVENT`
      reduzierten `supportedComponentSet`

## Nachtrag (Runde 22, sobald M7 existiert)
Sobald [M7 — CalDAV Scheduling](../../M7-caldav-scheduling/00-setting-goal.md)
existiert, muss dieser Handler zusätzlich prüfen: ist
`User.defaultCalendarId` des anfragenden Principals noch `null` (erster
Kalender des Nutzers)? Falls ja, wird die neu angelegte
`CalendarCollection` automatisch als `defaultCalendarId` gesetzt (siehe
[M7-Default-Kalender](../../M7-caldav-scheduling/01-scheduling-data-model/02-default-calendar-and-principal-properties.md)).
Bis M7 existiert, ist dieses Feld schlicht nicht vorhanden — kein
Blocker für M6 selbst.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §5.3.1
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 22
