# Sub-Task: PROPFIND-Handler

## Kontext
Nutzt die Infrastruktur aus
[WebDAV-XML- & Property-Infrastruktur](../03-webdav-xml-property-infrastructure/00-overview.md)
und die Platzhalter-Autorisierung aus
[Express-Server-Bootstrap](../02-express-server-bootstrap/00-overview.md).

## Aufgabe
- `packages/server/src/http/routes/propfind.route.ts` (bzw. äquivalente
  Express-Route für die HTTP-Methode `PROPFIND`): löst den Ziel-Pfad zu
  Collection oder FileResource auf, wertet den `Depth`-Header aus
  (`0`, `1`; **`infinity` wird mit `403 Forbidden` abgelehnt** — bewusste
  Einschränkung gegen unbegrenzte Rekursion/DoS bei großen Bäumen,
  RFC4918 erlaubt Servern das explizit)
- Fehlender `Depth`-Header wird laut RFC4918 wie `infinity` behandelt →
  ebenfalls `403` (nicht wie `0`)
- Request-Body (leer = `allprop`, oder `allprop`/`propname`/`prop` laut
  XML-Parser) bestimmt, welche Properties zurückkommen
- Bei `Depth: 1` auf einer Collection: Antwort enthält die Collection
  selbst **und** alle direkten Kinder (Sub-Collections und
  FileResources) — je eine `<D:response>` pro Ressource
- Ziel-Pfad existiert nicht → `404 Not Found` (kein Multistatus-Body)
- Antwort: `207 Multi-Status`, Content-Type
  `application/xml; charset="utf-8"`

## Akzeptanzkriterien
- [ ] `Depth: 0` auf einer Collection liefert nur die Collection selbst
- [ ] `Depth: 1` auf einer Collection mit zwei Kindern liefert drei
      `<D:response>`-Einträge
- [ ] `Depth: infinity` und fehlender `Depth`-Header liefern beide `403`
- [ ] `allprop`-Request liefert alle Live-Properties aus dem
      Property-Provider; `prop`-Request mit einer nicht existierenden
      Property liefert einen `404`-`propstat`-Block für genau diese
      Property (Rest der Antwort bleibt `200`)
- [ ] Zugriff auf eine fremde Ressource liefert `403` (Platzhalter-
      Autorisierung greift bereits hier)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
