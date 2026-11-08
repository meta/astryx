// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling-libraries/css-and-stylex`: core integration
 * principle, plain CSS / CSS Modules, and StyleX typed-token imports.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'css-and-stylex',
  title: 'CSS & StyleX',
  placement: {parent: 'namespace:styling-libraries', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Core integration principle, plain CSS / CSS Modules, and StyleX typed-token imports.',

  sections: [
    {
      title: 'Core Principle',
      content: [
        {
          type: 'prose',
          text: 'Keep the system as the source of truth for theme values. Components read design tokens from CSS custom properties such as `--color-text-primary`, `--color-background-surface`, `--spacing-4`, and `--radius-container`. Other styling libraries should map their own semantic tokens, utility names, or theme objects to those system CSS variables whenever possible.',
        },
        {
          type: 'prose',
          text: 'Use CSS variables for ordinary DOM styling because they inherit through the tree, follow `data-theme` color mode, respect nested `data-astryx-theme` scopes, and update when themes switch. Use token resolver APIs only for non-CSS consumers such as SVG attribute values, canvas, chart configuration, color calculations, or static config generation.',
        },
        {
          type: 'prose',
          text: 'For available token names and values, run {@link namespace:tokens}. Focused references are also available with {@link generic:color}, {@link generic:spacing}, {@link generic:shape}, {@link namespace:typography}, {@link generic:elevation}, and {@link generic:motion}.',
        },
      ],
    },
    {
      title: 'Choose an Integration Path',
      content: [
        {
          type: 'prose',
          text: 'Choose the narrowest integration path that fits the styling library. Most DOM styling should stay on the CSS-variable path; JavaScript token resolution is for APIs that cannot consume CSS custom properties.',
        },
        {
          type: 'table',
          headers: ['Path', 'Use when', 'Value shape'],
          rows: [
            [
              'CSS variable aliases',
              'The library ultimately writes CSS and accepts string values',
              '`var(--color-text-primary)`',
            ],
            [
              'StyleX token imports',
              'You are writing StyleX styles in application code',
              "`colorVars['--color-text-primary']`",
            ],
            [
              'Tailwind bridge',
              'You want utility classes backed by active system tokens',
              '`@astryxdesign/core/tailwind-theme.css`',
            ],
            [
              'Design token resolver APIs',
              'JavaScript needs token values for charts, canvas, SVG, or config objects',
              "`resolveThemeToken(theme, '--color-data-categorical-blue', {mode})`",
            ],
          ],
        },
      ],
    },
    {
      title: 'Best Practices',
      content: [
        {
          type: 'list',
          style: 'do',
          items: [
            'Map by semantic intent: text, surface, border, accent, status, radius, spacing, typography.',
            'Let the system own color mode. The root Theme syncs `data-theme="light|dark"` and `data-astryx-theme` to `<html>` for portals and first-level theme scope.',
            'Prefer CSS variables for runtime theme switching and nested themes.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Copy raw hex/px values into a second theme object when a `var(...)` reference would work.',
            'Run a second unsynchronized dark-mode provider that disagrees with Theme.',
            'Make another library\'s CSS variables the source of truth for the system. Some consumers need token values outside the DOM.',
          ],
        },
      ],
    },
    {
      title: 'Plain CSS and CSS Modules',
      content: [
        {
          type: 'prose',
          text: 'The simplest integration is direct CSS variable usage. CSS Modules scope class names, but system token variables are global/inherited values supplied by package CSS and the active theme.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Card.module.css',
          code: `.card {
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-container);
  padding: var(--spacing-4);
}`,
        },
        {
          type: 'prose',
          text: 'Sass variables are compile-time only. They are useful for generating static CSS, but they do not update when the system switches theme or color mode. Use native CSS custom properties for themeable values.',
        },
      ],
    },
    {
      title: 'StyleX',
      content: [
        {
          type: 'prose',
          text: 'For StyleX styles, prefer the typed token exports from `@astryxdesign/core/theme/tokens.stylex`. They provide autocomplete and catch token-name typos while still resolving through the same system CSS variables at runtime.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Typed token imports',
          code: `import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  panel: {
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
    padding: spacingVars['--spacing-4'],
    borderRadius: radiusVars['--radius-container'],
  },
});`,
        },
        {
          type: 'prose',
          text: 'Use `xstyle` for component overrides and `stylex.props()` for your own DOM nodes. Use `className` when integrating a non-StyleX styling library.',
        },
      ],
    },
  ],
};
