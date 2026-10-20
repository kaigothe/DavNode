# Licensing

DavNode is licensed under the **GNU Affero General Public License v3.0
only** ([LICENSE](../LICENSE)). This page is a plain-language orientation,
**not legal advice**; have your own counsel confirm anything your
organisation relies on.

## What the AGPL means in practice

| Situation                                                            | Consequence                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| You run DavNode unmodified for your own organisation                 | No obligations beyond keeping the licence notices.                                                                              |
| You run it for customers or the public (hosting, managed service)    | Allowed. Users interacting with it over a network must be able to get the source of the version you run (link to this project). |
| You modify DavNode and let others use it over a network              | You must offer them your modified source under the AGPL.                                                                        |
| You distribute DavNode (for example in an appliance or container)    | Pass on the AGPL, the notices and the source.                                                                                   |
| You write a separate program that only talks to DavNode via HTTP/DAV | Generally not a derivative work; your program is not covered.                                                                   |
| You embed DavNode's code into a proprietary product                  | Not possible under the AGPL; see "Other licences".                                                                              |

## Contributions

Contributions are accepted under the project's licence, certified with a
`Signed-off-by` line (Developer Certificate of Origin; see
[CONTRIBUTING.md](../CONTRIBUTING.md)). The contributors keep their
copyright. There is deliberately **no CLA** today.

## Other licences

Companies that cannot use the AGPL may ask about a commercial licence. None
is offered at the moment; offering one later would need the agreement of all
contributors whose code is included, which is why contributions are kept
simple and clearly attributed. Contact: see [support](support.md).

## Third-party software

The dependency licences are those of the npm packages in
`package-lock.json` and of the container base images (Node.js, Debian). A
list can be generated with `npx license-checker --production --summary`. The
release SBOM (see [verifying the image](operations/verify-image.md)) lists
every component.
