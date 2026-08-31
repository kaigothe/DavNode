# Sub-Task: GET

## Kontext
Liefert den Inhalt einer `FileResource` aus. GET auf eine Collection ist
in WebDAV nicht spezifiziert — üblich ist entweder `405` oder ein
einfaches Verzeichnis-Listing; hier bewusst einfach gehalten.

## Aufgabe
- `packages/server/src/http/routes/get.route.ts`: lädt `FileResource` +
  zugehörigen `FileContent`-Blob, liefert `Content-Type` (aus
  `contentType`), `Content-Length` (aus `sizeBytes`), `ETag` (aus
  `etag`)
- **Conditional Request**: `If-None-Match`-Header mit passendem ETag →
  `304 Not Modified` (kein Body), ohne den Blob überhaupt aus der DB zu
  laden (Performance — ETag-Vergleich muss vor dem Content-Load
  passieren)
- GET auf eine Collection → `405 Method Not Allowed` (kein
  Verzeichnis-Listing über GET in v1 — PROPFIND ist der korrekte Weg)
- Ziel-Pfad existiert nicht → `404`

## Akzeptanzkriterien
- [ ] GET auf eine existierende Datei liefert korrekten Body,
      `Content-Type`, `Content-Length`, `ETag`
- [ ] GET mit `If-None-Match: <aktueller ETag>` liefert `304` ohne Body
- [ ] GET mit `If-None-Match: <veralteter ETag>` liefert den vollen
      Inhalt (`200`)
- [ ] GET auf eine Collection liefert `405`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918

## Später (nicht Teil dieser Aufgabe)
- HTTP-Range-Requests (`Range`/`Content-Range`, RFC 7233) für
  Teil-Downloads großer Dateien — bewusst zurückgestellt; da Inhalte als
  einzelne Blob-Spalte gespeichert werden (siehe
  [planning/01-decisions.md](../../../planning/01-decisions.md) Runde
  15), würde Range-Unterstützung ohnehin zunächst den kompletten Blob
  laden müssen, um daraus einen Ausschnitt zu liefern — kein
  Effizienzgewinn ohne Chunking
