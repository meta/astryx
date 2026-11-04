// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Group',
    required: true,
    description: 'Container for the labeled checkbox group.',
  },
  {
    name: 'Group label',
    required: true,
    description: 'Text identifying what the checkbox options represent.',
  },
  {
    name: 'Description',
    required: false,
    description: 'Helper text below the group label.',
  },
  {
    name: 'Options list',
    required: true,
    description: 'List containing the available checkbox options.',
  },
  {
    name: 'Option row',
    required: true,
    description: 'Selectable row containing one option.',
  },
  {
    name: 'Checkbox',
    required: true,
    description: 'Selection indicator for an option.',
  },
  {
    name: 'Option label',
    required: true,
    description: 'Primary content identifying an option.',
  },
  {
    name: 'Option description',
    required: false,
    description: 'Secondary text below an option label.',
  },
  {
    name: 'End content',
    required: false,
    description: 'Caller-provided content at the end of an option row.',
  },
  {
    name: 'Spinner',
    required: false,
    description: 'Loading indicator shown inside the pending checkbox.',
  },
  {
    name: 'Status message',
    required: false,
    description: 'Error, warning, or success message below the group.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CheckboxList',
  displayName: 'Checkbox List',
  group: 'Checkbox',
  category: 'Form Controls',
  isHiddenFromOverview: true,
  keywords: [
    'checkboxlist',
    'checkbox',
    'checkboxgroup',
    'multichoice',
    'multiselect',
    'checklist',
  ],
  description:
    'Checkbox group container with field integration for label, description, and status.',
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the checkbox group (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'CheckboxListItem elements.',
      slotElements: [
        {
          __element: 'CheckboxListItem',
          props: {
            label: 'Option',
            value: 'option',
          },
        },
      ],
      required: true,
    },
    {
      name: 'value',
      type: 'string[]',
      description: 'The currently selected values (collection mode).',
    },
    {
      name: 'onChange',
      type: '(values: string[]) => void',
      description: 'Callback fired when the selected values change.',
    },
    {
      name: 'changeAction',
      type: '(values: string[]) => void | Promise<void>',
      description:
        'Async action on change with optimistic updates. While the promise is pending, the toggled item shows a spinner inside its checkbox and is marked aria-busy.',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Whether to visually hide the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed below the label.',
    },
    {
      name: 'density',
      type: "'compact' | 'balanced' | 'spacious'",
      description: 'Spacing density for list items.',
      default: "'balanced'",
    },
    {
      name: 'hasDividers',
      type: 'boolean',
      description: 'Whether to show dividers between items.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether all checkbox items are disabled.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the group is disabled. Applies to the whole-group disabled state (isDisabled), not per item. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the checkboxes focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled CheckboxList in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Whether all checkbox items are read-only. Displays the current state at full opacity but prevents interaction. Unlike isDisabled, read-only checkboxes are not visually dimmed.',
      default: 'false',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Status indicator ({ type, message }).',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description: 'Class name for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input.',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: 'Class name for the visual control box.',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the visual control box.',
    },
  ],
  components: [{name: 'CheckboxListItem'}],
  usage: {
    anatomy,
    description:
      'CheckboxList shows a small group of checkboxes so users can turn several options on or off at once. Place it in settings pages, filter panels, or forms where every choice should be visible without scrolling. For a single standalone checkbox (like "I agree to the terms"), use CheckboxInput instead. If only one option can be picked, use RadioList. If the list is long enough to need searching or scrolling, use MultiSelector instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the list short: three to seven options is the sweet spot. Beyond that, switch to MultiSelector which adds search and scrolling.',
      },
      {
        guidance: true,
        description:
          'Turn on dividers (hasDividers) when items have helper text underneath; without them the labels and descriptions blur together.',
      },
      {
        guidance: true,
        description:
          'Write a group label that says what the choices represent: "Export formats" tells users more than "Options".',
      },
      {
        guidance: false,
        description:
          'Show a CheckboxList when the user can only pick one thing; that is what RadioList is for.',
      },
      {
        guidance: false,
        description:
          'Put buttons or links inside the trailing slot (endContent); the whole row is already tappable, so a nested button creates two competing click targets.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled CheckboxList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  theming: {
    targets: [{className: 'astryx-checkbox-list'}],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'CheckboxList shows a small group of checkboxes so users can turn several options on or off at once. Place it in settings pages, filter panels, or forms where every choice should be visible without scrolling. For a single standalone checkbox (like "I agree to the terms"), use CheckboxInput instead. If only one option can be picked, use RadioList. If the list is long enough to need searching or scrolling, use MultiSelector instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the list short: three to seven options is the sweet spot. Beyond that, switch to MultiSelector which adds search and scrolling.',
      },
      {
        guidance: true,
        description:
          'Turn on dividers (hasDividers) when items have helper text underneath; without them the labels and descriptions blur together.',
      },
      {
        guidance: true,
        description:
          'Write a group label that says what the choices represent: "Export formats" tells users more than "Options".',
      },
      {
        guidance: false,
        description:
          'Show a CheckboxList when the user can only pick one thing; that is what RadioList is for.',
      },
      {
        guidance: false,
        description:
          'Put buttons or links inside the trailing slot (endContent); the whole row is already tappable, so a nested button creates two competing click targets.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled CheckboxList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Checkbox group component for multi-value selection. Collection mode (parent state) + standalone mode (per-item state).',
  usage: {
    description:
      'CheckboxList shows a small group of checkboxes so users can turn several options on or off at once. Place it in settings pages, filter panels, or forms where every choice should be visible without scrolling. For a single standalone checkbox (like "I agree to the terms"), use CheckboxInput instead. If only one option can be picked, use RadioList. If the list is long enough to need searching or scrolling, use MultiSelector instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the list short: three to seven options is the sweet spot. Beyond that, switch to MultiSelector which adds search and scrolling.',
      },
      {
        guidance: true,
        description:
          'Turn on dividers (hasDividers) when items have helper text underneath; without them the labels and descriptions blur together.',
      },
      {
        guidance: true,
        description:
          'Write a group label that says what the choices represent: "Export formats" tells users more than "Options".',
      },
      {
        guidance: false,
        description:
          'Show a CheckboxList when the user can only pick one thing; that is what RadioList is for.',
      },
      {
        guidance: false,
        description:
          'Put buttons or links inside the trailing slot (endContent); the whole row is already tappable, so a nested button creates two competing click targets.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled CheckboxList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};
