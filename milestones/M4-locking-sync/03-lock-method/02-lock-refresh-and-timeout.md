# Sub-Task: Lock-Refresh & Timeout-Handling

## Kontext
RFC 4918 §9.10.2 (Timeout-Header), §9.10.9 (Lock-Refresh: ein LOCK-
Request **ohne** `<D:lockinfo>`-Body, aber mit `If`-Header, der den
bestehenden Lock-Token referenziert).

## Aufgabe
- `Timeout`-Header-Parsing: Client schickt eine kommaseparierte
  Präferenzliste (z.B. `Second-3600, Infinite`), Server wählt die erste
  Option, die er gewähren kann
- Server-Policy (projektspezifisch, da RFC4918 hier volle Freiheit
  lässt): Default-Timeout `Second-3600` (1 Stunde), falls kein
  `Timeout`-Header mitgeschickt wird; maximal gewährter Wert
  `Second-86400` (24 Stunden) — ein angefragtes `Infinite` oder ein
  längerer Wert wird auf dieses Maximum gekappt, nicht abgelehnt
- Tatsächlich gewährter Wert wird im `Timeout`-Response-Header
  zurückgemeldet (kann vom angefragten Wert abweichen)
- **Refresh**: erkennt eine LOCK-Anfrage ohne Body anhand von
  Content-Length 0 (bzw. fehlendem `<D:lockinfo>`-Root-Element); liest
  den Lock-Token aus dem `If`-Header, prüft, dass der Token zu einem
  existierenden, nicht abgelaufenen Lock auf dieser Ressource gehört
  **und** dass der anfragende Principal der Lock-Inhaber ist (`403`
  sonst); setzt `expiresAt` anhand des (ggf. neuen) `Timeout`-Headers
  neu
- Refresh eines nicht existierenden/abgelaufenen Tokens → `412
  Precondition Failed`

## Akzeptanzkriterien
- [ ] LOCK ohne `Timeout`-Header erhält `Second-3600`
- [ ] LOCK mit `Timeout: Infinite` erhält `Second-86400` (gekappt, nicht
      abgelehnt)
- [ ] Refresh eines bestehenden, gültigen Locks verlängert `expiresAt`
      korrekt und liefert denselben Lock-Token zurück (Token ändert sich
      beim Refresh **nicht**)
- [ ] Refresh-Versuch durch einen anderen Principal als den
      Lock-Inhaber liefert `403`
- [ ] Refresh eines abgelaufenen Locks liefert `412`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918 §9.10.2, §9.10.9
