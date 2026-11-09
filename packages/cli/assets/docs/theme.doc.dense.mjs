// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsDense = {
  description: 'use + create themes: see use-a-theme and author-a-theme.',
  sections: [
    {
      section: 'Wrap your app in a theme',
      title: 'Quick start',
      content: [
        {type: 'prose', text: "Install a theme, wrap in `<Theme>` (`import {Theme} from '@astryxdesign/core/theme'`). {@link generic:use-a-theme} for full guide."},
      ],
    },
    {
      section: 'Create a custom theme',
      title: 'Custom themes',
      content: [
        {type: 'prose', text: '`defineTheme` + token overrides + component overrides. {@link generic:author-a-theme} for full guide.'},
        null,
        {type: 'prose', text: "new palette: `astryx theme palette generate palette.config.json --out palette.generated.ts` → review + commit module and receipt → `import {palette} from './palette.generated';` → map semantic tokens to stable stops such as `palette.neutral.light[100]` / `palette.neutral.dark[15]`. regeneration updates mapped roles; generation does not rewrite the theme."},
      ],
    },
    {
      section: 'Icon sizes',
      title: 'Icon sizes',
      content: [
        {type: 'prose', text: "theme sets each Icon size's glyph dimension: `width` + `height` on `components.icon['size:sm']` (or xsm/md/lg); semantic names + SVG components alike. px or rem only: a semantic icon takes its font size from the dimension, so em also grows its box. unstyled: xsm/sm/md/lg = 12/16/20/24px at 16px root, scale w/ root font size (rem keeps it). size names are fixed."},
        null,
      ],
    },
    {
      section: 'Dark mode',
      title: 'Dark mode',
      content: [
        {type: 'prose', text: "[light, dark] tuples, mode='system'. {@link generic:use-a-theme} for full guide."},
      ],
    },
    {
      section: 'Integration themes',
      title: 'Integration themes',
      content: [
        {type: 'prose', text: 'Install integration. `astryx theme add` imports, and `theme eject` forks source. {@link generic:use-a-theme} for full guide.'},
      ],
    },
  ],
};
