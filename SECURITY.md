# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/kaigothe/DavNode/security/advisories/new).
Describe what you found, how to reproduce it, the DavNode version and the
database you use. If you cannot use GitHub, open an issue that says only
"security contact request" (no details) and the maintainer will reach out.

What to expect:

- an acknowledgement within **7 days**,
- a first assessment (accepted, needs more information, or not a
  vulnerability) within **14 days**,
- a fix and a release for confirmed problems, with credit to you in the
  advisory and changelog unless you prefer to stay anonymous.

DavNode is maintained by one person; these are targets, not guarantees.
Please give us a reasonable time to fix a problem before you disclose it.

## Supported versions

Only the **latest release** receives security fixes. DavNode follows
[Semantic Versioning](https://semver.org/); upgrading within a major
version is safe and migrations run on start (see the README).

## Scope and known limits

In scope: the server, the admin API and the container image.

Known limits that are documented, not vulnerabilities:

- DavNode does not terminate TLS; run it behind a TLS-terminating reverse
  proxy (see "Production deployment" in the README).
- Rate limiting of failed logins is per client address, in memory and for
  one instance. It does not stop attacks spread over many addresses.
- Digest authentication stores an `HA1` hash per user, which is weaker than
  the argon2id hash used for Basic.
- Data is not encrypted at rest by DavNode; use database or disk encryption.

See [docs/security.md](docs/security.md) for the security model.
