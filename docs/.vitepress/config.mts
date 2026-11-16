import { defineConfig } from 'vitepress';

const repo = 'https://github.com/lethucthanhtu/zalo-beeper-bridge';

// GitHub Pages serves the site under /<repo>/; a custom domain or local preview uses '/'.
const base = (process.env.DOCS_BASE ?? '/') as `/${string}/` | '/';

export default defineConfig({
  title: 'zalo-beeper-bridge',
  description: 'Self-hosted Matrix bridge that brings a personal Zalo account into Beeper.',
  lang: 'en-US',
  base,
  cleanUrls: true,
  lastUpdated: true,
  // Internal planning notes live next to the docs but are never published.
  srcExclude: ['*-plan.md'],
  head: [['meta', { name: 'theme-color', content: '#0068ff' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/what-is-it', activeMatch: '/guide/' },
      { text: 'Deployment', link: '/deployment/container', activeMatch: '/deployment/' },
      { text: 'History import', link: '/history-import/', activeMatch: '/history-import/' },
      { text: 'Reference', link: '/reference/architecture', activeMatch: '/reference/' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is it?', link: '/guide/what-is-it' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Features', link: '/guide/features' },
        ],
      },
      {
        text: 'Using the bridge',
        items: [
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Bot commands', link: '/guide/bot-commands' },
          { text: 'How it works', link: '/guide/how-it-works' },
          { text: 'Multiple accounts', link: '/guide/multiple-accounts' },
        ],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Container (Docker / Podman)', link: '/deployment/container' },
          { text: 'macOS (launchd)', link: '/deployment/macos-launchd' },
          { text: 'Operations', link: '/deployment/operations' },
        ],
      },
      {
        text: 'History import',
        items: [
          { text: 'Overview', link: '/history-import/' },
          { text: 'Quick start', link: '/history-import/quick-start' },
          { text: 'Manual steps', link: '/history-import/manual' },
          { text: 'Importer CLI', link: '/history-import/importer-cli' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'FAQ', link: '/faq' },
          { text: 'Security & privacy', link: '/security' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/reference/architecture' },
          { text: 'Database schema', link: '/reference/database' },
          { text: 'Logs', link: '/reference/logs' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Development', link: '/contributing/development' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: {
      message: 'MIT licensed. Not affiliated with Zalo/VNG or Beeper.',
      copyright: 'Copyright © Le Thuc Thanh Tu and contributors',
    },
  },
});
