# Sub-Task: Admin-API — OAuth2-Identität verknüpfen

## Kontext
Ohne JIT-Provisioning (siehe
[00-setting-goal.md](../../00-setting-goal.md)) braucht es einen
administrativen Weg, einen lokalen `User` mit einer externen
`(issuer, sub)`-Identität zu verknüpfen. Erweitert
[M9s User-Management](../../../M9-admin-api/04-user-management/00-overview.md).

## Aufgabe
- `POST /admin/{tenantSlug}/users/{userId}/oauth2-link` —
  `{ "issuer": "...", "subject": "..." }`, legt eine `Credential`
  (`type: 'oauth2'`) für diesen Nutzer an; `issuer` muss zu einem
  server-seitig konfigurierten Issuer passen (siehe
  [Server-Konfiguration](01-server-provider-config.md)), sonst `400`
- `DELETE /admin/{tenantSlug}/users/{userId}/oauth2-link` — entfernt die
  Verknüpfung (Nutzer kann sich danach nicht mehr per OAuth2
  anmelden, Basic/Digest bleiben unberührt)
- Verstoß gegen den Unique-Index `(oauth2_issuer, oauth2_subject)`
  (Identität bereits mit einem **anderen** Nutzer verknüpft) → `409`
  mit sprechender Meldung

## Akzeptanzkriterien
- [ ] Verknüpfung eines Nutzers mit `(issuer, sub)` ermöglicht danach
      erfolgreichen OAuth2-Login mit einem entsprechenden Token
- [ ] Verknüpfungsversuch mit nicht konfiguriertem Issuer liefert `400`
- [ ] Verknüpfungsversuch mit bereits vergebenem `(issuer, sub)` liefert
      `409`, ursprüngliche Verknüpfung bleibt bestehen
- [ ] Entfernen der Verknüpfung verhindert nachfolgenden OAuth2-Login,
      Basic/Digest-Login desselben Nutzers funktioniert weiterhin

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 25
