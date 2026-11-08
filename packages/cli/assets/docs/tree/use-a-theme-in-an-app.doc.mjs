// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes/use-a-theme-in-an-app`:
 * an app installs the integration and applies or extends the theme, like any theme.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'use-a-theme-in-an-app',
  placement: {parent: 'namespace:themes', slot: 'guides', order: 40},
  title: 'Use and extend the theme',
  category: 'guide',
  description:
    'An app installs the integration and applies or extends your theme, the same as any theme.',
  sections: [
    {
      id: 'apply-the-theme',
      title: 'Apply the theme',
      content: [
        {
          type: 'prose',
          text: 'Install the integration, then run `theme add` with its slug and package. The command records the package owner and regenerates one app theme module that imports the built theme, production CSS, and optional font CSS. Use `theme eject` only to copy source into an independent local fork.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@pm install @acme/astryx-widgets}\n{@command theme add ocean --package @acme/astryx-widgets}',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from './astryx-themes';

<Theme theme={themes[defaultThemeSlug]}>
  <App />
</Theme>`,
        },
        {
          type: 'prose',
          text: '`theme list` shows the available, added, and default themes. Use `theme use <slug>` to change the default, `theme remove <slug>` to stop importing one, and `theme eject <slug>` only when the app needs an independent source fork. Applying a theme — `mode`, SSR, and the production build — works the same for every theme; see {@link generic:use-a-theme}.',
        },
      ],
    },
    {
      id: 'extend-the-theme',
      title: 'Extend to customize',
      content: [
        {
          type: 'prose',
          text: 'For ordinary customization, do not copy the package source. Import the built theme and derive a new one with `defineTheme({extends: importedTheme, ...})`, overriding only the tokens the app changes. Use `theme eject` only when the app must own an independent source fork. See {@link generic:define-the-theme}.',
        },
        {
          type: 'code',
          lang: 'ts',
          code: `import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from '@acme/astryx-widgets/themes/ocean';

export const productTheme = defineTheme({
  name: 'product',
  extends: oceanTheme,
  tokens: {'--color-accent': ['#0051a3', '#4aa3ff']},
});`,
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: install the theme package in each app that uses the theme; inside a project, the CLI ignores packages installed for the computer. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
