// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs typography/type-scale`: line height, semantic type scale,
 * display text, headings and text components, and custom type scales.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'type-scale',
  title: 'Type Scale',
  placement: {parent: 'namespace:typography', slot: 'guides', order: 20},
  category: 'foundations',
  description:
    'Line height, semantic type scale tokens, display text, Heading and Text components, and custom type scales via defineTheme.',
  keywords: [
    'line height',
    'leading',
    'defineTheme',
    'base',
    'ratio',
  ],

  sections: [
    {
      title: 'Line Height',
      content: [
        {
          type: 'prose',
          text: 'Line heights are computed from a tiered target ratio and snapped to a 4px vertical grid. Small text (<20px) targets 1.5, medium text (20–31px) targets 1.4, and large text (≥32px) targets 1.25. A minimum gap of fontSize + 4px is enforced. The result is a unitless ratio stored in each --text-*-leading token.',
        },
        {
          type: 'prose',
          text: 'The 4px grid matters: every line box aligns to 4px increments, which keeps baselines, spacing, and component heights predictable. The expandTypeScale utility computes these automatically when you provide a base and ratio, so you should never need to set line-height manually.',
        },
      ],
    },
    {
      title: 'Type Scale',
      content: [
        {
          type: 'prose',
          text: 'Semantic tokens that combine size, weight, and line-height into a single type style. Each token triplet (--text-*-size, --text-*-weight, --text-*-leading) is consumed by Text and Heading. Use the component props rather than composing raw font tokens.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Type Scale Tokens',
        },
      ],
    },
    {
      title: 'Display Text',
      content: [
        {
          type: 'prose',
          text: 'Display variants (display-1, display-2, display-3) continue the geometric progression above heading-1, at steps +6, +5, and +4. They use normal weight (400) instead of semibold, and tighter line-heights (~1.2), since large text reads better with less leading. Use display types for hero banners, marketing headlines, and data callouts, not for document headings.',
        },
        {
          type: 'prose',
          text: 'Display text often needs heading semantics for accessibility. Use the type prop on Heading to apply display styling while preserving the correct HTML element: `<Heading level={1} type="display-1">` gives you display-1 styling with an `<h1>` tag, so screen readers see the correct document outline.',
        },
      ],
    },
    {
      id: 'usage',
      title: 'Headings and text',
      content: [
        {
          type: 'prose',
          text: 'Use `Heading` for document structure and `Text` for everything else; each maps its props to the type scale tokens.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Heading for document structure',
          code: `import {Heading} from '@astryxdesign/core/Heading';

// Heading levels map to semantic tokens: level 1 → --text-heading-1-*
<Heading level={1}>Page Title</Heading>
<Heading level={2}>Section</Heading>
<Heading level={3}>Subsection</Heading>

// Display type for hero/marketing headings — level sets the HTML element
<Heading level={1} type="display-1">Hero Title</Heading>
<Heading level={2} type="display-2">$1.2M Revenue</Heading>

// Override the accessibility level when visual ≠ document hierarchy
<Heading level={2} accessibilityLevel={3}>
  Sidebar Section
</Heading>`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Text for body, label, and display text',
          code: `import {Text} from '@astryxdesign/core/Text';

<Text type="body">Body text at the base scale.</Text>
<Text type="large">Emphasized body text.</Text>
<Text type="label">Form label</Text>
<Text type="supporting">Helper text, timestamps, metadata.</Text>
<Text type="code">{'const x = 1;'}</Text>

// Display without heading semantics (data callouts, decorative)
<Text type="display-2">$1.2M Revenue</Text>`,
        },
      ],
    },
    {
      id: 'custom-type-scale',
      title: 'Custom type scale',
      content: [
        {
          type: 'prose',
          text: 'Change the whole ramp with `base` and `ratio` in `defineTheme`; every font size and line height recomputes from them.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Customizing the type scale via defineTheme',
          code: `import {defineTheme} from '@astryxdesign/core/theme';

// Adjust the entire ramp holistically with base and ratio
const editorialTheme = defineTheme({
  name: 'editorial',
  typography: {
    scale: { base: 16, ratio: 1.25 },          // airy / article feel
    body: { family: 'Geist', fallbacks: '-apple-system, sans-serif' },
    heading: { weight: 'bold' },
    code: { family: 'Geist Mono', fallbacks: '"SF Mono", monospace' },
  },
});

const denseTheme = defineTheme({
  name: 'dense',
  typography: {
    scale: { base: 12, ratio: 1.125 },          // compact / data-dense UI
  },
});`,
        },
      ],
    },
  ],
};
