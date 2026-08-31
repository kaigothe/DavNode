# Sub-Task: DB-Engine-Testmatrix

## Kontext
Alle drei Engines (PostgreSQL, SQLite, MySQL/MariaDB) sollen von Anfang
an getestet werden
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 3),
nicht erst am Ende hinzugefügt werden.

## Aufgabe
- Docker-Compose-Services für Postgres und MySQL/MariaDB für lokale
  Tests ergänzen (fällt inhaltlich mit der Großen Aufgabe "Docker-Setup"
  zusammen — dort referenzieren statt duplizieren)
- Test-Setup so erweitern, dass der DataSource-Smoke-Test aus Sub-Task
  "TypeORM-DataSource-Konfiguration" wahlweise gegen alle drei Engines
  laufen kann, gesteuert über die dort definierten Umgebungsvariablen
- In der CI-Pipeline (Große Aufgabe 5) werden diese Tests später als
  Matrix-Job ausgeführt — hier in M0 reicht die lokale Lauffähigkeit

## Akzeptanzkriterien
- [ ] Derselbe Smoke-Test läuft wahlweise gegen SQLite, Postgres und
      MySQL, gesteuert nur über Umgebungsvariablen
- [ ] Lokale Postgres-/MySQL-Instanzen lassen sich per
      `docker compose up` für Tests bereitstellen

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 3
