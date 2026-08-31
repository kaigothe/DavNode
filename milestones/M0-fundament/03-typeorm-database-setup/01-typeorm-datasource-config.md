# Sub-Task: TypeORM-DataSource-Konfiguration

## Kontext
TypeORM wurde explizit wegen Datenbank-Unabhängigkeit gewählt
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 1).
Ziel-Engines: PostgreSQL, SQLite, MySQL/MariaDB (Runde 3).

## Aufgabe
- In `@davnode/core` ein `src/db/data-source.ts` anlegen, das eine
  TypeORM-`DataSource` konfiguriert
- DB-Treiber (`type: 'postgres' | 'sqlite' | 'mysql'`) und
  Verbindungsparameter kommen aus Umgebungsvariablen (z.B.
  `DAVNODE_DB_TYPE`, `DAVNODE_DB_HOST`, `DAVNODE_DB_PORT`,
  `DAVNODE_DB_NAME`, `DAVNODE_DB_USER`, `DAVNODE_DB_PASSWORD`,
  `DAVNODE_DB_FILE` für SQLite)
- Alle drei Treiber (`pg`, `better-sqlite3` oder `sqlite3`, `mysql2`) als
  Dependencies von `@davnode/core` ergänzen
- `entities`-Pfad zeigt auf ein (noch leeres) `src/entities/`-Verzeichnis,
  das in M1 befüllt wird
- Kleiner Vitest-Test, der die DataSource gegen SQLite (In-Memory)
  initialisiert und wieder schließt — als Nachweis, dass die
  Konfiguration grundsätzlich funktioniert

## Akzeptanzkriterien
- [ ] `DataSource` lässt sich mit `DAVNODE_DB_TYPE=sqlite` initialisieren
      (In-Memory oder Datei), ohne dass Entities existieren müssen
- [ ] Konfiguration ist so geschrieben, dass ein Wechsel auf
      `postgres`/`mysql` nur Umgebungsvariablen ändert, keinen Code
- [ ] Kein hartkodierter DB-Treiber-Import außerhalb der
      DataSource-Konfiguration

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 1, 3
