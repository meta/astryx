// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/ship/publishing`: publish an integration to
 * npm, use release tags, and check the package before and after.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'publishing',
  placement: {parent: 'namespace:ship', slot: 'guides', order: 40},
  title: 'Publish an integration',
  category: 'guide',
  keywords: ['publish an integration', 'npm publish', 'release'],
  description:
    'Publish your package to npm under the right release tag, checking it before and after.',
  sections: [
    {
      id: 'check-before-you-publish',
      title: 'Check before you publish',
      content: [
        {
          type: 'prose',
          text: 'Publish only a package that passes every check, then preview the upload with `{@pm-only npm "publishing goes through npm, which every Node install carries" publish --dry-run}`. The dry run lists the files and the tag without uploading.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration validate} && {@command doctor integration components} && {@command doctor integration templates} && {@command doctor integration docs} && {@command integration verify}\n{@pm-only npm "publishing goes through npm, which every Node install carries" publish --dry-run --access public}',
        },
        {
          type: 'code',
          lang: 'text',
          code: 'npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)\n+ @acme/astryx-widgets@1.0.0',
        },
        {
          type: 'prose',
          text: 'Set a new `version` for each release; {@link generic:versioning} covers what counts as breaking. What each check proves is in {@link generic:checks}.',
        },
      ],
    },
    {
      id: 'keep-private-files-out',
      title: 'Keep private files out',
      content: [
        {
          type: 'prose',
          text: 'With no `files` list, npm packs every file your ignore files do not exclude, including an old `.tgz` file or an `.env` file. List what ships instead.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: "{@pm-only npm \"edits package.json\" pkg set 'files[]=components' 'files[]=templates' 'files[]=themes' 'files[]=docs' 'files[]=codemods' 'files[]=astryx.integration.mjs'}\n{@pm-only npm \"builds the tarball npm publishes\" pack --dry-run}",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'List only the roots you ship, and always `astryx.integration.mjs`. npm adds package.json, and a README and LICENSE when you have them.',
            'Each later `integration add` appends its root to the list.',
            '`integration verify` fails when a root is missing from the list, and names the root to add to `files` (the message is in {@link generic:troubleshooting}).',
          ],
        },
      ],
    },
    {
      id: 'publish-to-npm',
      title: 'Publish to npm',
      content: [
        {
          type: 'prose',
          text: 'A scoped package is private by default, so publish it with `--access public`. Without `--tag`, npm tags the release `latest`, which is what `{@pm install @acme/astryx-widgets}` installs.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# Publish a release\n{@pm-only npm "publishing goes through npm, which every Node install carries" publish --access public}\n\n# Or set the access once in package.json\n{@pm-only npm "Yarn has no pkg command" pkg set publishConfig.access=public}',
        },
        {
          type: 'prose',
          text: 'To let apps try a release first, publish it under `next`, then point `latest` at it once ready.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# Only apps that ask for next get it: npm install @acme/astryx-widgets@next\n{@pm-only npm "publishing goes through npm, which every Node install carries" publish --tag next}\n\n# Make that version the default\n{@pm-only npm "dist-tags are set with npm, which every Node install carries" dist-tag add @acme/astryx-widgets@1.1.0 latest}\n{@pm-only npm "dist-tags are set with npm, which every Node install carries" dist-tag ls @acme/astryx-widgets}',
        },
      ],
    },
    {
      id: 'check-the-published-package',
      title: 'Check the published package',
      content: [
        {
          type: 'prose',
          text: 'Install the version you published in a clean app, and run the same commands you ran against the `.tgz` file.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'mkdir check-release && cd check-release\n{@pm-only npm "npm, which every Node install carries, writes the package.json" init -y}\n{@pm install @astryxdesign/core @astryxdesign/cli @acme/astryx-widgets@1.0.0}\n{@command component AcmeCarousel}\n{@command doctor integration validate @acme/astryx-widgets}',
        },
        {
          type: 'prose',
          text: 'The full list of commands to run in an app is in {@link generic:test-in-an-app}. To help apps move to the new version, see {@link generic:upgrading}.',
        },
      ],
    },
  ],
};
