# Launch kit

Drafts and checklists for announcing DavNode. **Nothing here is published
automatically**; the maintainer posts, in the order and at the time of their
choosing. Do not post before the pre-flight list is green.

## Pre-flight

- [ ] The release image is published and the README quick start uses it
      (see `deploy/README.md`); a fresh VM went from zero to a working login in
      under 5 minutes (time it).
- [ ] The [compatibility matrix](../client-compatibility.md) has results from
      real clients (at least 3 external reports) and the README status
      paragraph says so.
- [ ] GitHub settings done: Discussions on, private vulnerability reporting
      on, topics and social preview set, `container-release` environment
      reviewers configured, branch protection on `main`.
- [ ] The commands in the article work from a clean machine.
- [ ] A way to be contacted that you will actually read.

## Order

1. Announcement article on a blog or the GitHub Discussions "Announcements".
2. Show HN and r/selfhosted on a weekday morning (US/European time) when you
   can answer comments for several hours.
3. Directories ([directories.md](directories.md)) in the days after, using the
   same text.

## Rules of thumb

- Lead with a concrete result (one command, a working calendar), not
  adjectives. State limits yourself before others do.
- Ask a specific question ("which client should I test next?").
- Follow each community's self-promotion rules; do not post the same text in
  many places on the same day.
- Answer every comment and issue in the first days; turn repeated questions
  into documentation.
