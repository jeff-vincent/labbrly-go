// @ts-check

const config = {
  title: 'Lab Thingy',
  tagline: 'A software lab platform',
  url: 'https://subnode1.xyz',
  baseUrl: '/docs/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.svg',
  organizationName: 'lab-thingy',
  projectName: 'docs',
  presets: [
    [
      'classic',
      ({
        docs: {
          path: '.',
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          include: ['**/*.{md,mdx}'],
          exclude: [
            '**/node_modules/**',
            '**/build/**',
            '**/.docusaurus/**',
            '**/_*.{md,mdx}'
          ],
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],
  themeConfig: {
    navbar: {
      title: 'Lab Thingy',
      items: [
        { to: '/', label: 'Docs', position: 'left' },
        { href: 'https://github.com/', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Lab Thingy.`,
    },
  },
  plugins: [
    function mermaidCytoscapeAlias() {
      return {
        name: 'mermaid-cytoscape-alias',
        configureWebpack() {
          return {
            resolve: {
              alias: {
                'cytoscape/dist/cytoscape.umd.js': 'cytoscape',
              },
            },
          };
        },
      };
    },
  ],
};

module.exports = config;
