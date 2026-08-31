# Sub-Task: litmus-CI-Integration

## Kontext
litmus ist die etablierte WebDAV-Testsuite (webdav.org). Testet u.a.
`basic`, `copymove`, `props`, `locks`, `http`-Testgruppen gegen einen
laufenden Server.

## Aufgabe
- Neuer CI-Job in `.github/workflows/ci.yml` (M0): startet DavNode
  gegen SQLite, seedet über das
  [M1-CLI-Bootstrap-Skript](../../../M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md)
  einen Test-Tenant/-Nutzer, installiert litmus (verfügbar als
  Debian/Ubuntu-Paket `litmus` oder aus Quellcode gebaut), führt es
  gegen die WebDAV-Root-Collection des Test-Nutzers aus
- **Bekannte, erwartete Fehlschläge dokumentieren und explizit von der
  Erfolgsbedingung ausnehmen**: litmus prüft u.a. Class-3-Ordered-
  Collections (RFC 3648) — bewusst nicht implementiert (siehe
  [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)).
  CI-Job wertet das litmus-Ergebnis differenziert aus (erwartete
  Fehlschläge ignorieren, alles andere muss bestehen), nicht pauschal
  "litmus komplett grün" oder "Ergebnis wird ignoriert"
- Testergebnis als CI-Artefakt hochladen (litmus-Logdatei), damit
  Fehlschläge nachvollziehbar sind

## Akzeptanzkriterien
- [ ] CI-Job läuft bei jedem Push/PR automatisch mit
- [ ] Alle litmus-Tests außer den dokumentierten, bewusst
      ausgenommenen (Class 3) bestehen
- [ ] Ein absichtlich eingebauter Regressions-Fehler (z.B. PROPFIND
      gibt falsches Format zurück) lässt den Job sichtbar fehlschlagen
- [ ] litmus-Log ist nach einem CI-Lauf als Artefakt abrufbar

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5, 7
