# Sub-Task: Automatisierte Sicherheitsprüfung

## Aufgabe
- `.github/dependabot.yml` (npm, GitHub Actions, Docker; wöchentlich,
  gruppiert, Conventional-Commit-Präfix `chore(deps)`)
- CodeQL-Workflow (JavaScript/TypeScript)
- OpenSSF-Scorecard-Workflow + Badge
- `npm audit` bleibt in CI (siehe M12-Pitfalls)

## Akzeptanzkriterien
- [ ] Dependabot-PRs bestehen CI und commitlint
- [ ] CodeQL läuft auf main und PRs; Findings triagiert
