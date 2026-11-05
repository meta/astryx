// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'theme',
  title: 'Theming',
  category: 'guide',
  keywords: ['theme', 'theming', 'theme system', 'dark mode', 'defineTheme', 'provider'],
  description:
    'How to use and create themes: see Use a theme for applying themes, and Author a theme for creating and customizing them.',

  sections: [
    {
      id: 'quick-start',
      title: 'Wrap your app in a theme',
      content: [
        {
          type: 'prose',
          text: 'Install a theme, import it with the CLI, and wire the generated module once. For the full guide — available themes, integration themes, dark mode, nested themes, and production builds — see {@link generic:use-a-theme}.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Wire the generated module once',
          code: "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug} from './astryx-themes';\n\nfunction App() {\n  return (\n    <Theme theme={themes[defaultThemeSlug]}>\n      <YourApp />\n    </Theme>\n  );\n}",
        },
      ],
    },
    {
      id: 'creating-a-custom-theme',
      title: 'Create a custom theme',
      content: [
        {
          type: 'prose',
          text: 'Use `defineTheme` with token overrides, scale configs, and component style overrides. For the full guide — palette generation, extending themes, adaptations, custom variants, and production builds — see {@link generic:author-a-theme}.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Quick start',
          code: '{@command theme add stone}   # use an existing theme\n{@command theme eject stone} # fork its source to customize\n{@command theme build src/themes/stone/stoneTheme.ts}',
        },
        {
          type: 'prose',
          text: 'For a new coordinated color system, run `{@command theme palette generate palette.config.json --out palette.generated.ts}`. Review and commit the generated palette module and receipt, import its `palette` export, then reference stable stops from semantic tokens. Regenerating an accepted palette updates every mapped token that keeps those references; generation does not rewrite the theme.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Map semantic tokens to generated palette stops',
          code: "import {defineTheme} from '@astryxdesign/core/theme';\nimport {palette} from './palette.generated';\n\nconst myTheme = defineTheme({\n  name: 'my-theme',\n  tokens: {\n    '--color-background-surface': [\n      palette.neutral.light[100],\n      palette.neutral.dark[15],\n    ],\n  },\n});",
        },
      ],
    },
    {
      id: 'icon-sizes',
      title: 'Icon sizes',
      content: [
        {
          type: 'prose',
          text: "A theme sets the dimension of each Icon size in its stylesheet: `width` and `height` on `components.icon['size:sm']` (or `xsm`, `md`, `lg`) resize that size's glyph, for semantic icon names and SVG components passed to `Icon` alike. Give the dimension in `px` or `rem`: a semantic icon takes its font size from it, so an `em` value would also grow its box. A size the theme leaves alone stays 12, 16, 20, or 24px at a 16px root (`xsm`, `sm`, `md`, `lg`) and scales with the root font size; `rem` keeps that scaling. The four size names are fixed.",
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Set Icon size dimensions',
          code: "const brandTheme = defineTheme({\n  name: 'brand',\n  components: {\n    icon: {\n      'size:sm': {width: '1.125rem', height: '1.125rem'},\n      'size:lg': {width: '1.75rem', height: '1.75rem'},\n    },\n  },\n});",
        },
      ],
    },
    {
      id: 'light-dark-mode',
      title: 'Dark mode',
      content: [
        {
          type: 'prose',
          text: 'Light, dark, and system modes: {@link generic:use-a-theme}.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Light/dark tuple',
          code: "'--color-accent': ['#0064E0', '#2694FE'],\n//                   ^light     ^dark",
        },
      ],
    },
    {
      title: 'Integration themes',
      content: [
        {
          type: 'prose',
          text: 'Install an integration and Astryx discovers its themes automatically. Import one with `{@command theme add <name> --package <integration>}`. Use `theme eject` only for an independent source fork. For the full walkthrough, see {@link generic:use-a-theme}.',
        },
      ],
    },
  ],
};
