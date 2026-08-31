# Sub-Task: Digest-Auth-Provider

## Kontext
Implementiert das
[Auth-Provider-Interface aus M1](../../../M1-kern-datenmodell-tenancy/02-credential-auth-interface/03-auth-provider-interface.md)
für `type = 'digest'`. **Kein** HTTP-Code hier (Header-Parsing/
Challenge-Erzeugung ist Große Aufgabe 3) — reine Verifikationslogik.

## Aufgabe
- `packages/core/src/auth/digest-auth-provider.ts`: `verify(input)` mit
  `input = { tenantSlug, username, realm, nonce, uri, method, qop, nc, cnonce, response }`
  (bereits vom HTTP-Layer geparst)
  1. `User` über `(tenant_id, username)` laden, dessen `digest`-
     `Credential` laden — kein Treffer → `null` (nach demselben
     Timing-Schutz-Prinzip wie Basic Auth aus M1: auch bei
     "User existiert nicht" wird intern eine Dummy-Berechnung
     durchlaufen)
  2. `HA2 = SHA256(method:uri)`
  3. `expectedResponse = SHA256(storedHa1:nonce:nc:cnonce:qop:HA2)`
  4. Konstantzeit-Vergleich `expectedResponse` mit dem übermittelten
     `response` — bei Übereinstimmung: zugehörigen `Principal`
     zurückgeben, sonst `null`
- Provider bei der Auth-Provider-Registry (M1) unter `'digest'`
  registrieren
- **Nonce-/Replay-Prüfung findet hier nicht statt** — das übernimmt der
  [Nonce-Store](02-nonce-store.md) bzw. die HTTP-Schicht (Große
  Aufgabe 3), **bevor** dieser Provider überhaupt aufgerufen wird
  (Trennung: Nonce-Gültigkeit ist ein HTTP-Session-Konzept, HA1-
  Verifikation ist reine Kryptografie)

## Akzeptanzkriterien
- [ ] Korrekt berechnete `response` mit gültigem `digest_ha1` liefert
      den `Principal`
- [ ] Falsche `response` liefert `null`
- [ ] Unbekannter Nutzer liefert `null`, mit vergleichbarer
      Rechenzeit wie ein bekannter Nutzer mit falscher `response`
      (Timing-Schutz-Test, analog M1)
- [ ] Nutzer ohne `digest`-Credential (nur `basic` vorhanden) liefert
      `null`, kein Fehler

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 7616 §3.4.1
