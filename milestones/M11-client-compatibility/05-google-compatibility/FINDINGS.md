# Google-Kompatibilität — Findings (Stand 2026-10-17)

Ergebnis der Recherche aus
[01-research-and-gap-analysis.md](01-research-and-gap-analysis.md).
Quellen sind Googles eigene Entwicklerdokumentation (zum Zeitpunkt der
Umsetzung abgerufen), nicht die Planungsannahmen.

## Kurzfassung

- **Lesart 1 (Google als Client von DavNode): nicht relevant.** Google
  Calendar und Google Contacts sprechen mit fremden Servern kein
  CalDAV/CardDAV. Der unterstützte Weg ist das Abonnieren eines
  Kalenders über eine ICS-URL („Aus URL hinzufügen") — das deckt der
  ICS-Feed aus M6 bereits ab.
- **Lesart 2 (Clients, die gegen Googles Endpunkte entwickelt wurden):
  relevant, aber ohne Handlungsbedarf.** Alles, was Google serverseitig
  anbietet und deshalb von solchen Clients genutzt wird, ist in DavNode
  vorhanden. Die Abweichungen sind Einschränkungen *von Google*, nicht
  Anforderungen an DavNode.
- **Server-seitige Anpassungen sind nicht nötig.** Sub-Task 2
  (Anpassungen) entfällt, siehe
  [02-adjustments.md](02-adjustments.md). Das Verhalten gegenüber echten
  Google-Clients wurde nicht live getestet (siehe „Grenzen").

## Belegte Befunde

| # | Befund | Quelle | Folge für DavNode |
|---|--------|--------|-------------------|
| 1 | Google verlangt OAuth 2.0 über HTTPS; Basic Auth oder HTTP liefern `401`. Gilt für CalDAV und CardDAV. | [CalDAV-Guide](https://developers.google.com/workspace/calendar/caldav/v2/guide), [CardDAV-Guide](https://developers.google.com/people/carddav) | Betrifft Googles Server. DavNode bietet seit M10 optional Bearer-Token (OAuth2, JWT eines konfigurierten OIDC-Providers); Googles CalDAV/CardDAV-Zugriffstoken sind kein Teil davon und sollen es nicht sein (DavNode ist reiner Resource Server). Keine Änderung. |
| 2 | CalDAV: unterstützt werden GET, PUT, HEAD, DELETE, POST, OPTIONS, PROPFIND, PROPPATCH, REPORT (alle Reports außer `free-busy-query`). **Nicht** unterstützt: LOCK, UNLOCK, COPY, MOVE, MKCOL, MKCALENDAR, `If*`-Header außer `If-Match`, beliebige Properties, RFC 3744. | CalDAV-Guide | Kein Client, der gegen Google funktioniert, darf diese Methoden voraussetzen. DavNode unterstützt eine Obermenge davon. Keine Änderung. |
| 3 | Kollektions-Sync (RFC 6578) wird nach dem ersten Abgleich *verlangt*; `getctag` ändert sich bei jeder Änderung; CardDAV: Sync-Token 29 Tage gültig, häufiges Abfragen von `getctag` wird gedrosselt. | beide Guides | `sync-collection` (M4/M5/M6) und `getctag` (M11, GA2) vorhanden. Keine Änderung. |
| 4 | CardDAV: Kontakte sind **vCard 3.0**; Updates per `PUT` mit `If-Match` (Fehler `412`). | CardDAV-Guide | vCard-3.0-Toleranz inkl. Quoted-Printable ist M11 GA3; `If-Match` ist seit M2 umgesetzt. Keine Änderung. |
| 5 | CardDAV-Discovery: `PROPFIND` auf `/.well-known/carddav`, Antwort `301` auf die Adressbuch-Ressource; URIs nie hart kodieren. | CardDAV-Guide | `/.well-known/caldav` und `/carddav` antworten mit `302` auf die Principal-URL (M11, GA1; RFC 6764 verlangt einen Redirect, kein bestimmter Code). Clients folgen beiden Codes. Keine Änderung. |
| 6 | CalDAV: Principal-Einstieg `…/caldav/v2/{id}/user`, Kalender-Einstieg `…/caldav/v2/{id}/events`; kein `/.well-known` beschrieben. | CalDAV-Guide | Entspricht unserer Principal-/Kalender-URL; Clients, die eine Kalender-URL direkt erwarten (z. B. Thunderbird), funktionieren mit DavNodes URLs. Keine Änderung. |
| 7 | CardDAV: Kontakte werden per `POST` ohne vorgegebene ID angelegt (RFC 5995, `add-member`); die Antwort nennt die neue ID. | CardDAV-Guide, [RFC 5995](https://datatracker.ietf.org/doc/html/rfc5995) | **Einzige echte Lücke:** DavNode bietet `DAV:add-member` nicht (nur `PUT` auf eine vom Client gewählte URL). Clients, die ausschließlich per `POST` anlegen, fänden bei DavNode keinen Weg. In der Praxis legen die gängigen Clients per `PUT` an (laut Beschreibung von DAVx5/Apple/Thunderbird nicht belegt — siehe Grenzen). Als optionale Erweiterung vermerkt, nicht umgesetzt. |
| 8 | Scheduling: Inbox ist bei Google immer leer, Einladungen landen im Kalender; kein Free-Busy. | CalDAV-Guide | Betrifft Googles Server. DavNodes Scheduling (M7) ist eine Obermenge. Keine Änderung. |
| 9 | `VTODO`/`VJOURNAL` werden von Google nicht unterstützt. | CalDAV-Guide | DavNode lässt diese Komponenten in M6 bewusst außen vor (planning/03-open-questions.md). Gleiche Einschränkung, keine Änderung. |

## Grenzen dieser Recherche

- Gelesen wurden die aktuellen Google-Dokumente; **nicht** getestet wurde
  gegen echte Google-Konten oder Android-/DAVx5-Installationen. Die
  Aussage „Google-Clients funktionieren" ist eine Schlussfolgerung aus den
  dokumentierten Methoden, kein Testergebnis.
- Dass gängige Clients Kontakte per `PUT` und nicht per `POST`
  (`add-member`) anlegen, ist eine Erfahrungsannahme ohne Quelle in dieser
  Recherche. Sollte ein reales Gerät an `add-member` scheitern, ist das
  eine eigene, kleine Aufgabe (`DAV:add-member`-Property plus `POST` →
  `201` mit `Location`), die dann in diesem Ordner anzulegen wäre.
- Googles Dokumentation nennt für CardDAV `addressbook-multiget` und
  `sync-collection`, `addressbook-query` nur indirekt („nicht alle Reports
  implementiert"). DavNode implementiert alle drei (M5).
- Googles Angaben können sich ändern; der Abruf war am 2026-10-17.
