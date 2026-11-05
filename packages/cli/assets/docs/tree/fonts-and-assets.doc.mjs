// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/themes/fonts-and-assets`:
 * ship a theme's optional font loader beside its built module and CSS.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'fonts-and-assets',
  placement: {parent: 'namespace:themes', slot: 'guides', order: 35},
  title: 'Fonts and assets',
  category: 'guide',
  description:
    'Name the fonts in the theme, then export an optional font stylesheet that `theme add` imports with the built theme.',
  sections: [
    {
      id: 'name-the-font',
      title: 'Name the font',
      content: [
        {
          type: 'prose',
          text: 'A theme names its typefaces in `typography`: `body`, `heading`, and `code`, each with a `family` and `fallbacks`. These set the `--font-family-*` tokens every component reads. Always give real `fallbacks` so text stays readable before the font loads, or if it never does. `heading` inherits `family` and `fallbacks` from `body` when you omit them.',
        },
        {
          type: 'code',
          lang: 'ts',
          code: `// themes/ocean/oceanTheme.ts
export const oceanTheme = defineTheme({
  name: 'ocean',
  typography: {
    body: {family: 'Acme Sans', fallbacks: 'system-ui, sans-serif'},
    code: {family: 'Acme Mono', fallbacks: 'ui-monospace, monospace'},
  },
  // ...your tokens
});`,
        },
        {
          type: 'prose',
          text: 'The full type scale and font roles are in {@link generic:author-a-theme}.',
        },
      ],
    },
    {
      id: 'ship-the-font-loader',
      title: 'Ship the font loader',
      content: [
        {
          type: 'prose',
          text: 'Naming a family does not load it. When the theme uses non-system fonts, add `<slug>.fonts.css` beside the built module and production CSS, then export it as `./themes/<slug>.fonts.css`. `theme add` imports that stylesheet with the built theme.',
        },
        {
          type: 'code',
          lang: 'json',
          code: `"exports": {
  "./themes/ocean": "./themes/ocean/ocean.js",
  "./themes/ocean.css": "./themes/ocean/ocean.css",
  "./themes/ocean.fonts.css": "./themes/ocean/ocean.fonts.css"
}`,
        },
        {
          type: 'prose',
          text: 'The stylesheet can contain self-hosted `@font-face` rules or import a hosted stylesheet. A hosted `@import` is simple, but it delays loading compared with a preconnected `<link>`; choose that trade-off deliberately. Doctor warns when it cannot prove the loader — a hosted `@import`, or no font stylesheet while the app loads the family itself — but the warning does not fail the app.',
        },
        {
          type: 'code',
          lang: 'css',
          code: `/* themes/ocean/ocean.fonts.css */
@font-face {
  font-family: 'Acme Sans';
  src: url('./fonts/acme-sans.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Load every weight and style the theme uses. Do not let the browser synthesize bold or italic.',
            'Include self-hosted font files and their licenses in the packed package.',
            'Keep CSS and font assets side-effectful so a bundler does not remove the loader.',
            'Run `integration verify`; it fails when an exported font stylesheet cannot resolve, but it does not check the font files the stylesheet names.',
          ],
        },
      ],
    },
    {
      id: 'verify-in-an-app',
      title: 'Verify in an app',
      content: [
        {
          type: 'prose',
          text: 'Before publishing, run `integration verify`. Then install the package in a clean app, run `theme add`, apply the generated theme, and open it in a browser. The source, packed exports, and applied result form one chain; check the last step too.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Text renders in the named families at every weight and style — the italic face resolves, not a synthesized slant.',
            'Every font request succeeds; nothing silently falls back to a system font.',
            'Color pairs still meet contrast in both light and dark mode.',
          ],
        },
      ],
    },
  ],
};
