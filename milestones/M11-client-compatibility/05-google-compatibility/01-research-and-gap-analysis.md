# Sub-Task: Recherche & Gap-Analyse

## Kontext
[planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)
vermerkt bereits: Google unterstützt CalDAV/CardDAV, aber mit
Abweichungen (u.a. CardDAV historisch eingeschränkt, OAuth2 praktisch
zwingend, Scheduling-Verhalten weicht teils von RFC 6638 ab) — ohne
verlässliche, aktuelle Quelle zum genauen Stand. Diese Aufgabe ist
**Recherche, kein Code**.

## Aufgabe
- Klären, was mit "Google-Kompatibilität" praktisch gemeint sein soll —
  zwei plausible Lesarten, beide prüfen:
  1. Google Calendar/Contacts als **Client**, der versucht, DavNode als
     CalDAV/CardDAV-Server zu nutzen (z.B. über Googles begrenzte
     CalDAV-Import-Funktion) — eher unwahrscheinlich, da Google primär
     seine eigene API bevorzugt
  2. Generische Android-/Drittanbieter-Clients, die ursprünglich gegen
     Google-CalDAV/CardDAV-Endpunkte entwickelt wurden und daher
     Google-spezifische Annahmen treffen — wahrscheinlichere Lesart,
     teilweise bereits durch die DAVx5-Tests in
     [planning/02-roadmap.md](../../../planning/02-roadmap.md)
     abgedeckt
- Aktuelle Dokumentation/aktuelles Verhalten von Googles CalDAV/CardDAV-
  Endpunkten recherchieren (Stand zum Zeitpunkt der Umsetzung, **nicht**
  der Planung — kann sich seither geändert haben)
- Ergebnis: ein kurzes Findings-Dokument (`FINDINGS.md` in diesem
  Ordner oder als Kommentar in dieser Datei ergänzt) mit konkreten,
  überprüfbaren Abweichungen, die DavNode betreffen könnten

## Akzeptanzkriterien
- [ ] Findings-Dokument beantwortet explizit, welche der beiden
      Lesarten (oder beide) tatsächlich relevant sind
- [ ] Jede gefundene Abweichung ist mit einer Quelle/einem
      Nachweis (nicht nur Vermutung) belegt
- [ ] Enthält eine Einschätzung, ob überhaupt Server-seitige Anpassungen
      nötig sind, oder ob bestehende RFC-Konformität bereits ausreicht

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)
