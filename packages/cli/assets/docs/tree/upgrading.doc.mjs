// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/ship/upgrading`: update an integration
 * package for each Astryx release, and the command apps run to upgrade with
 * it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'upgrading',
  placement: {parent: 'namespace:ship', slot: 'guides', order: 50},
  title: 'Upgrading',
  category: 'guide',
  keywords: ['upgrade apps', 'release notes'],
  description:
    'Update your package for each Astryx release, and help apps upgrade with it.',
  sections: [
    {
      id: 'update-for-a-new-astryx-release',
      title: 'Update for a new Astryx release',
      content: [
        {
          type: 'prose',
          text: 'When Astryx ships a release, bump your devDependencies, rerun the checks, widen your peer ranges, and ship a codemod for each change that breaks apps.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# 1. Build and test against the new release\n{@pm install @astryxdesign/cli@latest @astryxdesign/core@latest --dev}\n# 2. Rerun the checks\n{@command doctor integration validate}\n{@command doctor integration docs}\n{@command integration verify}\n# 3. Admit the new Core once the checks pass\n{@pm-only npm "edits package.json" pkg set \'peerDependencies.@astryxdesign/core=^0.6.0 || ^0.7.0\'}\n# 4. Migrate apps across a change that breaks them\n{@command integration add codemod rename-delay --to 0.7.0}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Run every check in {@link generic:checks}, not only the ones shown.',
            'Codemod folders are named for Core versions: {@link generic:codemods}.',
            'Release the result as a new version of your package; see {@link generic:publishing}.',
          ],
        },
      ],
    },
    {
      id: 'upgrade-an-app',
      title: 'Upgrade an app',
      content: [
        {
          type: 'prose',
          text: 'After an app installs a new Core, `{@command upgrade}` runs the codemods for the versions it crossed. It is a dry run by default; `--apply` writes the changes.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# Preview what would change; nothing is written\n{@command upgrade --from 0.6.3 --integration @acme/astryx-widgets}\n# Write the changes\n{@command upgrade --from 0.6.3 --integration @acme/astryx-widgets --apply}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'Integrations: @acme/astryx-widgets\n<n> codemods to run\nApplying integration codemods...\n  Rename AcmeCarousel delay to interval (v0.7.0, @acme/astryx-widgets)\n[ok]     [ok] src/Hero.tsx',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`--from` is the `@astryxdesign/core` version the app had before, and the target is the installed Core.',
            '`--integration` names your package. Without it, or an `integrations` entry in `astryx.config`, the upgrade skips your codemods, even when the app has your package installed.',
            "`<n>` includes Core's codemods for the same versions, which run first.",
            'Put this command in your release notes.',
          ],
        },
      ],
    },
    {
      id: 'know-which-files-upgrades-skip',
      title: 'Know which files upgrades skip',
      content: [
        {
          type: 'prose',
          text: 'Upgrades never write files that the app marks as generated, vendored, or ignored. When such a file still needs a codemod change, the upgrade stops with `ERR_CODEMOD_PROTECTED` and exit code 1.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Generated: an `@generated` comment at the top of the file, or `linguist-generated` in `.gitattributes`.',
            'Vendored: `linguist-vendored` in `.gitattributes`.',
            'Ignored: a match in `.gitignore` or `.hgignore`.',
          ],
        },
        {
          type: 'code',
          lang: 'text',
          code: '!     ! src/gen/Gen.tsx - protected by @generated in the leading comment block\nERR_CODEMOD_PROTECTED: 1 protected file still requires a codemod change:\n  src/gen/Gen.tsx — @generated in the leading comment block\nUpgrade incomplete: protected changes remain',
        },
        {
          type: 'prose',
          text: 'The upgrade still writes every other file. Its options and exit codes are in {@link command:upgrade}.',
        },
      ],
    },
  ],
};
