# Sub-Task: Server-Konfiguration aktiver Provider

## Kontext
Basic ist seit M2 fest verdrahtet — jetzt wird die Middleware-Kette
konfigurierbar, welche der drei Schemes tatsächlich aktiv sind.

## Aufgabe
- `packages/server/src/app.ts` (M2) erweitern: liest
  `DAVNODE_AUTH_PROVIDERS` (kommagetrennt, z.B. `basic,digest,oauth2`,
  Default `basic`), hängt nur die entsprechenden Middlewares ein
- Ist **mehr als ein** Provider aktiv: bei fehlender/ungültiger
  Authentifizierung sendet der Server **mehrere separate**
  `WWW-Authenticate`-Header-Zeilen (eine je aktivem Schema, siehe
  Begründung in [00-setting-goal.md](../../00-setting-goal.md)) — die
  konkrete Middleware-Verkettung muss das unterstützen (jede Middleware
  ergänzt ihre eigene Challenge, statt die vorherige zu überschreiben)
- Ist OAuth2 aktiv, aber keine `DAVNODE_OAUTH2_ISSUERS` konfiguriert:
  Server-Start schlägt mit klarer Fehlermeldung fehl (keine stille
  Fehlkonfiguration)

## Akzeptanzkriterien
- [ ] Nur `basic` aktiv (Default) verhält sich exakt wie in M2/M9
      beschrieben (Regressionstest)
- [ ] `basic,digest` aktiv: eine Anfrage ohne Credentials erhält
      **beide** `WWW-Authenticate`-Header-Zeilen
- [ ] Ein Client, der nur Digest beherrscht, kann sich erfolgreich
      authentifizieren, wenn `basic,digest` aktiv sind (nicht nur der
      zuerst gelistete Provider funktioniert)
- [ ] OAuth2 aktiv ohne Issuer-Konfiguration verhindert den Serverstart

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 25
