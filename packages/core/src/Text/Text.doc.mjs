// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Text',
    required: true,
    description:
      'Polymorphic text element that renders the supplied content with themed typography.',
  },
  {
    name: 'Heading',
    required: false,
    description:
      'Referenced Heading member that renders the supplied content as a semantic h1–h6 element.',
  },
  {
    name: 'Truncation tooltip',
    required: false,
    description:
      'Tooltip-owned surface available only when Text or Heading is measured as truncated and truncation tooltips are enabled.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Text',
  displayName: 'Text',
  category: 'Content',
  keywords: [
    'text',
    'typography',
    'label',
    'paragraph',
    'heading',
    'caption',
    'font',
    'body',
    'subtitle',
  ],
  playground: {
    defaults: {
      children: 'The quick brown fox jumps over the lazy dog.',
      type: 'body',
    },
  },
  theming: {
    targets: [
      {
        className: 'astryx-heading',
        visualProps: ['level', 'color', 'type', 'weight'],
      },
      {className: 'astryx-text', visualProps: ['type', 'size', 'color']},
    ],
  },
  description:
    'Semantic body text component that renders text with type-based styling from the theme, with optional truncation, decoration, and layout props.',
  props: [
    {
      name: 'type',
      type: "'body' | 'large' | 'label' | 'supporting' | 'code' | 'display-1' | 'display-2' | 'display-3' | 'inherit'",
      description:
        "Semantic text type. Determines size, weight, and line-height from the theme. 'inherit' takes all three from the surrounding text instead. Themes may add custom types. Note: this prop is called `type`, not `variant`.",
      default: "'body'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Text content.',
      required: true,
    },
    {
      name: 'size',
      type: "'4xs' | '3xs' | '2xs' | 'xsm' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'",
      description:
        'Explicit font size override. Overrides the size from `type` but preserves other type properties. Prefer using `type` alone.',
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'disabled' | 'placeholder' | 'accent' | 'inherit'",
      description:
        "Text color. Defaults to 'secondary' for the 'supporting' type, 'primary' for all others. Themes may add custom colors.",
    },
    {
      name: 'weight',
      type: "'normal' | 'medium' | 'semibold' | 'bold'",
      description: 'Font weight override.',
    },
    {
      name: 'display',
      type: "'inline' | 'block'",
      description:
        "Display type. Silently overridden to 'block' when maxLines > 0 or hasCapsize is true.",
      default: "'inline'",
    },
    {
      name: 'as',
      type: "'span' | 'p' | 'div' | 'label'",
      description: 'HTML element to render.',
      default: "'span'",
    },
    {
      name: 'maxLines',
      type: 'number',
      description:
        'Maximum lines before truncation. 0 means no truncation. When set, shows a tooltip on hover if content is truncated.',
      default: '0',
    },
    {
      name: 'hasTruncateTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description:
        "Controls tooltip behavior for truncated text. true shows the tooltip at the default position, false disables it, or a placement string ('above' | 'below' | 'start' | 'end') sets a specific position.",
      default: 'true',
    },
    {
      name: 'wordBreak',
      type: "'break-word' | 'break-all'",
      description:
        "Word break behavior when truncating. Defaults to 'break-all' for single-line truncation, 'break-word' otherwise.",
    },
    {
      name: 'textWrap',
      type: "'wrap' | 'nowrap' | 'balance' | 'pretty'",
      description: 'Text wrapping behavior.',
    },
    {
      name: 'justify',
      type: "'start' | 'center' | 'end'",
      description:
        'Text alignment (justification). Uses logical values (start/end) for i18n/RTL compatibility.',
      default: "'start'",
    },
    {
      name: 'hasCapsize',
      type: 'boolean',
      description:
        'Enable optical alignment using text-box-trim. Forces block display.',
      default: 'false',
    },
    {
      name: 'hasStrikethrough',
      type: 'boolean',
      description: 'Apply strikethrough text decoration.',
      default: 'false',
    },
    {
      name: 'hasTabularNumbers',
      type: 'boolean',
      description: 'Use tabular (monospace) numbers for aligned numeric data.',
      default: 'false',
    },
    {
      name: 'id',
      type: 'string',
      description: 'HTML id attribute.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [{name: 'Heading'}],
  usage: {
    anatomy,
    description:
      'Text renders styled body text and headings from the theme. Use Text with a semantic type for body copy, labels, and captions, and Heading for section titles that output the correct h1\u2013h6 element.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pick a semantic type (body, label, supporting, large, code) instead of manually setting size and weight; the theme handles the details.',
      },
      {
        guidance: true,
        description:
          'Set accessibilityLevel on Heading when the visual level differs from the document outline so screen readers announce the correct hierarchy.',
      },
      {
        guidance: true,
        description:
          'Use maxLines with a number to truncate long content; a tooltip appears automatically on hover so no text is lost.',
      },
      {
        guidance: true,
        description:
          'Enable hasTabularNumbers for columns of numeric data so digits align vertically across rows.',
      },
      {
        guidance: false,
        description:
          'Override size and weight when a semantic type already matches; extra overrides fight the theme and break when themes change.',
      },
      {
        guidance: false,
        description:
          'Skip heading levels in the document outline; go h1 then h2 then h3, never h1 then h3.',
      },
      {
        guidance: false,
        description:
          'Use raw HTML tags like <p>, <h1>\u2013<h6>, or <span> for text; Text and Heading apply the correct theme tokens automatically.',
      },
      {
        guidance: false,
        description:
          'Pass a `variant` prop; Text does not have a `variant` prop. Use `type` for semantic styling (body, label, large, supporting, code) or use Heading for headings.',
      },
      {
        guidance: false,
        description:
          'Use Text for headings; use Heading with a `level` prop (1\u20136) for section titles and headings.',
      },
      {
        guidance: false,
        description:
          'Expect `maxLines` to truncate an external `Link` child. Its inline-flex icon layout escapes an ancestor clamp; give the Link its own `maxLines` (a plain Link child is clamped fine).',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'Text renders styled body text and headings from the theme. Use Text with a semantic type for body copy, labels, and captions, and Heading for section titles that output the correct h1\u2013h6 element.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pick a semantic type (body, label, supporting, large, code) instead of manually setting size and weight; the theme handles the details.',
      },
      {
        guidance: true,
        description:
          'Set accessibilityLevel on Heading when the visual level differs from the document outline so screen readers announce the correct hierarchy.',
      },
      {
        guidance: true,
        description:
          'Use maxLines with a number to truncate long content; a tooltip appears automatically on hover so no text is lost.',
      },
      {
        guidance: true,
        description:
          'Enable hasTabularNumbers for columns of numeric data so digits align vertically across rows.',
      },
      {
        guidance: false,
        description:
          'Override size and weight when a semantic type already matches; extra overrides fight the theme and break when themes change.',
      },
      {
        guidance: false,
        description:
          'Skip heading levels in the document outline; go h1 then h2 then h3, never h1 then h3.',
      },
      {
        guidance: false,
        description:
          'Use raw HTML tags like <p>, <h1>\u2013<h6>, or <span> for text; Text and Heading apply the correct theme tokens automatically.',
      },
      {
        guidance: false,
        description:
          'Pass a `variant` prop; Text does not have a `variant` prop. Use `type` for semantic styling (body, label, large, supporting, code) or use Heading for headings.',
      },
      {
        guidance: false,
        description:
          'Use Text for headings; use Heading with a `level` prop (1\u20136) for section titles and headings.',
      },
      {
        guidance: false,
        description:
          'Expect `maxLines` to truncate an external `Link` child. Its inline-flex icon layout escapes an ancestor clamp; give the Link its own `maxLines` (a plain Link child is clamped fine).',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'semantic body text + headings w/ theme-driven type scale, truncation, tabular numbers',
  usage: {
    description:
      'Text renders styled body text and headings. Text for body copy with semantic types, Heading for h1\u2013h6 with theme tokens.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Semantic type (body, label, supporting, large, code) instead of manual size/weight.',
      },
      {
        guidance: true,
        description:
          'accessibilityLevel on Heading when visual level differs from document outline.',
      },
      {
        guidance: true,
        description:
          'maxLines for truncation; tooltip shows full text on hover.',
      },
      {
        guidance: true,
        description: 'hasTabularNumbers for aligned numeric columns.',
      },
      {
        guidance: false,
        description:
          'Override size/weight when a semantic type already matches.',
      },
      {
        guidance: false,
        description: 'Skip heading levels; sequential h1 \u2192 h2 \u2192 h3.',
      },
      {
        guidance: false,
        description: 'Raw <p>/<h1>/<span>; use Text/Heading for theme tokens.',
      },
      {
        guidance: false,
        description: 'maxLines cannot truncate an external Link child; give the Link its own maxLines.',
      },
      {
        guidance: false,
        description:
          '`variant` prop, which does not exist. Use `type` for text styling or Heading for headings.',
      },
      {
        guidance: false,
        description: 'Text for headings: use Heading with level (1\u20136).',
      },
    ],
  },
};
