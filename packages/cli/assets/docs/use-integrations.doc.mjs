// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'use-integrations',
  title: 'Use integrations',
  category: 'guide',
  description:
    'Install, discover, and use integration packages that add components, templates, themes, and docs to your app.',
  keywords: [
    'install an integration',
    'add an integration',
    'install a package',
    'use an integration',
    'discover integrations',
    'integration',
    'package',
    'third party',
    'plugin',
    'extension',
  ],

  sections: [
    {
      title: 'Discover integrations',
      content: [
        {
          type: 'prose',
          text: 'Integration packages extend Astryx with extra components, templates, themes, docs, and codemods. They are published as regular npm packages.',
        },
        {
          type: 'prose',
          text: 'Search for what you need:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx search carousel\nastryx discover',
        },
        {
          type: 'prose',
          text: '`search` looks across everything the CLI knows (components, docs, templates, themes, and hooks), so a word like "carousel" finds it whether it is a component, a template, or a doc page. `discover` lists every integration the project has, and, with a discover source, packages it could add.',
        },
      ],
    },
    {
      title: 'Install an integration',
      content: [
        {
          type: 'prose',
          text: 'Install the package with your package manager. Integrations autolink: the CLI finds them among your dependencies, so installing is all it takes:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @acme/brand-integration}',
        },
        {
          type: 'prose',
          text: 'Run `astryx doctor` to confirm everything is wired up. If you need to load a package that is not a direct dependency, add it explicitly to `astryx.config.mjs`:',
        },
        {
          type: 'code',
          lang: 'js',
          label: 'Optional: explicit config entry',
          code: "export default {\n  integrations: ['@acme/brand-integration'],\n};",
        },
      ],
    },
    {
      title: 'Use what it adds',
      content: [
        {
          type: 'prose',
          text: 'Once installed, the integration\'s contributions appear alongside Core:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`astryx component --list` shows its components next to Core components.',
            '`astryx template --list` includes its page and block templates.',
            '`astryx theme list` lists its themes; add one with `astryx theme add <slug> --package @acme/brand-integration`.',
            '`astryx docs` shows any guides it provides.',
            '`astryx search <query>` finds everything, from every installed integration.',
          ],
        },
        {
          type: 'prose',
          text: 'Import components at the subpath the integration documents. Run `astryx component <Name>` to see the exact import:',
        },
        {
          type: 'code',
          lang: 'jsx',
          code: "import {AcmeCarousel} from '@acme/brand-integration/components/AcmeCarousel';",
        },
        {
          type: 'prose',
          text: 'For themes, see {@link generic:use-a-theme}. To build an integration of your own, see {@link namespace:authoring}.',
        },
      ],
    },
    {
      title: 'Check for problems',
      content: [
        {
          type: 'prose',
          text: 'Run `astryx doctor` to see integration issues: missing roots, invalid contributions, or a CLI version mismatch. The doctor check is the one place every issue for every package is listed.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx doctor',
        },
      ],
    },
  ],
};
