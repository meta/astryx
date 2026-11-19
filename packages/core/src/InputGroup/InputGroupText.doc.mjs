// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'InputGroupText',
  subComponentOf: 'InputGroup',
  displayName: 'Input Group Text',
  isHiddenFromOverview: true,
  description:
    'A prefix or suffix text element rendered inside InputGroup. Displays text or icons.',
  usage: {
    description:
      "Use InputGroupText inside InputGroup for a short fixed prefix or suffix, such as a currency symbol, a protocol, or a unit, or for a decorative icon. It is plain text, not a control, and it is not part of the input's accessible name.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the text short, such as $, https://, or kg. It stays on one line and does not shrink.',
      },
      {
        guidance: true,
        description:
          'Plain text keeps its character order under right-to-left, so https:// and .com read as written. When rich content mixes directions, mark the direction on your own content, for example with `dir` or `<bdi>`.',
      },
      {
        guidance: true,
        description:
          'Put what a screen reader user needs in the input\'s own label, such as "Amount in USD" beside a $ prefix. The addon is read as plain text in reading order.',
      },
      {
        guidance: false,
        description:
          'Put buttons, links, or other controls inside InputGroupText. Use a Button addon for an action.',
      },
      {
        guidance: false,
        description:
          'Use InputGroupText outside InputGroup. Its borders and corners join an InputGroup row.',
      },
    ],
    anatomy: [
      {
        name: 'Text cell',
        required: true,
        description:
          'A non-interactive cell that holds text or an icon and joins the borders of its neighbours in the row.',
      },
    ],
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Text or icon content.',
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name(s).',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: 'Inline styles.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the text cell element.',
    },
  ],
};

export const docsDense = {
  name: 'InputGroupText',
  isHiddenFromOverview: true,
  displayName: 'Input Group Text',
  description: 'prefix/suffix text/icon element',
  propDescriptions: {
    children: 'text or icon content',
    xstyle: 'StyleX styles (stylex.create() value)',
    className: 'CSS class name(s)',
    style: 'inline styles',
    ref: 'ref to the text cell',
  },
};
