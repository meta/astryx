// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Message box',
    required: true,
    description: 'Painted container for the validation feedback.',
  },
  {
    name: 'Detached icon',
    required: false,
    description: 'Leading status glyph shown only by the detached variant.',
  },
  {
    name: 'Message text',
    required: true,
    description: 'Text describing the validation status.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'FieldStatus',
  displayName: 'Field Status',
  group: 'Field',
  category: 'Form Controls',
  isHiddenFromOverview: true,
  description:
    'Status message component for form field validation feedback. Messages are announced to screen readers through persistent live regions (assertive for errors, polite otherwise), so conditional mounting is safe.',
  theming: {
    targets: [
      {className: 'astryx-field-status', visualProps: ['type', 'variant']},
      {className: 'astryx-field-status-icon', visualProps: ['type']},
    ],
  },
  props: [
    {
      name: 'type',
      type: "'error' | 'warning' | 'success'",
      description: 'Status type.',
      required: true,
    },
    {
      name: 'message',
      type: 'string',
      description: 'Status message text.',
      required: true,
    },
    {
      name: 'id',
      type: 'string',
      description: 'ID for aria-describedby association.',
    },
    {
      name: 'variant',
      type: "'attached' | 'detached'",
      description:
        'Visual variant: attached overlaps the input, detached floats below.',
      default: "'attached'",
    },
  ],
  usage: {
    description:
      'FieldStatus renders validation feedback for fields and field-like controls. Use it directly for custom controls that need the same error, warning, or success presentation as Field.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use attached status below bordered inputs when the message belongs to that input.',
      },
      {
        guidance: true,
        description:
          'Use detached status for controls like checkboxes, switches, and custom controls where overlap would be visually awkward.',
      },
      {
        guidance: false,
        description:
          'Use FieldStatus for general alerts or page-level notices; use Banner or Toast instead.',
      },
    ],
    anatomy,
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Validation feedback message for fields/custom controls. Supports error, warning, success and attached/detached variants. Announced via persistent live regions (assertive for errors, polite otherwise).',
  usage: {
    bestPractices: [
      {
        guidance: true,
        description:
          'Use attached status below bordered inputs when message belongs to that input.',
      },
      {
        guidance: true,
        description:
          'Use detached status for checkboxes, switches, and custom controls where overlap is visually awkward.',
      },
      {
        guidance: false,
        description:
          'Use FieldStatus for general alerts or page-level notices; use Banner or Toast instead.',
      },
    ],
    anatomy,
  },
  propDescriptions: {
    type: 'error/warning/success status tone',
    message: 'visible validation feedback text',
    id: 'id for aria-describedby association',
    variant: 'attached overlaps input; detached floats below',
  },
};
