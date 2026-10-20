# Große Aufgabe: Qualität

## Ziel
Die UI ist verlässlich genug für ein Open-Source-Release.

## Sub-Tasks
1. **Unit-/Komponententests**: Vitest + Testing Library; API über `msw`
   gemockt. Pflicht: Auth-Flow, Rollenmenüs, Formulare mit Serverfehlern,
   i18n-Vollständigkeit, Theme-Logik.
2. **Contract-Test**: Mock-Antworten werden gegen die OpenAPI-Spec
   validiert, damit UI-Mocks nicht von der echten API abweichen.
3. **E2E gegen echten Server**: Playwright startet Server + DB (SQLite,
   siehe Demo-Compose), prüft Login → Nutzer anlegen → Gruppe → Quota →
   (Content-View) Kalender. Läuft in CI (separater Job, Flag an).
4. **Barrierefreiheit**: `jsx-a11y` im Lint, `axe` in Komponenten-/E2E-
   Tests auf allen Hauptseiten in beiden Themes (Kontrast im Dark Mode),
   Tastaturbedienung der Dialoge, Fokusmanagement, `lang`-Attribut passend
   zur Sprache.
5. **Sicherheit**: kein `dangerouslySetInnerHTML`; Kalender-/Kontaktinhalte
   (Beschreibung, Notizen) werden als Text gerendert; Credentials nie
   in Logs/URLs; `npm audit`/CodeQL decken das Paket ab.

## Akzeptanzkriterien
- [ ] Coverage-Schwelle analog zu den übrigen Paketen
- [ ] axe: 0 Verstöße der Stufe „serious/critical“ auf den Hauptseiten
- [ ] E2E-Job grün in CI
- [ ] XSS-Test: bösartiger Termintitel wird escaped dargestellt
