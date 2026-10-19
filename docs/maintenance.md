# Maintenance policy

DavNode is maintained by one person in their available time. This page says
what you can rely on; it does not promise more than that.

- **Releases:** automatic on every merged `feat`/`fix` change to `main`
  (Semantic Versioning, [changelog](../CHANGELOG.md)). No fixed schedule.
- **Supported versions:** the latest release only. Upgrade to receive fixes
  ([upgrade guide](upgrade.md)).
- **Security fixes:** confirmed vulnerabilities are fixed in a new release
  as soon as practical; reporting and targets are in
  [SECURITY.md](../SECURITY.md).
- **Bugs:** triaged on a best-effort basis; reproducible reports with a
  failing request or test are fixed fastest. Client-compatibility fixes get a
  regression test.
- **Node.js:** the current LTS line (see `.nvmrc`/`engines`); an LTS going
  end-of-life triggers a move to the next one in a minor release.
- **Deprecations:** announced in the changelog at least one minor release
  before removal; removals only in major versions.
- **Dependencies:** updated weekly by Dependabot, scanned by CodeQL; the
  container base image is rebuilt with each release.
- **Roadmap:** see [roadmap](roadmap.md). Priorities follow user reports;
  open an issue or discussion to influence them.
- **Need guarantees?** See [support](support.md).
