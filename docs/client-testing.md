# Testing a client against DavNode

A repeatable checklist so that anyone can produce a result for the
[compatibility matrix](client-compatibility.md#compatibility-matrix). Use a
test tenant, HTTPS, and a DavNode release (note its version).

## Preparation

1. Start DavNode (see the [README](../README.md)); create a tenant, an admin
   and **two** users, `alice` and `bob`. Set `DAVNODE_DEFAULT_TENANT` if you
   want plain user names.
2. Keep the server log open (`docker compose logs -f app`).

## Checklist

Mark each line ✅ (works), ⚠️ (works with a workaround or a flaw), ❌
(fails) or — (client cannot do this).

| #   | Step                                                                                        |
| --- | ------------------------------------------------------------------------------------------- |
| 1   | **Discovery:** add the account with only host, user and password                            |
| 2   | **Contacts:** the address book appears; create, edit, delete a contact                      |
| 3   | **Calendar:** the calendar appears; create an event, a recurring event and an all-day event |
| 4   | Edit and delete the events; the server shows the change                                     |
| 5   | **Sync:** change data with a second client (or `curl`); the first client picks it up        |
| 6   | **Invitation:** as alice invite bob; bob receives it and accepts; alice sees the reply      |
| 7   | **Files** (Explorer, Finder, `rclone`, Cyberduck): list, upload, overwrite, rename, delete  |
| 8   | Wrong password gives a clear error, not a hang                                              |
| 9   | After re-adding the account, nothing is duplicated                                          |

## Reporting

Open a
[client compatibility report](https://github.com/kaigothe/DavNode/issues/new?template=client_compatibility.yml)
with the client and DavNode versions, the result per step, and the relevant
server log lines (remove passwords and personal data). A failing step becomes
a `client-compat` issue; a fix needs a regression test.

## Rules for the matrix

- A cell is ✅ only with a report that covers the step, dated and with the
  DavNode version. No report: "not tested".
- A result applies to the versions named; newer client versions need a new
  report.
