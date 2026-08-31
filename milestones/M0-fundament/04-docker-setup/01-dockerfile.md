# Sub-Task: Dockerfile

## Kontext
Docker-Container ist das primäre Deployment-Ziel
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 1).

## Aufgabe
- Multi-Stage-`Dockerfile` im Root anlegen: Build-Stage (Node 22,
  `npm ci`, `npm run build --workspaces`), Runtime-Stage (schlankes
  Node-22-Base-Image, nur `dist/` + Produktions-`node_modules`)
- `.dockerignore` anlegen (`node_modules`, `dist`, `planning/`,
  `milestones/`, `.git`, Tests)
- Da M0 noch keinen lauffähigen Server hat (folgt ab M2): Runtime-Stage
  startet vorerst ein Platzhalter-Entrypoint-Script, das z.B. die
  TypeORM-DataSource initialisiert und sich sauber beendet — Nachweis,
  dass das Image grundsätzlich baut und läuft, ohne der eigentlichen
  Server-Logik vorzugreifen

## Akzeptanzkriterien
- [ ] `docker build .` läuft erfolgreich durch
- [ ] `docker run` des gebauten Images startet ohne Crash (mit
      sinnvollen Default-Umgebungsvariablen, z.B. SQLite-basiert)
- [ ] Image-Größe ist durch den Multi-Stage-Build spürbar kleiner als bei
      einem Single-Stage-Build (kein `node_modules` mit
      Dev-Dependencies im Runtime-Image)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 1
