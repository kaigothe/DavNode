import path from 'node:path';
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/kaigothe/DavNode';

// Documents link to files outside docs/ (README, LICENSE, scripts, ...) with
// relative paths that work on GitHub. On the site those would be dead, so
// point them at the repository instead.
function repoLinks(md) {
  md.core.ruler.push('davnode-repo-links', (state) => {
    const relativePath = state.env.relativePath ?? '';
    const dir = path.posix.dirname(relativePath);
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        if (token.type !== 'link_open') continue;
        const href = token.attrGet('href');
        if (!href || !href.startsWith('../')) continue;
        const [target, hash] = href.split('#');
        const repoPath = path.posix.join('docs', dir, target);
        if (repoPath.startsWith('docs/') || repoPath.startsWith('..')) continue;
        token.attrSet(
          'href',
          `${repo}/blob/main/${repoPath}${hash ? `#${hash}` : ''}`,
        );
      }
    }
  });
}

const base = process.env.DOCS_BASE ?? '/DavNode/';

export default defineConfig({
  title: 'DavNode',
  description: 'Self-hosted WebDAV, CalDAV and CardDAV server',
  base,
  // Files in docs/public are copied as they are; head links are not given the
  // base by VitePress, so it is added here.
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
  ],
  cleanUrls: true,
  srcExclude: ['api/**', 'launch/**', 'positioning.md', 'assets/README.md'],
  lastUpdated: true,
  markdown: { config: repoLinks },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/' },
      { text: 'Operations', link: '/operations/handbook' },
      { text: 'GitHub', link: repo },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Compared with others', link: '/comparison' },
          { text: 'Client compatibility', link: '/client-compatibility' },
          { text: 'Testing a client', link: '/client-testing' },
          { text: 'Migrating to DavNode', link: '/migration' },
        ],
      },
      {
        text: 'Operating',
        items: [
          { text: 'Operations handbook', link: '/operations/handbook' },
          { text: 'Backup and restore', link: '/operations/backup' },
          { text: 'Upgrading', link: '/upgrade' },
          { text: 'Verifying the image', link: '/operations/verify-image' },
          { text: 'Security model', link: '/security' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Admin UI', link: '/admin-ui' },
          { text: 'Admin API (OpenAPI)', link: '/admin-api' },
          { text: 'Conformance', link: '/conformance' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
      {
        text: 'For organisations',
        items: [
          { text: 'Fact sheet', link: '/enterprise-fact-sheet' },
          { text: 'Licensing', link: '/licensing' },
          { text: 'Maintenance policy', link: '/maintenance' },
          { text: 'Support', link: '/support' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: { message: 'Released under the AGPL-3.0-only licence.' },
  },
});
