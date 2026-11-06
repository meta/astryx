// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes/define-the-theme`:
 * map the palette to tokens, keep light-dark() to colors, and avoid Core internals.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'define-the-theme',
  placement: {parent: 'namespace:themes', slot: 'guides', order: 30},
  title: 'Define the theme',
  category: 'guide',
  description:
    'Point theme tokens at the palette, keep light-dark() to colors, and avoid Core internals.',
  sections: [
    {
      id: 'map-the-palette-to-tokens',
      title: 'Map the palette to tokens',
      content: [
        {
          type: 'prose',
          text: 'A theme token is a named slot that Astryx components read for a value — `--color-accent` for the accent color, and so on. Components never read your palette directly; they read tokens. Defining a theme means pointing each token at a palette shade, so the components wear your colors.',
        },
        {
          type: 'prose',
          text: 'Import the palette in `oceanTheme.ts` and point your tokens at its stops. Each token takes a `[light, dark]` pair — the shade to use in light mode and the one in dark mode.',
        },
        {
          type: 'code',
          lang: 'ts',
          code: `// themes/ocean/oceanTheme.ts
import {defineTheme} from '@astryxdesign/core/theme';
import {palette} from './tokens/ocean.palette';

const {light, dark} = palette.ocean;

export const oceanTheme = defineTheme({
  name: 'ocean',
  tokens: {
    '--color-accent': [light['45'], dark['70']],
  },
});`,
        },
        {
          type: 'prose',
          text: 'Local imports must stay inside the theme folder. One that leaves it, such as `../../shared/colors`, fails with `invalid_theme`, and every theme in the package disappears from `theme list`. `{@command theme template}` writes a file that explains every `defineTheme` field. For the full token set and component theming, read {@link generic:author-a-theme}.',
        },
      ],
    },
    {
      id: 'build-on-another-theme',
      title: 'Build on another theme',
      content: [
        {
          type: 'prose',
          text: 'To base a theme on an existing one, `extends` it: import the base theme and override only the tokens you change. Add the derived theme with `integration add theme ocean-contrast`, and import the base from its built package export, since local imports cannot leave the theme folder. The derived theme keeps a live link to the base and picks up its later changes when you rebuild it — unlike `--from`, which forks a copy ({@link generic:add-a-theme}).',
        },
        {
          type: 'code',
          lang: 'ts',
          code: `// themes/ocean-contrast/oceanContrastTheme.ts
import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from '@acme/astryx-widgets/themes/ocean';

export const oceanContrastTheme = defineTheme({
  name: 'ocean-contrast',
  extends: oceanTheme,
  tokens: {
    '--color-accent': ['#0051a3', '#4aa3ff'],
  },
});`,
        },
      ],
    },
    {
      id: 'keep-light-dark-to-colors',
      title: 'Keep light-dark() to colors',
      content: [
        {
          type: 'prose',
          text: 'Each `[light, dark]` pair compiles to a `light-dark()` value, which switches only colors. Give it colors. For a value that is not a plain color — a gradient — put `light-dark()` on each color stop, not around the whole value: `light-dark()` takes two colors, so wrapping whole gradients makes the value invalid where the token is used, and `theme build` does not warn.',
        },
      ],
    },
    {
      id: 'avoid-core-internals',
      title: 'Do not set Core private variables',
      content: [
        {
          type: 'prose',
          text: 'Core private variables start with `--_`, such as `--_field-radius`. They are internals and can change in any Core release, so `theme build` reports each one it finds as an `[error]`. Set the standard CSS property instead — `borderRadius`, `padding` — and let the build emit the internal variable where Core needs it.',
        },
      ],
    },
    {
      id: 'declare-the-peers',
      title: 'Declare the peer dependencies',
      content: [
        {
          type: 'prose',
          text: 'The theme imports `@astryxdesign/core/theme`, so declare Core as a peer dependency, with the range of Core versions you test the theme against — a range, not an exact version, so a Core patch release does not force a republish. `integration add theme` already declared the optional `@astryxdesign/cli` peer that reads themes:',
        },
        {
          type: 'code',
          lang: 'json',
          code: `"peerDependencies": {
  "@astryxdesign/core": "^0.7.0",
  "@astryxdesign/cli": ">=0.6.4"
},
"peerDependenciesMeta": {
  "@astryxdesign/cli": {"optional": true}
}`,
        },
      ],
    },
  ],
};
