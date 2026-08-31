# M8 — Quota-Durchsetzung

## Setting (Kontext)
Seit M1/M2 tragen `User` und `Tenant` bereits `quota_limit_bytes`/
`quota_used_bytes`-Felder (Hybrid-Ansatz, siehe
[planning/01-decisions.md](../../planning/01-decisions.md) Runde 12,
15), aber **ungenutzt**: M2s PUT-Handler enthält bewusst noch keinen
Quota-Check ("Kein Quota-Check in M2 (Quota-Durchsetzung ist M8...)").
M8 ist — anders als M2–M7 — kein neuer Protokoll-/RFC-Bereich, sondern
ein **Querschnitts-Retrofit**: die Zähler-Pflege und Limit-Prüfung
werden nachträglich in die bestehenden Schreibpfade aller drei
Ressourcen-Domänen (WebDAV/M2, CardDAV/M5, CalDAV/M6) eingebaut.

**Wichtigster technischer Punkt dieser Milestone**: die Limit-Prüfung
muss **race-frei** sein. Ein naives "erst lesen, dann prüfen, dann
schreiben" hat bei gleichzeitigen Schreibvorgängen ein
Time-of-Check-to-Time-of-Use-Problem (zwei parallele PUTs könnten beide
die Prüfung bestehen, bevor eine von beiden committet, und zusammen das
Limit überschreiten). Die Lösung: ein **atomares, bedingtes SQL-UPDATE**
(`UPDATE ... SET quota_used_bytes = quota_used_bytes + :delta WHERE
quota_limit_bytes IS NULL OR quota_used_bytes + :delta <=
quota_limit_bytes`) — betrifft das UPDATE 0 Zeilen, ist das Limit
überschritten, kein Lese-dann-Schreiben-Fenster für eine Race Condition.

## Ziel
Am Ende von M8 wird bei jedem Schreiben/Löschen von Inhalt (WebDAV-
Dateien, vCards, iCalendar-Objekte) `quota_used_bytes` auf **beiden**
Ebenen (User und Tenant) atomar mitgeführt; ein Schreibvorgang, der ein
Limit überschreiten würde, wird mit `507 Insufficient Storage`
abgelehnt, **bevor** irgendein Inhalt geschrieben wird. Zusätzlich gibt
es RFC-4331-Properties (`quota-available-bytes`/`quota-used-bytes`) und
einen periodischen Rekonziliations-Job, der Zähler-Drift korrigiert.

## Große Aufgaben (Übersicht)
1. [Quota-Counter-Utility](01-quota-counter-utility/00-overview.md)
2. [WebDAV-Quota-Integration](02-webdav-quota-integration/00-overview.md)
3. [CardDAV-/CalDAV-Quota-Integration](03-carddav-caldav-quota-integration/00-overview.md)
4. [Quota-Properties](04-quota-properties/00-overview.md)
5. [Quota-Rekonziliation](05-quota-recompute/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→5) — Aufgaben 2/3
setzen auf der Utility aus Aufgabe 1 auf.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M8-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — Quota-Abschnitt
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 4331
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 12, 15, 16

## Abgrenzung (nicht Teil von M8)
- Dead Properties (`*_properties`-Tabellen) zählen **nicht** zur Quota
  — nur tatsächlicher Ressourceninhalt (`FileContent`/
  `AddressObjectContent`/`CalendarObjectContent`), konsistent mit RFC
  4331s Definition von `quota-used-bytes` als Summe der
  Ressourcen-Inhaltslängen
- Keine Admin-UI zur Quota-Verwaltung — nur ein einfacher, Basic-Auth-
  geschützter Endpunkt für den manuellen Rekonziliations-Trigger (Große
  Aufgabe 5); eine komfortablere Oberfläche kann später über die
  Admin-API (M9) entstehen
- Keine Soft-Quota/Warnschwellen (z.B. "80 % erreicht"-Benachrichtigung)
  — nur Hard-Limit mit `507`, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md)
