// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling/tokens-and-setup`: using design tokens in custom
 * styles and configuring a StyleX compiler for swizzled components.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'tokens-and-setup',
  title: 'Tokens & Setup',
  placement: {parent: 'namespace:styling', slot: 'guides', order: 30},
  category: 'guide',
  description:
    'Using design tokens in custom styles and configuring a StyleX compiler for swizzled components.',
  keywords: ['StyleX setup', 'swizzle', 'webpack', 'Vite', 'Next.js'],

  sections: [
    {
      title: 'Design Tokens',
      content: [
        {
          type: 'prose',
          text: 'When writing custom styles, use design tokens instead of hardcoded values. Tokens are CSS custom properties that adapt to the active theme and color mode. The system provides tokens for spacing, color, radius, shadow, typography, and size.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Using tokens in stylex.create',
          code: `import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  surface: {
    padding: 'var(--spacing-4)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
  },
});

<Card xstyle={styles.surface} />`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Using typed token imports in stylex.create',
          code: `import {colorVars, spacingVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  highlight: {
    backgroundColor: colorVars['--color-accent-muted'],
    padding: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
  },
});`,
        },
        {
          type: 'prose',
          text: 'Both approaches work: var() strings or typed imports from tokens.stylex. The typed imports give autocomplete and catch typos at build time.',
        },
        {
          type: 'prose',
          text: 'See {@link namespace:tokens} for the full token reference (all spacing, color, radius, shadow, and typography tokens with values). See {@link generic:author-a-theme} for how to override tokens via defineTheme.',
        },
      ],
    },
    {
      id: 'stylex-setup',
      title: 'StyleX Build Setup (required for swizzled components)',
      content: [
        {
          type: 'prose',
          text: "Astryx components ship pre-compiled: `astryx.css` and each package's own stylesheet hold all of their styles, so consuming the published packages needs no StyleX setup. But `{@command swizzle <Component>}` copies the raw StyleX *source* into your app, and StyleX source requires a build-time StyleX compiler to produce atomic CSS. Without one, importing the component throws an error that starts `Unexpected 'stylex.create' call at runtime`, and the page does not render. If a swizzled component throws that error, the app is missing a StyleX compiler. The same applies if you author your own StyleX with `stylex.create()`.",
        },
        {
          type: 'table',
          headers: ['Bundler', 'StyleX plugin'],
          rows: [
            ['Webpack', '@stylexjs/webpack-plugin'],
            [
              'Vite / Rollup',
              '@stylexjs/rollup-plugin (or a community Vite plugin)',
            ],
            [
              'Babel (any bundler)',
              '@stylexjs/babel-plugin + @stylexjs/postcss-plugin',
            ],
            [
              'Next.js (App Router, SWC)',
              'An SWC-based transform; see the Next.js note below',
            ],
          ],
        },
        {
          type: 'prose',
          text: "Next.js (App Router) is the sharp edge. StyleX's canonical compiler is a Babel plugin, but introducing a Babel config in Next.js disables the SWC compiler, and with it SWC-dependent features like `next/font`.",
        },
        {
          type: 'prose',
          text: "The repo's `apps/example-nextjs-stylex` takes the Babel path (`next/babel`, `@stylexjs/babel-plugin`, `@stylexjs/postcss-plugin`). Babel turns off SWC, so that app does not use `next/font`. To keep `next/font`, use an SWC transform such as `@stylexswc/nextjs-plugin`.",
        },
        {
          type: 'code',
          lang: 'js',
          label:
            'next.config.mjs: SWC-based StyleX transform (keeps next/font working)',
          code: `import stylexPlugin from '@stylexswc/nextjs-plugin';

export default stylexPlugin({
  rsOptions: {
    // Resolve the Astryx token modules that swizzled source imports.
    aliases: {'@/*': ['./src/*']},
    unstable_moduleResolution: {type: 'commonJS'},
  },
})({
  // your existing Next.js config
});`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Symptom of a missing compiler: importing a swizzled component throws an error that starts `Unexpected 'stylex.create' call at runtime`, and the page does not render.",
            'A Babel config turns off SWC in Next.js; skip it if you need `next/font`.',
            'Pure theming (defineTheme + astryx theme build) needs NO StyleX compiler; only swizzled/authored StyleX source does.',
            'Keep loading `astryx.css` with a StyleX compiler in place. The compiler builds your own and swizzled source only; never add `node_modules/@astryxdesign` to its inputs.',
          ],
        },
      ],
    },
  ],
};
