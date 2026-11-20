// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme create`. */

import {TRAIT_FIELDS} from '../../../api/theme-edit/_trait-fields.mjs';

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme create',
  displayName: 'astryx experimental theme create',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Write a new theme from a few typed traits, make it the app theme, and check it',
  description:
    "Writes a new theme from a few typed traits: look, page, surface, text, accent, bar, font, corners, density, borders, shadows, surfaces, and exact tokens and components, which win over the rest. It writes src/themes/<name>/<camelName>Theme.ts (`my-brand` writes myBrandTheme.ts): one defineTheme() file with the colors the traits give, Core's corner, spacing, size, type, border and shadow values (each font with the fallbacks of its kind, and a note on the package that loads it), and the part styles the traits ask for; the surfaces trait is the surfaces dial's own styles, written once and spread by each part the dial reaches (a colored card's variants keep their own fill). A bar in one color that is the page's own color in its mode (a white bar on a white page), with no text of its own, takes the theme's surface in the other mode and keeps the theme's text. Any other top bar paints its own fill (a light one-color bar takes, in dark, its own hue dark enough for white text) and gives what is drawn straight on it the bar's text, a quieter text that still reads for items at rest, and its own pointer and press tints (black in light and white in dark, as Core tints). When no text reads on the bar and its lightest tints, the bar's own color moves in lightness (its hue kept), and the tints may come down below Core's strength to the least that still shows; both are said in the result's notes. A one-look theme exports `colorModes`, so the app shows it in that mode. Then it builds the file with the theme build, adds it to the app and makes it the default (as `experimental theme add` and `use` do), and runs `experimental theme check <name> --fix` on it, which fills every other color in light and dark from the colors the file sets; the result's `check` is that run's data. The file is yours: edit any line, then run `experimental theme check <name>`. Once written, the file is never written again: a second run with the name stops with ERR_FILE_EXISTS and writes nothing (edit the file and check it, or pick another name). Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditCreate',
  args: [
    {
      name: 'name',
      param: 'name',
      required: true,
    },
  ],
  options: [
    {
      flag: '--traits <json>',
      param: 'traits',
      description: `The look, as JSON or a .json file. Every field is optional; a color is "#hex" or {"light": "#hex", "dark": "#hex"}; an unknown field is refused with this list (ERR_INVALID_ARGUMENT). ${TRAIT_FIELDS.map(([name, takes]) => `${name}: ${takes}`).join('. ')}`,
    },
  ],
  examples: [
    {
      label: 'A warm theme with a light and a dark look',
      cli: 'astryx experimental theme create acme --traits \'{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}\'',
    },
    {
      label: 'One dark look with a colored top bar',
      cli: 'astryx experimental theme create night --traits \'{"look": "dark", "page": "#101014", "accent": "#38bdf8", "bar": {"background": "#1e3a8a"}}\'',
    },
  ],
  outsideProject: 'refuse',
  requires: ['themes.targets', 'themes.compile', 'themes.appModule'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme create writes nothing and stops with `ERR_PROJECT_REQUIRED`, since the theme is written into an app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the theme is written, built, added and made the app theme, and its check finds nothing broken, measured text, and no protected file kept a repair back',
    },
    {
      code: 1,
      when: "the check after writing finds problems, measured no text (`unmeasured`) or had a repair kept back by a protected app file (`protectedFiles`): the theme is written and the result says so. Or, with nothing written: no --traits (ERR_MISSING_ARGUMENT); traits it does not take, a token or part this Core does not have, or a name that is no theme name or a bundled theme's (ERR_INVALID_ARGUMENT); a theme file, or an editor theme, by that name already (ERR_FILE_EXISTS); a theme folder that leads out of the app (ERR_PATH_TRAVERSAL); or no app project with Core installed (ERR_PROJECT_REQUIRED)",
    },
  ],
  related: [
    'experimental theme check',
    'experimental theme add',
    'experimental theme use',
    'experimental theme editor new',
  ],
};
