// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'spacing',
  title: 'Spacing',
  category: 'foundations',
  description:
    'Spacing scale tokens for padding, gap, and margin: the rhythmic foundation of design system layouts.',
  keywords: ['padding', 'margin', 'gap'],
  tokenCategory: 'spacing',

  sections: [
    {
      title: 'Overview',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'The design system uses a 4px base-unit spacing scale, written in rem so gaps and padding grow with the reader\'s browser font size the way text does: each step is 0.25rem, which is 4px at the default 16px root. Component gap props accept step values that map to these tokens. The scale provides fine-grained control at the small end (2px, 4px, 6px) and consistent rhythm at larger sizes (multiples of 4px).',
        },
      ],
    },
    {
      title: 'Scale',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Fifteen spacing tokens, from 0 to 3rem (0px to 48px at the default 16px root).',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Spacing Tokens',
        },
      ],
    },
    {
      title: 'Usage',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Stack, HStack, VStack, Grid, Toolbar, OverflowList, and ChatMessageList take a `gap` step: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, or 10 (×4px). Carousel takes the steps from 0 to 4. For custom layouts, use the spacing tokens in StyleX.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Spacing via component props vs StyleX',
          code: `// Via component props (preferred)
<Stack gap={4}>{/* 16px gap */}</Stack>

// Via StyleX tokens (custom layouts)
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  custom: {
    padding: spacingVars['--spacing-4'],
    gap: spacingVars['--spacing-3'],
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
            'Use component gap props when available; they handle automatic spacing compensation.',
            "Stick to the scale for consistency. If a value isn't on the scale, reconsider the design.",
            'Use smaller steps (0.5–2) for tight internal spacing and larger steps (4–8) for section gaps.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Use arbitrary pixel values outside the scale.',
            'Mix spacing tokens with raw px/rem values in the same component.',
          ],
        },
      ],
    },
  ],
};
