# Sub-Task: WWW-Authenticate-Challenge

## Kontext
Nutzt [Nonce-Store](../../02-digest-auth-core/02-nonce-store.md).

## Aufgabe
- `packages/server/src/http/digest-auth-challenge.ts`: erzeugt bei
  fehlender/ungültiger Digest-Authentifizierung einen
  `WWW-Authenticate: Digest`-Header mit `realm`, frischem `nonce`
  (aus dem Nonce-Store), `qop="auth"` (**ausschließlich** `auth`, kein
  legacy-loses `qop`), `algorithm=SHA-256`, `opaque` (zufälliger,
  unveränderlicher Wert für die Session)
- Bei einem als `'stale'` erkannten Nonce (siehe
  [Digest-Response-Validierung](02-digest-response-validation.md)):
  derselbe Header, zusätzlich `stale=true` — signalisiert dem Client,
  dass die Credentials wahrscheinlich korrekt waren, nur der Nonce
  abgelaufen ist (Client sendet automatisch erneut, ohne den Nutzer neu
  nach dem Passwort zu fragen)

## Akzeptanzkriterien
- [ ] Erste Anfrage ohne `Authorization`-Header erhält einen
      vollständigen Digest-Challenge-Header mit frischem `nonce`
- [ ] Zwei aufeinanderfolgende Challenges (unterschiedliche Requests)
      haben unterschiedliche `nonce`-Werte
- [ ] Eine Anfrage mit abgelaufenem `nonce` erhält `stale=true` im
      Response-Header

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 7616 §3.3
