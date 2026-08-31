# Sub-Task: Feed-Token-Verwaltung

## Kontext
`icsFeedToken` auf `CalendarCollection` (siehe
[CalendarCollection-Entity](../../01-calendar-domain-entities/01-calendar-collection-entity.md)),
nullable — Feed ist deaktiviert, bis erstmals generiert. Regeneration
widerruft den alten Token (einfacher Revoke-Mechanismus).

## Aufgabe
- `packages/core/src/caldav/feed-token.service.ts`:
  `generateFeedToken(calendarId): Promise<string>` — erzeugt einen
  kryptographisch zufälligen Token (z.B. 32 Byte, base64url-kodiert),
  speichert ihn auf der `CalendarCollection`, gibt ihn zurück;
  `revokeFeedToken(calendarId): Promise<void>` — setzt `icsFeedToken`
  zurück auf `null` (bestehende Feed-URLs werden sofort ungültig)
- HTTP-Endpunkt (regulär Basic-Auth-geschützt, **nicht** über den
  Feed-Token selbst): `POST /dav/{tenant}/calendars/{userId}/{calendarId}/feed-token`
  erzeugt/regeneriert den Token, erfordert `write-acl` auf dem Kalender
  (wer den Feed teilen darf, darf ihn auch widerrufen — dieselbe
  Rechte-Schwelle wie ACL-Änderungen). Ein einfacher REST-Endpoint
  reicht in M6; eine komfortablere Verwaltungsoberfläche kann später
  über die Admin-API (M9) entstehen, ohne diesen Service zu ändern

## Akzeptanzkriterien
- [ ] Erste Token-Generierung liefert einen zufälligen, ausreichend
      langen Token; zwei Generierungen liefern unterschiedliche Werte
- [ ] Nach Regeneration ist der alte Token-Wert sofort ungültig (Test:
      Feed-Handler mit altem Token liefert `404`, siehe
      [Feed-Handler](02-feed-handler.md))
- [ ] Endpoint erfordert `write-acl`, nicht nur `read` (Test mit einem
      Nutzer, der nur lesen darf)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 21
