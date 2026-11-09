// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'color',
  title: 'Color',
  category: 'foundations',
  description:
    'Semantic color tokens for surfaces, text, icons, borders, and status indicators.',
  tokenCategory: 'color',

  sections: [
    {
      title: 'Overview',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Colors are semantic: tokens describe purpose, not appearance. Every color adapts automatically between light and dark modes via CSS light-dark(). Themes override the resolved values, so your code never references raw hex colors.',
        },
      ],
    },
    {
      id: 'surface-colors',
      title: 'Color Tokens',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Layered surface hierarchy: body → surface → card → popover. Each level sits visually above the previous one.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Color Tokens',
        },
      ],
    },
    {
      id: 'usage',
      title: 'Use color tokens in StyleX',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Import the typed color tokens and use them in `stylex.create()`; they resolve to the active theme and color mode.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Applying color tokens',
          code: `import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  container: {
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
    borderColor: colorVars['--color-border'],
  },
  accent: {
    color: colorVars['--color-text-accent'],
  },
});`,
        },
      ],
    },
    {
      title: 'Best Practices',
  category: 'foundations',
      content: [
        {
          type: 'list',
          style: 'do',
          items: [
            'Use semantic tokens (--color-text-primary) instead of raw hex values.',
            'Rely on the surface hierarchy (body → surface → card → popover) for layering.',
            'Use status colors (success, error, warning) only for their semantic meaning.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            "Hardcode hex values, since they won't adapt to dark mode or custom themes.",
            'Mix accent colors with status colors in the same context.',
            'Use --color-on-accent on non-accent backgrounds.',
          ],
        },
      ],
    },
  ],
};
