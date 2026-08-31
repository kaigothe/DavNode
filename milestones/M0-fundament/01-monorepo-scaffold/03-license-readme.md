# Sub-Task: Lizenz & README

## Kontext
Lizenzentscheidung: AGPL-3.0
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 6).

## Aufgabe
- `LICENSE`-Datei im Root mit vollständigem AGPL-3.0-Lizenztext anlegen
- `README.md` im Root mit: Projektname (DavNode), Kurzbeschreibung (aus
  [planning/00-overview.md](../../../planning/00-overview.md)),
  Lizenzhinweis, Hinweis auf das `planning/`-Verzeichnis für den
  vollständigen Projektplan
- Lizenz-Kennzeichnung je Package festlegen: `"license": "AGPL-3.0-only"`
  im `package.json` jedes Packages (SPDX-Identifier)

## Akzeptanzkriterien
- [ ] `LICENSE` enthält den offiziellen AGPL-3.0-Volltext
- [ ] Alle `package.json`-Dateien haben `"license": "AGPL-3.0-only"`
- [ ] README verweist auf `planning/` als Quelle der Wahrheit für
      Architektur/Roadmap

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 6
