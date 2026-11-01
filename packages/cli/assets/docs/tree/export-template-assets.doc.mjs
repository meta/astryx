// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/package-and-test/export-template-assets`:
 * expose and include everything a copied template imports, and declare the
 * packages it needs.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'export-template-assets',
  placement: {
    parent: 'namespace:package-and-test',
    slot: 'guides',
    order: 10,
  },
  title: 'Export the template and assets',
  category: 'guide',
  description:
    'Make sure the published package contains and exposes everything the copied template imports.',
  sections: [
    {
      id: 'keep-the-generated-template-export',
      title: 'Keep the generated template export',
      content: [
        {
          type: 'prose',
          text: '`integration verify` resolves each template through a public package path without a file extension, such as `./templates/acme-dashboard`, and fails when that path is missing.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `{
  "exports": {
    "./templates/acme-dashboard": "./templates/acme-dashboard.tsx"
  }
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`integration add` writes this entry when `package.json` has an `exports` map ({@link generic:start-a-template}). Without a map it writes nothing, because creating one would make existing deep imports private. Add the map yourself, then the entry.',
            'Keep the public path without `.tsx`. Only the target file ends in `.tsx`.',
            'Do not point the entry at a barrel file that loses the template default export.',
          ],
        },
      ],
    },
    {
      id: 'export-package-owned-support-files',
      title: 'Export package-owned support files',
      content: [
        {
          type: 'prose',
          text: 'Add a public path for every package-owned component, helper, icon, or stylesheet that the copied source imports. Keep implementation-only files private.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'Relevant package.json entries',
          code: `{
  "exports": {
    "./templates/acme-dashboard": "./templates/acme-dashboard.tsx",
    "./components/AcmeStatusCard": "./components/AcmeStatusCard.tsx",
    "./icons/AcmePulseIcon": "./icons/AcmePulseIcon.tsx",
    "./styles/acme-dashboard.css": "./styles/acme-dashboard.css"
  }
}`,
        },
        {
          type: 'prose',
          text: 'If a block is also loaded directly as a live `.tsx` preview, add a pattern that keeps the extension, such as `"./templates/*.tsx": "./templates/*.tsx"`. Keep the generated entry too; `integration verify` resolves the template through it.',
        },
      ],
    },
    {
      id: 'include-every-file',
      title: 'Include every file',
      content: [
        {
          type: 'prose',
          text: 'An export can point to a file that npm leaves out. When `package.json#files` exists, list the integration manifest, the templates directory, and every directory the copied file depends on.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `{
  "files": [
    "astryx.integration.mjs",
    "templates",
    "components",
    "icons",
    "styles",
    "assets/fonts"
  ],
  "sideEffects": ["**/*.css"]
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`integration add` appends the manifest and templates directory when a `files` list already exists. Add the other directories yourself.',
            'If `package.json` sets `sideEffects`, include CSS in it, as above, so bundlers keep side-effect stylesheet imports.',
            'Run `{@pm-only npm "the tarball the registry receives" pack --dry-run}` and read the real file list instead of reasoning from the workspace.',
          ],
        },
      ],
    },
    {
      id: 'declare-what-the-copied-file-imports',
      title: 'Declare what the copied file imports',
      content: [
        {
          type: 'prose',
          text: 'A copied file imports from the app, so the app must install every package it imports. Declare the Astryx peers as described in {@link generic:versioning}. For other packages:',
        },
        {
          type: 'table',
          headers: ['Field', 'Use it for'],
          rows: [
            [
              '`peerDependencies`',
              'Libraries the copied source imports, such as an icon library. List them in `devDependencies` too, so the package itself builds.',
            ],
            [
              '`dependencies`',
              'Runtime packages used only by package-owned modules, which should travel with the integration',
            ],
            [
              '`devDependencies`',
              'Everything needed to build and test the integration itself',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Use only ranges you test. A package that resolves only because a workspace hoisted it is not declared.',
        },
      ],
    },
  ],
};
