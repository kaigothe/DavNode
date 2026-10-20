# Große Aufgabe: Doku, Screenshots, Demo

## Ziel
Neue Nutzer finden die UI, verstehen das Flag und sehen sie in der Doku.

## Sub-Tasks
1. **Doku** (Englisch, VitePress): Kapitel „Admin UI“ — Aktivierung
   (`DAVNODE_ADMIN_UI_ENABLED`, `DAVNODE_ADMIN_UI_CONTENT_VIEW`), Login,
   Rollen, Sicherheitshinweise (TLS-Pflicht wegen Basic-Auth,
   Credentials nur im Tab-Speicher, Protokollierung des Inhaltszugriffs),
   Konfigurationsreferenz und Admin-API-Seite ergänzen.
2. **Demo**: `docker-compose.demo.yml` startet mit aktivierter UI und
   Content-View; Import-Skript legt Beispielkalender/-kontakte an.
3. **Screenshots**: skriptgesteuert (Playwright) in Hell/Dunkel und de/en,
   für README, Doku und Fact-Sheet; reproduzierbar per npm-Skript.
4. **Release**: README-Abschnitt, CHANGELOG (semantic-release über
   Conventional Commits `feat(admin-ui): …`), ggf. Commitlint-Scope
   `admin-ui` ergänzen, M13-Task `03-admin-ui.md` von ⏸ auf erledigt
   verweisen.

## Akzeptanzkriterien
- [ ] Frischer Nutzer aktiviert die UI allein anhand der Doku
- [ ] Screenshots werden per Skript neu erzeugt, keine manuellen Dateien
- [ ] Demo zeigt UI ohne zusätzliche Handgriffe
