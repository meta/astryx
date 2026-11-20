// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsDense = {
  description:
    "how themes work: wrap app in a theme; make one from traits: astryx experimental theme create <name> --traits '<json>'; edit the file; astryx experimental theme check <name> --fix after every edit; steps follow, then publish a theme for other teams.",
  sections: [
    {
      section: 'Make or change a theme',
      title: 'Make or change a theme',
      content: [
        {
          type: 'prose',
          text: "make a theme: experimental theme create <name> --traits '<json>' (fields in --help: look, page, surface, text, accent, bar, font, corners, density, borders, shadows, surfaces; exact tokens, components win) = complete file, every color light+dark, built + app's theme; then the file is yours: edit any line. drill into one part: experimental theme editor how \"<ask>\" names the part, what it reads, the line that changes it.",
        },
      ],
    },
    {
      section: 'Check after each edit',
      title: 'Check after each edit',
      content: [
        {
          type: 'prose',
          text: 'after each edit: experimental theme check <name> --fix (light + dark: unreadable text, see-through menus, hidden edges, half-painted page; --fix writes normal lines in your file); not done until check passes.',
        },
      ],
    },
    {
      section: 'A denser or roomier app',
      title: 'A denser or roomier app',
      content: [
        {
          type: 'prose',
          text: 'denser/roomier app = theme: density trait compact|roomy, or spacing tokens in the file; check again. not page code.',
        },
      ],
    },
    {
      section: 'One kind of part',
      title: 'One kind of part',
      content: [
        {
          type: 'prose',
          text: "one kind of part (sidebar, its selected item, form gaps) = theme too: components['<part>'] in the file (theme targets lists parts); check again.",
        },
      ],
    },
    {
      section: 'No app yet',
      title: 'No app yet',
      content: [
        {
          type: 'prose',
          text: 'experimental theme preview app <dir> = starter app showing the theme. use + create themes: see use-a-theme and author-a-theme.',
        },
      ],
    },
    {
      section: 'Share a theme with other teams',
      title: 'Share a theme with other teams',
      content: [
        {
          type: 'prose',
          text: 'publish a theme for other teams: ship it in a package (theme in its themes folder, built with {@command theme build}, published like any package); another team installs it, runs {@command theme add <name> --package <package>}. {@link generic:add-a-theme}.',
        },
      ],
    },
    {
      section: 'Wrap your app in a theme',
      title: 'Quick start',
      content: [
        {
          type: 'prose',
          text: "Install a theme, wrap in `<Theme>` (`import {Theme} from '@astryxdesign/core/theme'`). {@link generic:use-a-theme} for full guide.",
        },
      ],
    },
    {
      section: 'Create a custom theme',
      title: 'Custom themes',
      content: [
        {
          type: 'prose',
          text: '`defineTheme` + token overrides + component overrides. {@link generic:author-a-theme} for full guide.',
        },
        null,
        {
          type: 'prose',
          text: "new palette: `astryx theme palette generate palette.config.json --out palette.generated.ts` → review + commit module and receipt → `import {palette} from './palette.generated';` → map semantic tokens to stable stops such as `palette.neutral.light[100]` / `palette.neutral.dark[15]`. regeneration updates mapped roles; generation does not rewrite the theme.",
        },
      ],
    },
    {
      section: 'Icon sizes',
      title: 'Icon sizes',
      content: [
        {
          type: 'prose',
          text: "theme sets each Icon size's glyph dimension: `width` + `height` on `components.icon['size:sm']` (or xsm/md/lg); semantic names + SVG components alike. px or rem only: a semantic icon takes its font size from the dimension, so em also grows its box. unstyled: xsm/sm/md/lg = 12/16/20/24px at 16px root, scale w/ root font size (rem keeps it). size names are fixed.",
        },
        null,
      ],
    },
    {
      section: 'Dark mode',
      title: 'Dark mode',
      content: [
        {
          type: 'prose',
          text: "[light, dark] tuples, mode='system'. A one-mode theme exports `colorModes`; wire `mode={themeModes[defaultThemeSlug] ?? 'system'}`. {@link generic:use-a-theme} for full guide.",
        },
      ],
    },
    {
      section: 'Integration themes',
      title: 'Integration themes',
      content: [
        {
          type: 'prose',
          text: 'Install integration. `astryx theme add` imports, and `theme eject` forks source. {@link generic:use-a-theme} for full guide.',
        },
      ],
    },
  ],
};
