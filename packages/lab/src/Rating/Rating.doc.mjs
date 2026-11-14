// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Rating',
  displayName: 'Rating',
  category: 'Data Input',
  keywords: ['rating', 'stars', 'star rating', 'review', 'score', 'feedback'],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'The accessible name of the group, such as "Your rating".',
      required: true,
    },
    {
      name: 'value',
      type: 'number | null',
      description:
        'The current rating, a whole number from 0 to max. null or 0 means not rated. A read-only rating may be fractional, such as an average of 4.3.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: number | null) => void',
      description:
        'Called with the star the user chose, from 1 to max. With allowClear it is called with null when the user chooses the current rating again.',
    },
    {
      name: 'max',
      type: 'number',
      description: 'How many stars there are.',
      default: '5',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Shows the rating without letting the user change it. It is one image with a text name and takes no tab stop.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Stops changes. The group stays focusable and announces disabled.',
      default: 'false',
    },
    {
      name: 'allowClear',
      type: 'boolean',
      description: 'Lets a second choice of the current star clear the rating.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'The size of the stars: 16, 24 or 32 pixels.',
      default: "'md'",
    },
    {
      name: 'getStarLabel',
      type: '(star: number, max: number) => string',
      description:
        'The text name of a rating, such as "3 of 5 stars". Read-only values may be fractional. Built-in names use the locale catalog; supply this callback to change the rating wording.',
      default: 'Localized catalog message',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-rating', visualProps: ['size']}],
  },
  usage: {
    description:
      'A star rating. As an input it is a radio group: one tab stop, the arrow keys move the choice. Down advances and Up retreats; horizontal arrows follow text direction. Home and End pick the first and last star without clearing an already-selected boundary. Under the touch presentation, slide a finger or pen across the stars and lift to choose; leaving the group or cancelling chooses nothing. Coarse-pointer targets expand toward 44 pixels without enlarging the glyphs. With isReadOnly it shows a rating, such as a product average, as one image with a text name.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the rating in state and pass it as value; the component does not hold it.',
      },
      {
        guidance: true,
        description:
          'Give the group a label that says what is rated, such as "Rate this recipe".',
      },
      {
        guidance: true,
        description:
          'Use isReadOnly with a fractional value to show an average.',
      },
      {
        guidance: false,
        description:
          'Use it for a choice that is not an ordered scale; use RadioList or SegmentedControl.',
      },
      {
        guidance: false,
        description:
          'Rely on the star fill alone to show the rating; the text name of the star carries it for assistive technology.',
      },
    ],
  },
};
