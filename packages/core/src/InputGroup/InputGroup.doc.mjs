// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'InputGroup',
  displayName: 'Input Group',
  group: 'Field',
  category: 'Form Controls',
  isHiddenFromOverview: true,
  keywords: [
    'inputgroup',
    'addon',
    'prefix',
    'suffix',
    'connected',
    'grouped',
    'input',
  ],
  theming: {
    targets: [
      {className: 'astryx-input-group', visualProps: ['size', 'status']},
      {className: 'astryx-input-group-text'},
    ],
  },
  description:
    'Groups an input with prefix/suffix addons in a visually connected container with shared border and focus ring.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'InputGroupText, Button addons, and compatible input children: TextInput, NumberInput, TimeInput, DateInput, Typeahead, Selector, or MultiSelector.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the group.',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hide the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Helper text between label and input group.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disable the entire group.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Show "(optional)" indicator.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Mark the field as required.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Default size for inputs in the group.',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Status indicator applied to the group border.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text at the end of the label.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector.',
    },
  ],
  components: [{name: 'InputGroupText'}],
  usage: {
    description:
      'InputGroup connects an input with prefix/suffix addons in a single visual unit. Use it for URL fields, currency inputs, search fields with action buttons, or any input that needs contextual decorations.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use text addons to show units, prefixes, or suffixes that clarify the input format (e.g., "$", "kg", "https://").',
      },
      {
        guidance: true,
        description:
          'Use InputGroupText for static prefixes/suffixes like "$", "kg", or "https://".',
      },
      {
        guidance: true,
        description:
          'Use Button for an action attached to the input; InputGroup connects its corners automatically.',
      },
      {
        guidance: true,
        description:
          'Use InputGroup with compatible single-line inputs: TextInput, NumberInput, TimeInput, DateInput, Typeahead, Selector, and MultiSelector.',
      },
      {
        guidance: true,
        description:
          "Keep each inner input's label specific; grouped inputs automatically combine the group label with their own label and inherit the group description/status context.",
      },
      {
        guidance: false,
        description:
          "Don't put multiple text inputs in one group; use separate fields instead.",
      },
      {
        guidance: false,
        description:
          "Don't use InputGroup for unrelated inputs; it's for a single input with decorations.",
      },
      {
        guidance: false,
        description:
          "Don't use InputGroup with TextArea, Slider, Switch, CheckboxInput, or RadioList.",
      },
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text above the group.'},
      {
        name: 'Prefix addon',
        required: false,
        description: 'Content before the input (text, icon, or button).',
      },
      {
        name: 'Input',
        required: true,
        description:
          'The main input element (TextInput, NumberInput, TimeInput, DateInput, Typeahead, Selector, or MultiSelector).',
      },
      {
        name: 'Suffix addon',
        required: false,
        description: 'Content after the input (text, icon, or button).',
      },
      {
        name: 'Status message',
        required: false,
        description: 'An error, warning, or success message below the group.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'groups input with prefix/suffix addons in a connected container',
  usage: {
    description:
      'InputGroup connects an input with addons. Use for URL fields, currency inputs, search with actions.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use text addons to show units, prefixes, or suffixes that clarify input format (e.g. "$", "kg", "https://").',
      },
      {
        guidance: true,
        description:
          'Use InputGroupText for static prefixes/suffixes like "$", "kg", or "https://".',
      },
      {
        guidance: true,
        description:
          'Use Button for an action attached to the input; InputGroup connects its corners automatically.',
      },
      {
        guidance: true,
        description:
          'Use InputGroup with compatible single-line inputs: TextInput, NumberInput, TimeInput, DateInput, Typeahead, Selector, and MultiSelector.',
      },
      {
        guidance: true,
        description:
          "Keep each inner input's label specific; grouped inputs combine the group label with their own label and inherit group description/status.",
      },
      {
        guidance: false,
        description:
          "Don't put multiple text inputs in one group; use separate fields instead.",
      },
      {
        guidance: false,
        description:
          "Don't use InputGroup for unrelated inputs; it's for a single input with decorations.",
      },
      {
        guidance: false,
        description:
          "Don't use InputGroup with TextArea, Slider, Switch, CheckboxInput, or RadioList.",
      },
    ],
  },
};
