// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/package-and-test/verify-packed-template`:
 * what `integration verify` checks for templates, and what it leaves to the
 * app test.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'verify-packed-template',
  placement: {
    parent: 'namespace:package-and-test',
    slot: 'guides',
    order: 20,
  },
  title: 'Verify the packed package',
  category: 'guide',
  description:
    'Catch missing files, exports, and CLI requirements before you publish, and know what still needs the app test.',
  sections: [
    {
      id: 'run-the-package-check',
      title: 'Run the package check',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration verify}',
        },
        {
          type: 'prose',
          text: '`integration verify` runs `{@pm-only npm "the tarball the registry receives" pack}`, including lifecycle scripts, unpacks the `.tgz` file into a temporary app without installing its dependencies, and checks the unpacked integration. It publishes nothing and removes the `.tgz` file and the temporary app.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'It validates the manifest, every template doc, its source file, and the templates directory.',
            'It checks that the manifest and every template file are in the `.tgz` file.',
            'It checks that each packed template keeps the same id, type, `name`, and `replaces` as your working copy. It does not compare template source or other doc fields.',
            'It resolves each template through its public package path in the unpacked package.',
            'It checks that the resolved template module has a default export.',
            'It checks the CLI peer that features such as template replacement require.',
          ],
        },
        {
          type: 'prose',
          text: 'Each failure prints a `[fail]` line with its message; add `--json` to see each issue code. {@link generic:troubleshooting} lists the common messages and their fixes. Fix every error, and review every warning before publishing.',
        },
      ],
    },
    {
      id: 'know-what-it-does-not-prove',
      title: 'Know what it does not prove',
      content: [
        {
          type: 'prose',
          text: '`integration verify` checks the packed templates and their public entrypoints. It does not copy a template into an app or run a browser build, so it cannot show the following.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Whether a relative helper or stylesheet survives the copy.',
            'Whether the copied file type-checks in every supported app toolchain.',
            'Whether package-owned CSS, fonts, icons, images, or media load in a browser.',
            'Whether layout, color modes, keyboard and pointer input, and real content work.',
            'Whether a template id collides with Core, or whether a `replaces` target exists. Run `{@command doctor integration templates}` for those.',
            'How the template scores on quality.',
          ],
        },
      ],
    },
  ],
};
