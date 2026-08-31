# Sub-Task: iCalendar-Parser-Wrapper

## Kontext
RFC 5545 ist deutlich komplexer als vCard: Line-Folding, `VTIMEZONE`-
Definitionen, `RRULE`/`RDATE`/`EXDATE`, mehrere Komponenten mit
derselben `UID` in einem Dokument. Eine etablierte, gut getestete
Bibliothek nutzen statt Eigenbau — insbesondere für `RRULE`-Semantik
(RFC 5545 §3.3.10), die notorisch fehleranfällig zum Selbstbauen ist.

## Aufgabe
- Eine gepflegte npm-Bibliothek für iCalendar-Parsing **und**
  RRULE-Expansion auswählen (bei Umsetzung aktuellen Ökosystem-Stand
  prüfen, z.B. `ical.js`-artige Bibliotheken mit eingebauter
  Recurrence-Iterator-Unterstützung — konkrete Wahl hier nicht
  festgeschrieben, da sich die npm-Paketlandschaft seit Planungsstand
  ändern kann)
- `packages/core/src/caldav/icalendar-parser.ts`: dünner Wrapper mit
  eigener stabiler interner Repräsentation (`ParsedCalendarObject`):
  `{ uid, componentType, master: ParsedComponent, overrides: ParsedComponent[] }`,
  wobei `ParsedComponent` mindestens `dtstart`, `dtend`/`duration`,
  `isAllDay`, `rrule` (nullable), `rdate[]`, `exdate[]`, `recurrenceId`
  (nur bei Overrides), `transparency`, `status`, `summary` enthält
- **Validierung** (RFC4791 §4.1, Precondition `valid-calendar-object-
  resource`): alle Komponenten im Dokument müssen dieselbe `UID` haben;
  genau ein Master (ohne `RECURRENCE-ID`), beliebig viele Overrides
  (mit `RECURRENCE-ID`); gemischte Komponententypen (z.B. `VEVENT` +
  `VTODO` im selben Dokument) sind ungültig → Parser wirft einen
  erkennbaren Fehler
- Parser lehnt `VTODO`/`VJOURNAL` mit einem klaren, erkennbaren Fehler
  ab (bewusst nicht unterstützt, siehe
  [00-setting-goal.md](../00-setting-goal.md))

## Akzeptanzkriterien
- [ ] Ein einzelnes `VEVENT` ohne Wiederholung wird korrekt geparst
- [ ] Ein `VEVENT` mit `RRULE` **und** einem `RECURRENCE-ID`-Override
      (z.B. eine verschobene Instanz) wird korrekt in `master` +
      `overrides` zerlegt
- [ ] Ein Dokument mit zwei unterschiedlichen `UID`s wird abgelehnt
- [ ] Ein Dokument mit `VTODO` wird mit klarer Fehlermeldung abgelehnt
- [ ] Ein Master ohne `RECURRENCE-ID` und zwei Overrides mit derselben
      `UID` aber unterschiedlichen `RECURRENCE-ID`-Werten werden korrekt
      zugeordnet

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 5545, RFC 4791 §4.1
