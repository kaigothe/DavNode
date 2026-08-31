# Sub-Task: CalDAVtester-/CardDAVtester-CI-Integration

## Kontext
CalDAVtester (Apple/CalendarServer-Projekt, Python-basiert) deckt sowohl
CalDAV- als auch CardDAV-Tests ab. Erfordert eine
server-spezifische `serverinfo.xml`-Konfiguration (URL-Schema,
Auth-Methode, unterstützte Features) — **kein** Plug-and-Play, jeder
Server braucht eigene Anpassung.

## Aufgabe
- `serverinfo.xml` für DavNode erstellen: Pfad-Präfix-Tenancy
  (`/dav/{tenant}/...`, siehe
  [planning/05-data-model.md](../../../planning/05-data-model.md)
  URL-Schema), Basic-Auth-Credentials des CI-Test-Nutzers,
  `calendar-home-set`/`addressbook-home-set`-Pfade
- Zwei CI-Testläufe: **ohne** Scheduling-Testgruppe (deckt M5/M6 ab,
  läuft bereits ab dieser Milestone) und **mit** Scheduling-Testgruppe
  (deckt M7 ab — falls bei der M11-Umsetzung Lücken zu M7 auffallen,
  werden diese als Nachtrag in den jeweiligen M7-Dateien vermerkt, nicht
  hier stillschweigend gepatcht)
- Bekannte, bewusst nicht unterstützte Features aus der Testsuite
  ausschließen (analog zu litmus): `VTODO`/`VJOURNAL`-Tests,
  instanz-genaues Scheduling (RFC6638 §5), `expand-property`-REPORT —
  alle bereits in
  [planning/03-open-questions.md](../../../planning/03-open-questions.md)
  als bewusst zurückgestellt dokumentiert
- Ergebnis-Reports als CI-Artefakte hochladen

## Akzeptanzkriterien
- [ ] CI-Job läuft bei jedem Push/PR automatisch mit
- [ ] Alle CalDAVtester-/CardDAVtester-Tests außer den dokumentierten
      Ausnahmen bestehen
- [ ] Eine absichtlich eingebaute Regression (z.B. `calendar-query`
      liefert falsches Zeitfenster) lässt den Job sichtbar fehlschlagen
- [ ] Bei der Umsetzung entdeckte, bisher unbekannte Lücken zu M5/M6/M7
      werden als Nachtrag in den jeweiligen Milestone-Dateien vermerkt,
      nicht nur hier "nebenbei" gefixt

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5, 7
