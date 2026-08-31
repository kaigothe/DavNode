# Sub-Task: Digest-Response-Validierung

## Kontext
Nutzt [Nonce-Store](../../02-digest-auth-core/02-nonce-store.md) und
den [Digest-Auth-Provider](../../02-digest-auth-core/01-digest-auth-provider.md).

## Aufgabe
- `packages/server/src/http/digest-auth.middleware.ts`: parst
  `Authorization: Digest ...` (Key-Value-Paare gemäß RFC7616 §3.4)
- Ruft `validateAndConsumeNonce` auf: `'unknown'`/`'replay'` → `401`
  mit frischer Challenge (kein `stale`); `'stale'` → `401` mit
  `stale=true`-Challenge; `'valid'` → weiter zu Schritt 3
- Ruft den core-seitigen `digest`-Provider (`verify`) mit den
  geparsten Feldern + `method`/`uri` aus dem tatsächlichen Request auf
- Erfolg: `req.principal` gesetzt, Request geht weiter; Fehlschlag:
  `401` mit frischer Challenge (ohne `stale`, da der Nonce selbst
  gültig war — es war die `response`, die nicht passte)
- Läuft — wie die Basic-Auth-Middleware aus M2 — nach der
  Tenant-Resolution-Middleware

## Akzeptanzkriterien
- [ ] Korrekte Digest-Anfrage (gültiger Nonce, korrekte `response`)
      authentifiziert erfolgreich
- [ ] Wiederholte Anfrage mit demselben `nonce`+`nc` (Replay) wird
      abgelehnt, unabhängig davon, ob `response` korrekt wäre
- [ ] Falsche `response` bei gültigem Nonce liefert `401` **ohne**
      `stale=true`
- [ ] Abgelaufener Nonce liefert `401` **mit** `stale=true`, auch bei
      korrekt berechneter `response` (Nonce-Gültigkeit wird zuerst
      geprüft)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 7616 §3.4
