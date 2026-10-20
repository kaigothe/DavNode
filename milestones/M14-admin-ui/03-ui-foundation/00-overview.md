# Große Aufgabe: UI-Fundament

## Ziel
Lauffähiges Workspace-Paket `@davnode/admin-ui` mit Tooling, das den
Repo-Konventionen entspricht (siehe
[planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)).

## Sub-Tasks
1. **Paket anlegen**: `packages/admin-ui` (private, AGPL-3.0-only, ESM),
   Vite + React 18/19 + TypeScript strict, `base: '/admin-ui/'`. Anbindung an
   Root-`tsconfig`, ESLint (react-hooks, jsx-a11y), Prettier, Vitest-Projekt.
2. **Bibliotheken**: Ant Design 5 (`ConfigProvider`, `theme.darkAlgorithm`),
   React Router, TanStack Query, `react-i18next` (oder `lingui`; Entscheidung
   im Sub-Task begründen), `dayjs` (Ant-Design-kompatibel) für Datumsformate.
3. **API-Client**: Typen aus der OpenAPI-Spec generieren
   (`openapi-typescript`), dünner `fetch`-Wrapper mit
   Auth-Header, einheitlicher Fehlerabbildung `{error:{code,message}}` →
   `ApiError`. Ein CI-Schritt prüft, dass die generierten Typen zur Spec
   passen (analog zum Spec-Check).
4. **Build-Integration**: `npm run build -w @davnode/admin-ui` erzeugt
   `dist/`; Root-Skripte (`dev`, Dev-Proxy auf lokalen Server für `/admin`),
   Aufnahme in `npm run docs`/CI-Matrix. Bundle-Größen-Budget definieren
   (Ant Design per Tree-Shaking, Routen lazy laden).
5. **Ordnerstruktur**: `src/api`, `src/auth`, `src/i18n`, `src/theme`,
   `src/features/{tenants,users,groups,quota,providers,calendars,contacts}`,
   `src/components`.

## Akzeptanzkriterien
- [ ] `npm run dev -w @davnode/admin-ui` zeigt eine leere Shell gegen einen
      lokalen Server
- [ ] `lint`, `test`, `build` laufen in CI für das Paket
- [ ] Generierte API-Typen sind eingecheckt oder reproduzierbar, CI erkennt Drift
- [ ] Bundle-Budget ist als Test/CI-Check hinterlegt
