// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'principles',
  title: 'Principles',
  category: 'guide',
  description:
    'Core design principles and rules for building with the design system.',

  sections: [
    {
      title: 'Design Philosophy',
  category: 'guide',
      content: [
        {
          type: 'prose',
          text: 'A design system that prioritizes consistency, adaptability, and developer experience. Every decision flows from a few core ideas:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Components over primitives: use components for everything they cover before reaching for raw HTML',
            'Semantic tokens over hardcoded values: colors, spacing, and radii are named by purpose, not appearance',
            'Theme-agnostic code: your app code never references specific colors or measurements, so themes and dark mode work automatically',
            'Open internals: every primitive is exported and composable, so you can build on top of it without fighting it',
          ],
        },
      ],
    },
    {
      title: 'Rules',
  category: 'guide',
      content: [
        {
          type: 'prose',
          text: 'Eight rules that keep app code on-system.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Use components for everything they cover',
            'Page layout is frame-first: pick the shell and budget regions before writing content (see {@link namespace:layout})',
            'Dense data renders as rows (Table, List/Item), edge-to-edge with dividers; Card is for widgets, galleries, and settings groups',
            'StyleX or Tailwind for custom styling; both are first-class (see {@link namespace:styling})',
            'Semantic tokens, not hardcoded values (see {@link namespace:tokens})',
            'CSS custom properties for colors, not hex values',
            'Form inputs are controlled (value + onChange)',
            'Use useLinkComponent() for navigation so consumers can plug in their framework router via LinkProvider',
          ],
        },
      ],
    },
    {
      title: 'Styling Approach',
  category: 'guide',
      content: [
        {
          type: 'prose',
          text: 'The design system supports multiple styling approaches. Every component accepts an \`xstyle\` prop for StyleX style overrides via \`stylex.create()\`. For layout and wrapper styling outside of components, use StyleX or Tailwind utilities; both resolve to the same design tokens.',
        },
        {
          type: 'prose',
          text: 'See {@link namespace:styling} for the complete guide with examples.',
        },
      ],
    },
    {
      title: 'Anti-Patterns',
  category: 'guide',
      content: [
        {
          type: 'prose',
          text: 'Patterns that break theming, routing, or layout, and what to use instead.',
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Inline styles on raw elements. Use xstyle on components',
            'Hardcoded colors (#fff). Use var(--color-*) or Tailwind semantic classes (text-primary, bg-surface)',
            'Hardcoded spacing (16px). Use spacing tokens or Tailwind spacing utilities',
            'Hardcoded <a> elements. Use useLinkComponent() so consumers can swap in their framework router via LinkProvider',
            'Wrapping every list item or page section in a Card. Decide the frame first; dense data renders as rows (see {@link namespace:layout})',
            'Badge as decoration. Reserve Badge for counts and enumerated states; use StatusDot or Token for status',
            'Inventing props. Read component docs first',
          ],
        },
      ],
    },
    {
      title: 'Design Tokens',
  category: 'guide',
      content: [
        {
          type: 'prose',
          text: 'The design system provides semantic design tokens for spacing, color, radius, shadow, typography, and size. Tokens adapt to the active theme and color mode. Run {@link namespace:tokens} for the full reference with all values.',
        },
      ],
    },
  ],
};
