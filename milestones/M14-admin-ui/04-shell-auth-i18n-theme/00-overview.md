# Große Aufgabe: Shell, Auth, i18n, Theme

## Ziel
Das Gerüst, in das alle Ansichten eingehängt werden.

## Sub-Tasks
1. **Login**: Formular (Tenant-Slug, Benutzername, Passwort). Probe-Request
   `GET /admin/{slug}/me`. Bei Erfolg Basic-Header in `sessionStorage`
   (nur Tab-Lebensdauer), Auth-Context stellt `me` (Rolle, Tenant) bereit.
   Logout löscht den Speicher. Letzter Slug darf in `localStorage` gemerkt
   werden, **nie** Benutzername/Passwort.
2. **Fehlerbehandlung**: 401 → zurück zum Login mit Hinweis; 403 → „keine
   Berechtigung“-Seite; `429` (Rate-Limit) → verständliche Meldung;
   Netzwerkfehler → Retry-Hinweis. Globaler Error-Boundary.
3. **Layout/Navigation**: Ant-Design-`Layout` mit Sider, Header (Nutzer,
   Sprache, Theme, Logout), responsive. Menüeinträge nach Rolle:
   `server_admin`: Tenants, Nutzer, Gruppen, Quota, Provider, (Inhalte);
   `tenant_admin`: ohne Tenants; `member`: nur Hinweis „kein Admin“.
   Route-Guards spiegeln die Rollen (Server bleibt maßgeblich).
4. **i18n**: Sprachen `de`, `en`; Erkennung per Browser, manuell umschaltbar,
   Wahl in `localStorage`. Ant-Design-Locale (`de_DE`/`en_US`) und
   `dayjs`-Locale mitschalten. Alle Texte über Schlüssel, Test, der fehlende
   Schlüssel zwischen `de`/`en` meldet. Servermeldungen (`error.message`)
   bleiben englisch, UI zeigt zusätzlich eine übersetzte Meldung pro
   `error.code`, wo vorhanden.
5. **Theme**: Modi `System` / `Hell` / `Dunkel`; System folgt
   `prefers-color-scheme` live (`matchMedia`-Listener). Wahl in
   `localStorage`; Umsetzung über `ConfigProvider` +
   `theme.defaultAlgorithm`/`darkAlgorithm`. Kein Flackern beim Laden (Theme
   vor dem ersten Render bestimmen).

## Akzeptanzkriterien
- [ ] Falsche Credentials → Fehlermeldung, kein Eintrag im Storage
- [ ] Tab schließen = abgemeldet; Reload im selben Tab bleibt angemeldet
- [ ] Menü je Rolle getestet (3 Rollen)
- [ ] Sprach- und Theme-Wechsel wirken ohne Reload und bleiben erhalten
- [ ] Systemwechsel Hell↔Dunkel wird im Modus „System“ live übernommen
