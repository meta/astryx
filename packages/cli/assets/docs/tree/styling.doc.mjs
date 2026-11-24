// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling`: the styling namespace. States the core
 * styling rules and groups guides for styling basics (xstyle, className,
 * rest props), advanced patterns (compounds, data attrs, deprecated), and
 * tokens + StyleX setup.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'styling',
  title: 'Styling components',
  summary:
    'Customize component appearance: xstyle, Tailwind, className, rest props, compound components, data attribute selectors, tokens, and StyleX setup.',
  keywords: [
    'styling',
    'xstyle',
    'className',
    'override',
    'customize',
    'css',
    'StyleX',
    'tokens',
  ],
  blocks: [
    {
      type: 'prose',
      text: 'Style a component with `xstyle` for StyleX, or with `className` for Tailwind and your own CSS. Every approach reads the same tokens, so themes and dark mode keep working.',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        '`xstyle` takes only styles made with `stylex.create()`: never an inline object or a class string',
        'Put every hover style behind `@media (hover: hover)`, so a touch screen does not keep it after a tap',
        'Take spacing, color, radius and shadow values from token vars, never from raw px or hex',
        'Style a state with a conditional style, `xstyle={[styles.tile, isActive && styles.active]}`, not by toggling class names; external CSS targets a component by its class and data attributes, such as `.astryx-button[data-variant="primary"]`',
        'To restyle a component everywhere, use component overrides in defineTheme instead of page-level selectors',
      ],
    },
    {
      type: 'code',
      lang: 'tsx',
      label: 'A token-based override',
      code: `import * as stylex from '@stylexjs/stylex';
import {spacingVars, colorVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  tile: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-muted'],
  },
});

<Card xstyle={styles.tile} />`,
    },
    {
      type: 'prose',
      text: 'The guides below cover each approach and Tailwind, styling the parts of compound components, and tokens with StyleX setup.',
    },
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
