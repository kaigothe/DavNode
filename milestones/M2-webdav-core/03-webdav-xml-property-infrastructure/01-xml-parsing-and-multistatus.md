# Sub-Task: XML-Parsing & Multistatus-Serialisierung

## Kontext
PROPFIND/PROPPATCH-Requests und -Responses sind XML mit
namespace-bewusster Struktur (`DAV:`-Namespace plus beliebige
Client-Namespaces für Custom-Properties). Diese Infrastruktur wird auch
von künftigen REPORT-Methoden (M3 ACL-REPORTs, M4 sync-collection, M5/M6
CalDAV/CardDAV-REPORTs) wiederverwendet — deshalb als eigenständiges
Modul bauen, nicht PROPFIND-spezifisch.

## Aufgabe
- XML-Bibliothek mit Namespace-Unterstützung wählen und als Dependency
  von `@davnode/core` (nicht `server` — die Serialisierung ist
  Protokoll-Logik) ergänzen (empfohlen: `xmlbuilder2`, da es sowohl
  Parsen als auch namespace-bewusstes Bauen abdeckt)
- `packages/core/src/webdav/xml/request-parser.ts`: parst eingehende
  PROPFIND-/PROPPATCH-Request-Bodies in eine typisierte, interne
  Repräsentation (z.B. `{ kind: 'allprop' } | { kind: 'propname' } | { kind: 'prop', properties: Array<{namespace, name}> }`
  für PROPFIND; analoge Struktur für PROPPATCH `set`/`remove`)
- `packages/core/src/webdav/xml/multistatus-builder.ts`: baut eine
  RFC4918-konforme `<D:multistatus>`-Antwort aus einer Liste von
  `{ href, status, properties: Array<{namespace, name, value, status}> }`-
  Einträgen (Properties können pro Ressource unterschiedliche
  Einzel-Status haben, z.B. `200 OK` für gefundene, `404 Not Found` für
  angefragte, aber nicht vorhandene Properties — RFC4918 §14.16)
- Vitest-Tests mit echten Beispiel-Request-Bodies (aus RFC4918-Beispielen
  oder litmus-Testfällen abgeleitet)

## Akzeptanzkriterien
- [ ] `allprop`-, `propname`- und `prop`-PROPFIND-Requests werden korrekt
      geparst (drei separate Tests)
- [ ] Multistatus-Builder erzeugt für eine Ressource mit gemischtem
      Property-Erfolg (manche gefunden, manche nicht) eine Antwort mit
      zwei `<D:propstat>`-Blöcken (200 und 404), wie von RFC4918
      gefordert
- [ ] Erzeugtes XML ist wohlgeformt und nutzt Namespace-Präfixe korrekt
      (Test: XML erneut parsen und Struktur verifizieren)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)
