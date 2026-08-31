# Sub-Task: Migrations-Workflow

## Kontext
Schema-Änderungen sollen über TypeORM-Migrations laufen, nicht über
`synchronize: true` (das ist für Produktivbetrieb ungeeignet und würde
der in M1+ geplanten kontrollierten Schema-Evolution widersprechen).

## Aufgabe
- `migrations`-Verzeichnis in `@davnode/core` anlegen
- npm-Scripts für den Migrations-Workflow ergänzen (z.B. über die
  TypeORM-CLI): `migration:generate`, `migration:run`, `migration:revert`
- Eine erste, leere "Baseline"-Migration anlegen (kann inhaltsleer sein,
  dient als Nachweis, dass der Workflow technisch funktioniert)
- Kurze Doku (Abschnitt in `packages/core/README.md`), wie Migrationen
  erzeugt/ausgeführt werden — relevant, da spätere Meilensteine (M1+)
  viele Migrationen hinzufügen werden

## Akzeptanzkriterien
- [ ] `npm run migration:run` (o.ä.) führt die Baseline-Migration gegen
      eine SQLite-Test-DB erfolgreich aus
- [ ] `synchronize` ist in der DataSource-Konfiguration explizit auf
      `false` gesetzt
- [ ] Kurz-Doku zum Migrations-Workflow vorhanden

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
