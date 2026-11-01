// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/codemods`: add codemods to an
 * integration package, and know which of them `astryx upgrade` runs in an app.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'codemods',
  placement: {parent: 'namespace:building-blocks', slot: 'guides', order: 50},
  title: 'Codemods',
  category: 'guide',
  keywords: ['breaking change', 'migrate apps', 'integration codemod'],
  description:
    'Ship codemods that `{@command upgrade}` runs to migrate app code, and know which of them an app runs.',
  sections: [
    {
      id: 'add-a-codemod',
      title: 'Add a codemod',
      content: [
        {
          type: 'prose',
          text: '`integration add codemod` writes a codemod into a folder named after a version. Apps run it with `{@command upgrade}` to migrate their code.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add codemod rename-delay --to 0.7.0}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `codemods/
  0.7.0/
    rename-delay.mjs         # the codemod
    rename-delay.test.mjs    # skipped: a test file
    __tests__/               # skipped: a test folder`,
        },
        {
          type: 'prose',
          text: "The first add declares `codemods: './codemods'` in `astryx.integration.mjs`. The codemod's id is its path inside the version folder, without the extension: `rename-delay`. An id must be unique across all version folders in the package.",
        },
        {
          type: 'prose',
          text: 'The loader skips `*.test.*`, `*.spec.*`, and `*.fixture.*` files and everything under `__tests__/` or `__fixtures__/`, so tests can sit beside the codemod. The folder name decides when an app runs the codemod; see "Choose when a codemod runs".',
        },
      ],
    },
    {
      id: 'write-the-transform',
      title: 'Write the transform',
      content: [
        {
          type: 'prose',
          text: 'A codemod default-exports a plain object with a `type`, a `title`, and a `transform` function. `transform` returns the new source, or `null` to leave the file as it is.',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// codemods/0.7.0/rename-delay.mjs
/** @type {import('@astryxdesign/cli/authoring').AstryxCodemod} */
export default {
  type: 'code',
  title: 'Rename AcmeCarousel delay to interval',
  description: 'Renames the delay prop on AcmeCarousel.',
  fileExtensions: ['.tsx', '.jsx'],
  transform(file, api) {
    const j = api.jscodeshift;
    const root = j(file.source);
    const props = root
      .find(j.JSXOpeningElement, {name: {name: 'AcmeCarousel'}})
      .find(j.JSXAttribute, {name: {name: 'delay'}});
    if (props.size() === 0) return null;
    props.forEach(path => {
      path.node.name.name = 'interval';
    });
    return root.toSource();
  },
};`,
        },
        {
          type: 'prose',
          text: "`type: 'code'` rewrites the app's source files that match `fileExtensions`. `type: 'config'` rewrites the app's `astryx.config` file instead, and runs before code codemods. `title` shows in the upgrade output, and `api.jscodeshift` is a jscodeshift instance for the file. Every field is in {@link schema:codemod}.",
        },
      ],
    },
    {
      id: 'which-codemods-run',
      title: 'Choose when a codemod runs',
      content: [
        {
          type: 'prose',
          text: "Two rules decide whether an app's `{@command upgrade}` runs your codemods: the app's Core versions, and whether the app names your package.",
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            "Version folders are matched against the app's `@astryxdesign/core` versions, not your package's version. `upgrade --from <version>` runs each folder above `--from`, up to and including the Core version installed in the app. With Core 0.7.0 installed, `--from 0.6.3` runs `0.7.0/`, and `--from 0.7.0` runs nothing. A folder named after your own release, such as `1.0.0/`, waits until the app has Core 1.0.0.",
            '`upgrade` runs your codemods only when the app lists your package in `integrations` in its `astryx.config`, or passes `--integration @acme/astryx-widgets`. Having your package installed is not enough: the run then skips your codemods with no warning.',
          ],
        },
      ],
    },
    {
      id: 'run-codemods-in-an-app',
      title: 'Run codemods in an app',
      content: [
        {
          type: 'prose',
          text: 'An app previews codemods with `{@command upgrade}` and writes the changes with `--apply`. Without `--apply`, nothing on disk changes.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `# Preview each codemod and the files it would change
{@command upgrade --from 0.6.3 --integration @acme/astryx-widgets}
# Write the changes
{@command upgrade --from 0.6.3 --integration @acme/astryx-widgets --apply}`,
        },
        {
          type: 'code',
          lang: 'text',
          code: `Integrations: @acme/astryx-widgets
<n> codemods to run (dry run)
Applying integration codemods...
  Rename AcmeCarousel delay to interval (v0.7.0, @acme/astryx-widgets)
!     ~ src/Hero.tsx (would change)`,
        },
        {
          type: 'prose',
          text: "`<n>` counts Core's codemods for the same versions too: they run first and print above `Integrations:`. To run only yours, as when you test it, add `--codemod rename-delay`.",
        },
        {
          type: 'prose',
          text: '`--from` is the Core version the app had before it upgraded. The run scans `./src` unless the app passes `--path`, and it never writes a file the app marks as generated, vendored, or ignored; see {@link command:upgrade}. `upgrade --list` shows only Core codemods.',
        },
        {
          type: 'prose',
          text: "An integration manifest has no `hooks` field. Commands that run after codemods, such as a formatter, are the app's to set, in `hooks.postCodemod` in its `astryx.config`.",
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: inside an app, `upgrade` runs with the release equal to the app's Core, whichever copy of the CLI the user starts, and only the codemods of integrations the app installs run. Outside a project, `upgrade` lists codemods and migrates nothing. See {@link namespace:global} and {@link command:upgrade}.",
        },
      ],
    },
  ],
};
