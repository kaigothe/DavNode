# Sub-Task: Admin-Dokumentation — Client-seitige Einschränkungen

## Kontext
Einige bekannte Windows-Mini-Redirector-Eigenheiten liegen **außerhalb**
der Kontrolle des Servers — Windows selbst verweigert z.B. per Default
Basic Auth über reines HTTP (nicht HTTPS), unabhängig davon, was der
Server anbietet. Das ist keine Aufgabe für Code, sondern für Dokumentation,
damit Admins nicht vergeblich nach einem Server-seitigen Fix suchen.

## Aufgabe
- Abschnitt in der Projekt-Dokumentation (`docs/` bzw.
  `packages/server/README.md`) ergänzen:
  - Windows verweigert Basic Auth über HTTP standardmäßig
    (`BasicAuthLevel`-Registry-Wert) — Empfehlung: DavNode **immer**
    über HTTPS betreiben (ohnehin für Passwort-Übertragung nötig,
    siehe planning/06-standards-compliance.md)
  - Bekannte historische Dateigrößen-Limits älterer
    Mini-Redirector-Versionen (clientseitig, nicht serverseitig
    behebbar) als Hinweis
  - Empfehlung, DAVx5 oder einen dedizierten WebDAV-Client für Windows
    zu nutzen, falls der native Mini-Redirector trotz `MS-Author-Via`
    weiterhin Probleme macht

## Akzeptanzkriterien
- [ ] Dokumentation ist an einer für Admins auffindbaren Stelle
      (verlinkt aus dem Haupt-README)
- [ ] Enthält konkrete, überprüfbare Handlungsempfehlungen (kein
      vages "kann Probleme geben")

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 13
