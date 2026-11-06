// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes/add-a-theme`:
 * scaffold a theme in a package — blank, or forked from an existing theme.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'add-a-theme',
  placement: {parent: 'namespace:themes', slot: 'guides', order: 10},
  title: 'Add a theme',
  category: 'guide',
  description:
    'Scaffold a theme in your package — blank, or forked from an existing theme.',
  sections: [
    {
      id: 'add-a-theme',
      title: 'Add a theme',
      content: [
        {
          type: 'prose',
          text: 'Run `integration add theme` with a lowercase kebab-case slug. It writes a blank theme — a `defineTheme` skeleton and its descriptor — into a folder named after the slug.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add theme ocean}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `theme contribution added

[ok] ocean

Declare theme root ./themes in astryx.integration.mjs.

- themes/ocean/oceanTheme.ts
- themes/ocean/oceanTheme.doc.mjs
- package.json
- astryx.integration.mjs`,
        },
        {
          type: 'prose',
          text: '`oceanTheme.ts` exports `oceanTheme`, a `defineTheme` source, and `oceanTheme.doc.mjs` is the descriptor that `theme list` reads. The command also declares `./themes/ocean` and `./themes/ocean.css` package exports. Every field is in {@link schema:theme-doc}.',
        },
        {
          type: 'prose',
          text: 'The source and built outputs ship in your package. Build the source with `theme build`, then run `integration verify` before publishing. An app runs `theme add` to record and import the built module and stylesheets; `theme eject` creates an independent source fork. See {@link generic:use-a-theme-in-an-app}.',
        },
      ],
    },
    {
      id: 'start-from-an-existing-theme',
      title: 'Start from an existing theme',
      content: [
        {
          type: 'prose',
          text: 'To begin from an existing theme instead of a blank one, pass `--from`. It copies that theme as your starting point to diverge from — a fork, with no link back.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command integration add theme ocean --from neutral}',
        },
        {
          type: 'prose',
          text: 'The copy keeps the packages the base theme uses, such as `lucide-react` for its icons: `--from` adds them to your `dependencies`, so an app that installs your package gets them too. Install your dependencies again before you build the theme.',
        },
        {
          type: 'prose',
          text: 'Use `--from` when you want to change a lot. For a small change that should stay linked to a base theme, use `extends` instead ({@link generic:define-the-theme}).',
        },
      ],
    },
    {
      id: 'ship-several-themes',
      title: 'Ship several themes',
      content: [
        {
          type: 'prose',
          text: 'A package can ship more than one theme. Run `integration add theme` once per slug; each theme gets its own folder and descriptor, and `theme list` shows them all.',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: when users install your package for their computer, beside the global CLI, your themes are listed in folders outside any project, where `theme add` lists but writes nothing; inside a project, only if the project installs your package. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
