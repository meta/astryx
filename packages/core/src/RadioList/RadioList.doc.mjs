// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'RadioList',
  displayName: 'Radio List',
  group: 'Radio',
  category: 'Form Controls',
  keywords: [
    'radiolist',
    'radio',
    'radiogroup',
    'radiobutton',
    'optionlist',
    'singlechoice',
    'choicelist',
  ],
  theming: {
    targets: [
      {className: 'astryx-radio-list', visualProps: ['orientation', 'size']},
      {
        className: 'astryx-radio-list-item',
        visualProps: ['size'],
        states: ['selected', 'disabled'],
      },
      {
        className: 'astryx-radio-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-radio-indicator-dot', visualProps: ['size']},
    ],
  },
  description:
    'Radio group container with field integration for label, description, and status.',
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the radio group (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: 'The currently selected value.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when the selected value changes.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'RadioListItem elements.',
      slotElements: [
        {
          __element: 'RadioListItem',
          props: {
            label: 'Option',
            value: 'option',
          },
        },
      ],
      required: true,
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
      name: 'orientation',
      type: "'vertical' | 'horizontal'",
      description: 'Layout direction of the radio items.',
      default: "'vertical'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether all radio items are disabled.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'The HTML name attribute shared by the radio inputs, useful for form submissions. When omitted, a unique internal name still groups the radios.',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the group is disabled. Applies to the whole-group disabled state (isDisabled), not per item. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the radios focusable via aria-disabled (selection stays blocked). Use this instead of wrapping a disabled RadioList in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Whether the radio group is required.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'Whether the field is optional (mutually exclusive with isRequired).',
      default: 'false',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Status indicator ({ type, message }).',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Size of the radio controls.',
      default: "'md'",
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text for an info icon next to the label.',
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
  components: [{name: 'RadioListItem'}],
  usage: {
    accessibility: [
      {
        name: 'Radio circle',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Rest', 'Hover', 'Pointer down', 'Selected'],
        description:
          'The circle edge (unselected) and fill (selected) must have at least 3:1 contrast with the surface behind them. For Hover and Pointer down, measure the final colors after the tint and the pressed overlay are applied.',
      },
    ],
    description:
      'A group of options where only one can be selected at a time. All options are visible at once, making it easy to compare choices. Use it when users need to pick one option from a small set.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the number of options small: typically 2 to 7 choices.',
      },
      {
        guidance: true,
        description:
          'Use clear, concise labels that differentiate each option at a glance.',
      },
      {
        guidance: true,
        description:
          "Pre-select a default option when there's a sensible default; don't leave the group empty unless the choice is optional.",
      },
      {
        guidance: false,
        description:
          'Use when multiple selections are needed; use CheckboxList instead.',
      },
      {
        guidance: false,
        description:
          'Use for long lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description:
          'Use horizontal layout with more than 4 options; it wraps awkwardly.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled RadioList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: false,
        description: 'Optional heading above the radio list.',
      },
      {
        name: 'Children',
        required: true,
        description: 'The radio list items rendered as selectable options.',
      },
      {
        name: 'Label/Value',
        required: true,
        description: 'The text label and associated value for each radio item.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'A group of options where only one can be selected at a time. All options are visible at once, making it easy to compare choices. Use it when users need to pick one option from a small set.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the number of options small: typically 2 to 7 choices.',
      },
      {
        guidance: true,
        description:
          'Use clear, concise labels that differentiate each option at a glance.',
      },
      {
        guidance: true,
        description:
          "Pre-select a default option when there's a sensible default; don't leave the group empty unless the choice is optional.",
      },
      {
        guidance: false,
        description:
          'Use when multiple selections are needed; use CheckboxList instead.',
      },
      {
        guidance: false,
        description:
          'Use for long lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description:
          'Use horizontal layout with more than 4 options; it wraps awkwardly.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled RadioList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: false,
        description: 'Optional heading above the radio list.',
      },
      {
        name: 'Children',
        required: true,
        description: 'The radio list items rendered as selectable options.',
      },
      {
        name: 'Label/Value',
        required: true,
        description: 'The text label and associated value for each radio item.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Radio group component for single-value selection from list of options.',
  usage: {
    description:
      'A group of options where only one can be selected at a time. All options are visible at once, making it easy to compare choices. Use it when users need to pick one option from a small set.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the number of options small: typically 2 to 7 choices.',
      },
      {
        guidance: true,
        description:
          'Use clear, concise labels that differentiate each option at a glance.',
      },
      {
        guidance: true,
        description:
          "Pre-select a default option when there's a sensible default; don't leave the group empty unless the choice is optional.",
      },
      {
        guidance: false,
        description:
          'Use when multiple selections are needed; use CheckboxList instead.',
      },
      {
        guidance: false,
        description:
          'Use for long lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description:
          'Use horizontal layout with more than 4 options; it wraps awkwardly.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled RadioList in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
    anatomy: [
      {
        name: 'Header',
        required: false,
        description: 'Optional heading above the radio list.',
      },
      {
        name: 'Children',
        required: true,
        description: 'The radio list items rendered as selectable options.',
      },
      {
        name: 'Label/Value',
        required: true,
        description: 'The text label and associated value for each radio item.',
      },
    ],
  },
};
