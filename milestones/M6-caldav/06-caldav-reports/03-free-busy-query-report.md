# Sub-Task: free-busy-query-REPORT

## Kontext
RFC 4791 §7.10. **Protokoll-Besonderheit**: anders als alle anderen
REPORTs liefert `free-busy-query` **keine** `207 Multi-Status`-XML-
Antwort, sondern einen einzelnen `text/calendar`-Body mit einer
synthetisierten `VFREEBUSY`-Komponente.

## Aufgabe
- `packages/core/src/caldav/free-busy-query-report.ts`: parst
  `<C:time-range start="..." end="..."/>` (Pflichtangabe, RFC4791
  §7.10.1)
- Nutzt dieselbe Phase-1/Phase-2-Logik wie
  [calendar-query](02-calendar-query-report.md), aber zusätzlich
  gefiltert auf `transparency = 'opaque'` **und** `status != 'cancelled'`
  (nur tatsächlich blockierende Termine zählen als "busy", RFC4791
  §7.10)
- Alle gefundenen Instanzen (nach Recurrence-Expansion) werden zu
  Busy-Intervallen zusammengefasst; überlappende/angrenzende Intervalle
  werden **koalesziert** (ein `FREEBUSY`-Property pro
  zusammenhängendem Block, nicht eines pro Einzeltermin)
- Antwort: `200 OK`, `Content-Type: text/calendar`, Body = ein
  `VCALENDAR`-Wrapper mit einer `VFREEBUSY`-Komponente
  (`DTSTART`/`DTEND` = angefragter Zeitraum, ein oder mehrere
  `FREEBUSY;FBTYPE=BUSY:...`-Properties)
- **Neues Privilege**: `CALDAV:read-free-busy` (RFC4791 §6.1.1) wird
  eingeführt — ergänzt den in
  [M3-Privilege-Katalog](../../../M3-webdav-acl/01-ace-entities-and-privileges/02-privilege-catalog.md)
  gebauten Katalog um einen CalDAV-spezifischen Wert (aggregiert **nicht**
  unter `DAV:all`, ist ein eigenständiges Privilege). Zugriff auf
  `free-busy-query` erfordert `CALDAV:read-free-busy` **oder** `DAV:read`
  auf dem Kalender

## Akzeptanzkriterien
- [ ] Zwei sich überlappende Busy-Termine ergeben **ein**
      zusammenhängendes `FREEBUSY`-Intervall, nicht zwei
- [ ] Ein `TRANSP:TRANSPARENT`-Termin taucht **nicht** in der
      Frei/Belegt-Antwort auf
- [ ] Ein `STATUS:CANCELLED`-Termin taucht **nicht** auf
- [ ] Antwort ist gültiges `text/calendar`, kein Multistatus-XML
- [ ] Ein Nutzer mit `CALDAV:read-free-busy`, aber ohne `DAV:read`, kann
      die Frei/Belegt-Auskunft abrufen, aber **nicht** per
      `calendar-query` die Termin-Details lesen

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §6.1.1, §7.10
