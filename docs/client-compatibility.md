# Client compatibility notes for administrators

DavNode follows the WebDAV, CalDAV and CardDAV RFCs; this page collects
what an administrator needs to know to get real clients working, and
which problems live on the client side and cannot be fixed in the server.

> **Status:** the server-side behaviour below is covered by automated
> tests. It has **not** yet been verified against real Apple, Windows,
> Thunderbird or DAVx5 installations; report differences you find.

## Always run DavNode behind HTTPS

HTTP Basic sends the password in every request, so use HTTPS in any real
deployment (put DavNode behind a reverse proxy that terminates TLS).
Besides being the right thing to do, it is what several clients insist on,
Windows among them (see below).

## Automatic account setup (RFC 6764)

Clients that only ask for a server address and credentials request
`/.well-known/caldav` and `/.well-known/carddav`. DavNode answers with a
`302` redirect to the user's principal URL, from which the client finds
the calendar and addressbook homes itself.

- **One organisation:** set `DAVNODE_DEFAULT_TENANT=<tenant slug>`. Users
  then log in with their plain username.
- **Several tenants:** leave it unset and have users log in as
  `username@tenantslug` (the part after the _last_ `@` is the tenant).
  A login without a tenant gets `400`.
- Discovery always uses HTTP Basic, whatever else
  `DAVNODE_AUTH_PROVIDERS` enables.
- Wrong password, unknown user and unknown tenant all give the same `401`.

Clients that cannot do discovery can use the full URLs directly:
`https://host/dav/<tenant>/calendars/<principal-id>/` and
`.../addressbooks/<principal-id>/`.

## Apple Calendar / Contacts, Thunderbird, DAVx5

DavNode serves `{http://calendarserver.org/ns/}getctag` on every
collection, calendar and addressbook. It is the collection's change
counter; clients compare it to decide whether to sync at all. It changes
whenever anything inside the collection changes.

## CardDAV clients that still send vCard 3.0

vCard 3.0 and 4.0 are both accepted; other versions (for example 2.1) are
rejected. Values sent with `ENCODING=QUOTED-PRINTABLE` are decoded for
searching, so `addressbook-query` finds `Müller` however the client
encoded it. Properties DavNode does not interpret (such as Apple's
`X-ABADR`) are kept and returned unchanged.

## Windows Explorer / "Map network drive"

The server answers `OPTIONS` with `MS-Author-Via: DAV` and
`DAV: 1, 2, ...`, which is what the Windows WebDAV mini-redirector needs
to offer editing. Remaining problems are on the Windows side:

1. **Basic over plain HTTP is refused by default.** Windows only allows
   Basic authentication over HTTPS. The registry value
   `HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters\BasicAuthLevel`
   controls it: `1` (default) = Basic only over HTTPS, `2` = also over
   plain HTTP, `0` = never. Do **not** set `2` outside a test network;
   serve DavNode over HTTPS instead. Restart the _WebClient_ service
   after changing it.
2. **The _WebClient_ service must be running** (`services.msc`), or
   mapping a drive fails with "network name cannot be found".
3. **A TLS certificate Windows trusts** is required for HTTPS; a
   self-signed certificate must be installed in the machine's trusted
   root store.
4. **File size limit.** The mini-redirector refuses files above
   `FileSizeLimitInBytes` (same `Parameters` key; default 50,000,000
   bytes, i.e. 50 MB). Raise it (maximum 4,294,967,295) and restart the
   _WebClient_ service. DavNode itself imposes no such limit beyond the
   configured quota.
5. **Non-standard ports** are written `\\host@8443\DavWWWRoot\dav\tenant\files`
   in `net use` / the Explorer address bar, or use the full
   `https://host:8443/dav/<tenant>/files/` URL when adding a network
   location.

If the native redirector keeps misbehaving, use a dedicated WebDAV client
(for example WinSCP, Cyberduck or rclone) instead of Explorer's built-in
one; for calendars and contacts on Android use DAVx5.
