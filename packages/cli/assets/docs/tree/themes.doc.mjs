// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes`: author a theme
 * in an integration; apps install, apply, and extend it like any theme.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'themes',
  placement: {parent: 'namespace:building-blocks', slot: 'guides', order: 30},
  title: 'Themes',
  summary:
    'Author a theme in your integration; apps install, apply, and extend it like any theme.',
  keywords: [
    'integration theme',
    'ship a theme',
    'define theme',
    'theme palette',
    'extend a theme',
  ],
  blocks: [
    {
      type: 'prose',
      text: 'In global mode: outside projects, the theme list includes themes from integrations installed for the computer, and `theme add` there only shows them; inside a project, it lists only themes from integrations the project installs. See {@link namespace:global} and {@link generic:global-integrations}.',
    },
    {
      type: 'prose',
      text: 'A theme contribution has editable `defineTheme` source plus a built module and production CSS. `integration add theme` scaffolds the source and declares the package exports; `theme build` writes the built outputs. An app installs the package, runs `theme add`, applies the theme from its generated app module, and customizes it with `extends` instead of copying source.',
    },
    {
      type: 'prose',
      text: 'These guides cover the whole path: scaffold the source, generate its palette, define and build the theme, ship fonts and assets, run `integration verify`, and document how apps add and extend it. Applying a theme, including mode and SSR, works the same for every theme; see {@link generic:use-a-theme}.',
    },
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic']},
    },
  },
};
