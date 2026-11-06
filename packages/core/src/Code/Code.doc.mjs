// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Code',
  displayName: 'Code',
  keywords: ['inlinecode', 'monospace'],
  group: 'Code',
  category: 'Content',
  description:
    'Inline code element with a monospace font and muted background. Use it for short code references within prose.',
  usage: {
    description:
      'Code marks short inline references such as function names, variables, file paths, and command-line flags. Use CodeBlock for standalone or multi-line snippets.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use Code for short technical terms inside prose, such as a function name, prop, file path, or command-line flag.',
      },
      {
        guidance: true,
        description:
          "Set size to 'inherit' when inline code should match the surrounding text size and line height.",
      },
      {
        guidance: false,
        description:
          'Use Code for multi-line or standalone snippets. Use CodeBlock instead so readers get appropriate block formatting and syntax support.',
      },
      {
        guidance: false,
        description:
          'Use Code as an interactive copy or navigation control. Pair it with the appropriate Button or Link when an action is required.',
      },
    ],
    anatomy: [
      {
        name: 'Container',
        required: true,
        description:
          'The semantic code element that contains the inline code content and paints the background, typography, padding, and radius.',
      },
    ],
  },
  playground: {
    defaults: {
      children: 'const count = 0',
    },
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The inline code content.',
      required: true,
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'inherit'",
      description:
        "Text color. Use 'inherit' to take the surrounding text color.",
      default: "'primary'",
    },
    {
      name: 'size',
      type: "'inherit'",
      description:
        "Set to 'inherit' to take the surrounding font size and line height. Omit it to use the code type-scale size.",
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLElement>',
      description: 'Ref forwarded to the semantic code element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description:
        'CSS class name for the root element. Prefer xstyle for styling.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles for the root element. Prefer xstyle for StyleX-optimized styling.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-code', visualProps: ['color']}],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'inline semantic code for short technical references in prose; CodeBlock handles standalone or multi-line snippets',
  usage: {
    description:
      'Use for short function names, variables, paths, and CLI flags inside prose. Use CodeBlock for standalone or multi-line snippets.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use for short technical references inside prose.',
      },
      {
        guidance: true,
        description:
          "Set size='inherit' to match surrounding text size and line height.",
      },
      {
        guidance: false,
        description:
          'Use for multi-line or standalone snippets; use CodeBlock instead.',
      },
      {
        guidance: false,
        description:
          'Use as an interactive control; pair with Button or Link for actions.',
      },
    ],
  },
  propDescriptions: {
    children: 'inline code content.',
    color:
      'text color: primary, secondary, or inherited from surrounding text.',
    size: "set to 'inherit' to take the surrounding font size and line height.",
    ref: 'ref forwarded to the semantic code element.',
    xstyle:
      'StyleX layout styles; must be a stylex.create() value, not an inline style object.',
    className: 'CSS class for the root; prefer xstyle.',
    style: 'inline styles for the root; prefer xstyle.',
    'data-testid': 'test selector for automated testing frameworks.',
  },
};
