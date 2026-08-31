# Sub-Task: JWT-Validierung & Subject-Mapping

## Kontext
Implementiert das
[Auth-Provider-Interface aus M1](../../../M1-kern-datenmodell-tenancy/02-credential-auth-interface/03-auth-provider-interface.md)
für `type = 'oauth2'`. Nutzt den
[JWKS-Client](01-idp-config-and-jwks-client.md).

## Aufgabe
- `packages/core/src/auth/oauth2-auth-provider.ts`: `verify({ token })`
  1. JWT-Header lesen (`kid`, `alg`), passenden Public Key aus dem
     JWKS-Client des jeweiligen Issuers holen
  2. Signatur verifizieren (nur asymmetrische Algorithmen wie `RS256`/
     `ES256` akzeptieren — **kein** `alg: none`, **kein** `HS256`/
     symmetrische Algorithmen von einem extern kontrollierten Token
     akzeptieren, klassische JWT-Sicherheitsfalle)
  3. Claims prüfen: `exp` (nicht abgelaufen), `nbf` (falls vorhanden,
     noch nicht gültig → ablehnen), `iss` (== konfigurierter Issuer),
     `aud` (== konfigurierte Audience)
  4. `sub`-Claim extrahieren, `Credential` mit
     `(oauth2_issuer = iss, oauth2_subject = sub)` suchen — kein
     Treffer → `null` (**kein** JIT-Provisioning, siehe
     [00-setting-goal.md](../../00-setting-goal.md))
  5. Treffer: zugehörigen `Principal` zurückgeben
- Jeder Prüfschritt gibt bei Fehlschlag sofort `null` zurück (kein
  Weiterprüfen nach dem ersten Fehler) — verhindert, dass detaillierte
  Fehlerursachen an den Client durchsickern

## Akzeptanzkriterien
- [ ] Gültiges, korrekt signiertes JWT mit verknüpftem `sub` liefert
      den `Principal`
- [ ] Abgelaufenes Token (`exp` in der Vergangenheit) liefert `null`
- [ ] Token mit falschem `aud` liefert `null`
- [ ] Token mit `alg: none` oder `HS256` wird **kategorisch** abgelehnt,
      unabhängig vom Inhalt (Sicherheits-Regressionstest)
- [ ] Gültiges, korrekt signiertes Token eines **nicht verknüpften**
      `sub` liefert `null` (kein automatisches Anlegen)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 25
