# Sub-Task: Anpassungen (Ergebnis der Recherche)

## Kontext
**Kann nicht im Voraus spezifiziert werden** — Inhalt hängt vollständig
vom Ergebnis der
[Recherche & Gap-Analyse](01-research-and-gap-analysis.md) ab.

## Aufgabe
- Findings-Dokument aus Sub-Task 1 durchgehen
- Für jede als relevant eingestufte Abweichung: eine eigene, konkrete
  Sub-Task-Datei nach demselben Muster wie die übrigen Aufgaben dieser
  Milestone anlegen (Kontext/Aufgabe/Akzeptanzkriterien/Referenzen),
  **bevor** Code geschrieben wird — dieser Ordner wächst damit
  nachträglich, statt vorab vollständig befüllt zu sein
- Ergibt die Recherche, dass **keine** Server-seitigen Anpassungen nötig
  sind (bestehende RFC-Konformität reicht bereits): diese Aufgabe
  entfällt, das Findings-Dokument dient als Nachweis/Beleg

## Akzeptanzkriterien
- [ ] Jede tatsächlich umgesetzte Anpassung hat eine eigene,
      nachvollziehbare Sub-Task-Datei mit Akzeptanzkriterien (keine
      Ad-hoc-Änderungen ohne Dokumentation)
- [ ] Falls keine Anpassungen nötig waren: das dokumentiert im
      Findings-Dokument, keine unnötigen Änderungen "auf Verdacht"

## Referenzen
- [01-research-and-gap-analysis.md](01-research-and-gap-analysis.md)

## Ergebnis (2026-10-17)
Die Recherche ([FINDINGS.md](FINDINGS.md)) ergab, dass **keine
serverseitigen Anpassungen nötig** sind: alles, was Google anbietet und
Clients dort nutzen können, ist in DavNode bereits vorhanden. Diese Aufgabe
entfällt damit, wie oben vorgesehen; es wurde nichts „auf Verdacht"
geändert. Der einzige Unterschied (RFC 5995 `add-member` zum Anlegen per
`POST`) ist als optionale Erweiterung vermerkt und bewusst nicht umgesetzt,
solange kein realer Client daran scheitert.
