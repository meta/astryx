// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs typography/font-setup`: font families, custom fonts,
 * font sizes, and font weights.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'font-setup',
  title: 'Font Setup',
  placement: {parent: 'namespace:typography', slot: 'guides', order: 10},
  category: 'foundations',
  description:
    'Font families, custom font loading, geometric font sizes, and semantic font weights.',
  keywords: [
    'font family',
    'custom fonts',
    'webfont',
    'Google Fonts',
    'font-face',
    'font size',
    'font weight',
    'geometric scale',
  ],

  sections: [
    {
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'Typography is built on a geometric type scale: base size × ratio^step, with 14px and 1.2 as defaults. Every text style is a semantic token that composes font size, weight, and line-height, so components express intent (heading, body, label) rather than raw values.',
        },
        {
          type: 'prose',
          text: 'Two layers work together: raw size tokens (--font-size-xs ... --font-size-5xl) form the geometric scale, and semantic type scale tokens (--text-heading-1-size, --text-body-leading, etc.) reference them by var(). Themes override the entire scale by adjusting base and ratio in defineTheme; all semantic tokens recompute automatically.',
        },
      ],
    },
    {
      title: 'Font Families',
      content: [
        {
          type: 'prose',
          text: 'Three font roles: body (UI text), heading (titles and headings), and code (monospace). By default, body and heading share the same system font stack; code uses a monospace stack. Custom themes can assign different families per role; heading inherits from body when not explicitly set.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Font Family Tokens',
        },
      ],
    },
    {
      id: 'loading-custom-fonts',
      title: 'Custom fonts',
      content: [
        {
          type: 'prose',
          text: "Astryx never loads font files. defineTheme and the built CSS only set font-family: naming a webfont (Fraunces, JetBrains Mono, and so on) makes every browser look for it, and quietly fall back when the app has not loaded it. `{@command theme build}` warns when a theme names families that are neither CSS generics nor common system fonts and prints the snippet to add; loading the font is always the app's job.",
        },
        {
          type: 'code',
          lang: 'html',
          label: 'Google Fonts: add to your document <head>',
          code: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=JetBrains+Mono&display=swap"
/>`,
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Self-hosted: one @font-face per family and weight',
          code: `@font-face {
  font-family: 'Fraunces';
  src: url('/fonts/fraunces.woff2') format('woff2');
  font-weight: 400 700; /* variable-font range, or one weight per file */
  font-display: swap; /* fallback text stays visible while the font loads */
}`,
        },
        {
          type: 'prose',
          text: "Always pair a webfont with a real fallback stack (metric-similar system fonts plus a generic) so text stays readable before the font loads and wherever it never does: defineTheme({typography: {heading: {family: 'Fraunces', fallbacks: 'Georgia, serif'}}}).",
        },
      ],
    },
    {
      title: 'Font Sizes',
      content: [
        {
          type: 'prose',
          text: 'Geometric scale: round(base × ratio^step), expressed in rem. The default scale is 14px × 1.2, producing 12 steps from 4xs (6px) to 5xl (42px). Adjusting base and ratio in defineTheme regenerates every size token while preserving proportional relationships.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Font Size Tokens',
        },
      ],
    },
    {
      title: 'Font Weights',
      content: [
        {
          type: 'prose',
          text: 'Four semantic weights: normal (400, body/code), medium (500, labels/data), semibold (600, headings/titles), bold (700, strong emphasis). Type scale tokens reference these by var() so themes can remap numeric values.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Font Weight Tokens',
        },
      ],
    },
  ],
};
