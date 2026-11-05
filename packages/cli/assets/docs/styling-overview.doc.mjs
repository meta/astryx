// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling-overview`
 *
 * One question: "How do I set up CSS?"
 * Three paths, each with its exact imports. Every path loads the prebuilt
 * stylesheets (spec:AST-080 FR5); none compiles Astryx package source.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'styling-overview',
  title: 'Styling overview',
  category: 'guide',
  description:
    'How to set up CSS — exact imports for three paths: plain, Tailwind, and StyleX for your own code — plus the stylesheet each Astryx package ships.',
  keywords: [
    'styling',
    'CSS',
    'setup',
    'imports',
    'StyleX',
    'Tailwind',
    'astryx.css',
    'globals.css',
  ],

  sections: [
    {
      id: 'pick-a-path',
      title: 'Pick a path',
      content: [
        {
          type: 'table',
          headers: ['Path', 'Good for', 'Build step?'],
          rows: [
            [
              'Plain CSS',
              'Most apps. Style with className, xstyle, or any CSS library.',
              'None.',
            ],
            [
              'Tailwind',
              'Apps on Tailwind v4. A CSS bridge maps utility classes to design tokens.',
              "None beyond Tailwind's own.",
            ],
            [
              'StyleX for your own code',
              'Your own `stylex.create()` styles and swizzled (ejected) components. Astryx itself stays prebuilt.',
              'Yes \u2014 a StyleX plugin for your own code.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'All three load the same prebuilt Astryx stylesheets, resolve to the same design tokens, and support theming and dark mode. None of them compiles Astryx package source. You can mix them in one app.',
        },
      ],
    },
    {
      id: 'plain',
      title: 'Plain CSS',
      content: [
        {
          type: 'code',
          lang: 'bash',
          label: 'Install',
          code: '{@pm install @astryxdesign/core @stylexjs/stylex @astryxdesign/theme-neutral}',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css',
          code: `@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-neutral/theme.css";`,
        },
        {
          type: 'prose',
          text: "Done. Components work out of the box \u2014 style them with `className`, `xstyle`, or `style`. Swap `theme-neutral` for any theme package (`{@command theme list}` shows what's available).",
        },
      ],
    },
    {
      id: 'tailwind',
      title: 'Tailwind',
      content: [
        {
          type: 'code',
          lang: 'bash',
          label: 'Install (add to an existing Tailwind v4 app)',
          code: '{@pm install @astryxdesign/core @stylexjs/stylex @astryxdesign/theme-neutral}',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css',
          code: `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-neutral/theme.css";
@import "@astryxdesign/core/tailwind-theme.css";
@import "tailwindcss/utilities.css" layer(utilities);`,
        },
        {
          type: 'prose',
          text: 'The `@layer` declaration is critical \u2014 without it, component styles outrank Tailwind utilities and `className` overrides stop working. The bridge (`tailwind-theme.css`) maps classes like `text-primary`, `bg-surface`, and `rounded-lg` to design tokens with no JS.',
        },
        {
          type: 'prose',
          text: 'For Tailwind v3, see the layer workaround in {@link generic:migration-setup}.',
        },
      ],
    },
    {
      id: 'stylex-own-code',
      title: 'StyleX for your own code',
      content: [
        {
          type: 'prose',
          text: 'Only needed when you write your own StyleX (`stylex.create()`) or swizzle a component (`{@command swizzle <Component>}`), which copies its StyleX source into your app. The plain path already supports `xstyle` overrides \u2014 this path is for your own StyleX code. Some built-in page templates also use StyleX for layout; if you scaffold one and see "Unexpected stylex.create call at runtime", add the compiler plugin for your bundler below.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Install',
          code: '{@pm install @astryxdesign/core @stylexjs/stylex @astryxdesign/theme-neutral}',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css',
          code: `@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-neutral/theme.css";`,
        },
        {
          type: 'prose',
          text: 'Keep `astryx.css`: Astryx component styles always come from the prebuilt stylesheets. Point the StyleX compiler at your own source only, never at `node_modules/@astryxdesign`. Add the plugin for your bundler:',
        },
        {
          type: 'table',
          headers: ['Bundler', 'Plugin'],
          rows: [
            ['Webpack', '@stylexjs/webpack-plugin'],
            ['Vite / Rollup', '@stylexjs/rollup-plugin'],
            [
              'Babel (any)',
              '@stylexjs/babel-plugin + @stylexjs/postcss-plugin',
            ],
            ['Next.js (keep next/font)', '@stylexswc/nextjs-plugin'],
          ],
        },
        {
          type: 'prose',
          text: 'If a swizzled component fails at runtime with a `stylex.create` error, the app is missing a StyleX compiler: see the StyleX Build Setup section of {@link generic:tokens-and-setup}.',
        },
      ],
    },
    {
      id: 'other-packages',
      title: 'Other Astryx packages',
      content: [
        {
          type: 'prose',
          text: 'Every Astryx package whose components carry styles ships its own prebuilt stylesheet. Import it after `astryx.css` for each package you use. All of them place their rules in the same `astryx-base` layer, so your theme overrides win over every package.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css',
          code: `@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/richtext/richtext.css"; /* Rich Text */
@import "@astryxdesign/lab/lab.css"; /* Lab */
@import "@astryxdesign/charts/charts.css"; /* Charts */
@import "@astryxdesign/theme-neutral/theme.css";`,
        },
        {
          type: 'table',
          headers: ['Package', 'Stylesheet'],
          rows: [
            ['@astryxdesign/core', '@astryxdesign/core/astryx.css'],
            ['@astryxdesign/richtext', '@astryxdesign/richtext/richtext.css'],
            ['@astryxdesign/lab', '@astryxdesign/lab/lab.css'],
            ['@astryxdesign/charts', '@astryxdesign/charts/charts.css'],
          ],
        },
      ],
    },
    {
      id: 'what-each-file-does',
      title: 'What each import does',
      content: [
        {
          type: 'table',
          headers: ['Import', 'Layer', 'Purpose'],
          rows: [
            [
              'reset.css',
              'reset',
              'Cross-browser reset (box-sizing, margins, color-scheme). Zero specificity via :where().',
            ],
            [
              'astryx.css',
              'astryx-base',
              'Prebuilt component styles. Required on every path.',
            ],
            [
              'richtext.css, lab.css, charts.css',
              'astryx-base',
              'Prebuilt styles for each other Astryx package you use. Load after astryx.css.',
            ],
            [
              'theme.css',
              'astryx-theme',
              'Design tokens (colors, spacing, radius, typography) as CSS custom properties. Swap the package for a different theme.',
            ],
            [
              'tailwind-theme.css',
              '\u2014',
              'Tailwind v4 bridge. Maps utility classes to design tokens. Pure CSS, no JS. Tailwind path only.',
            ],
          ],
        },
      ],
    },
    {
      id: 'further-reading',
      title: 'Further reading',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '{@link namespace:styling} \u2014 xstyle, className, data-attribute selectors, design tokens in code.',
            '{@link namespace:styling-libraries} \u2014 Tailwind bridge details, Panda, Chakra, MUI, CSS Modules, and non-CSS token resolution.',
            '{@link generic:use-a-theme} \u2014 applying themes, dark mode, nested themes. {@link generic:author-a-theme} \u2014 defineTheme, overrides, production builds.',
            '{@link namespace:migration} \u2014 cascade layer audit, Tailwind v3 coexistence, and foundation smoke test.',
          ],
        },
      ],
    },
  ],
};
