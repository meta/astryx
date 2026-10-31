// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Control',
    required: true,
    description: 'Container for the mutually exclusive segment choices.',
  },
  {
    name: 'Segment',
    required: true,
    description: 'Individual choice within the control.',
  },
  {
    name: 'Label',
    required: false,
    description: 'Visible text identifying a segment when its label is not hidden.',
  },
  {
    name: 'Icon',
    required: false,
    description: 'Optional caller-supplied icon shown inside a segment.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SegmentedControl',
  displayName: 'Segmented Control',
  group: 'SegmentedControl',
  category: 'Action',
  keywords: ['radio', 'tabs', 'toggle', 'toggle-group', 'pill', 'button-group', 'switch', 'segment', 'control'],
  playground: {
    defaults: {
      value: 'option-1',
    },
  },
  examples: [
    {
      label: 'In a narrow card',
      code: `
import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const SUMMARY = {
  overview: '4 projects, 2 due this week.',
  activity: '18 updates since Monday.',
  members: '12 members, 3 pending invites.',
  billing: 'Next invoice on October 1.',
};

// Inside a VStack the default hug layout keeps its content width; it does not
// stretch to the card. When the card is narrower than the control (a 320px
// phone column), the control caps at the card width and each label truncates
// with an ellipsis instead of running past the card edge. The full label stays
// each segment's accessible name. Keep labels short for phone widths.
function WorkspaceCard() {
  const [view, setView] = useState('overview');
  return (
    <Card maxWidth={480}>
      <VStack gap={3}>
        <Heading level={3}>Team workspace</Heading>
        <SegmentedControl label="Workspace view" value={view} onChange={setView}>
          <SegmentedControlItem value="overview" label="Overview" />
          <SegmentedControlItem value="activity" label="Activity" />
          <SegmentedControlItem value="members" label="Members" />
          <SegmentedControlItem value="billing" label="Billing" />
        </SegmentedControl>
        <Text color="secondary">{SUMMARY[view]}</Text>
      </VStack>
    </Card>
  );
}
`,
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-segmented-control', visualProps: ['size']},
      {className: 'astryx-segmented-control-item', visualProps: ['size'], states: ['selected', 'disabled']},
    ],
    vars: [
      {name: '--_segmented-control-radius', description: 'Border radius of the segmented control', default: 'var(--radius-element)', private: true},
      {name: '--_segmented-control-padding', description: 'Inner padding of the segmented control', default: 'var(--spacing-0-5)', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_segmented-control-radius']},
      {property: 'padding', vars: ['--_segmented-control-padding']},
    ],
  },
  description: 'Container wrapper providing context (value, onChange, size, isDisabled) to SegmentedControlItem children.',
  props: [
    {
      name: 'value',
      type: 'string',
      description: 'The currently selected value (controlled).',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when a segment is selected.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the radio group (used as aria-label, never rendered visually).',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Size variant for the control. On coarse pointers every size is floored to a 44px touch target (WCAG 2.2 AA "Target Size (Minimum)").',
      default: "'md'",
    },
    {
      name: 'layout',
      type: "'hug' | 'fill'",
      description: 'Layout mode. hug (default) sizes segments to content, capped at the container width (segment labels truncate when it is too narrow); fill stretches them equally to fill the container.',
      default: "'hug'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the entire control is disabled.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the control is disabled. Applies to the whole-group disabled state (isDisabled), not per segment. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the control focusable via aria-disabled (selection stays blocked). Use this instead of wrapping a disabled SegmentedControl in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'SegmentedControlItem children.',
      slotElements: [
        {
          __element: 'SegmentedControlItem',
          props: {
            label: 'Option',
            value: 'option',
          },
        },
      ],
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {name: 'SegmentedControlItem'},
  ],
  usage: {
    anatomy,
    description:
      'A segmented button group that allows users to make a single selection from a small set of mutually exclusive options. Use SegmentedControl when all options should be visible at once and the selection controls a value or mode, not page navigation.',
    accessibility: [
      {
        name: 'Text label',
        category: 'Color contrast',
        criterion: '1.4.3 Contrast (Minimum)',
        requirement: '4.5:1',
        states: ['Rest', 'Hover', 'Pointer down', 'Selected'],
        description:
          'Each label must have at least 4.5:1 contrast with its segment background. Check unselected, Hover, Pointer down, and selected colors as they appear on screen. For Hover and Pointer down, measure the final background after the overlay is applied.',
      },
      {
        name: 'Essential icon',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Icon only'],
        description:
          'When a segment has no visible label, its icon must have at least 3:1 contrast with the segment background. An icon beside a visible label does not need its own check.',
      },
      {
        name: 'Selected state indicator',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1 if relied upon',
        states: ['Selected'],
        description:
          'The selected background must reach 3:1 only when users need it to tell selected from unselected. Label color and weight also show selection.',
      },
      {
        name: 'Visible control boundary',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1 if needed',
        states: ['Rest'],
        description:
          'The control edge or segment borders need at least 3:1 contrast when users need them to see the choices.',
      },
      {
        name: 'Keyboard focus indicator',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Focus visible'],
        description:
          'The focus outline must have at least 3:1 contrast with the area around the segment. Check it on the track and selected background.',
      },
      {
        name: 'Disabled appearance',
        category: 'Color contrast',
        criterion: '1.4.3 and 1.4.11 exceptions',
        requirement: 'Not required',
        states: ['Disabled'],
        description:
          'Disabled controls do not need to meet these contrast ratios.',
      },
    ],
    bestPractices: [
      {guidance: true, description: 'Use for switching between 2–5 mutually exclusive views or modes where all options should be visible.'},
      {guidance: true, description: 'Provide a descriptive label for the control to ensure the group is accessible to screen readers.'},
      {guidance: false, description: 'Use for page-level navigation; use TabList instead. TabList is a navigation component, while SegmentedControl is an input that always has exactly one selected option.'},
      {guidance: false, description: 'Use for simple on/off states; use ToggleButton instead. ToggleButton can be toggled on or off independently, while SegmentedControl enforces a single selection from a group.'},
      {guidance: false, description: 'Wrap a disabled SegmentedControl in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    anatomy,
    description:
      'A segmented button group that allows users to make a single selection from a small set of mutually exclusive options. Use SegmentedControl when all options should be visible at once and the selection controls a value or mode, not page navigation.',
    bestPractices: [
      {guidance: true, description: 'Use for switching between 2–5 mutually exclusive views or modes where all options should be visible.'},
      {guidance: true, description: 'Provide a descriptive label for the control to ensure the group is accessible to screen readers.'},
      {guidance: false, description: 'Use for page-level navigation; use TabList instead. TabList is a navigation component, while SegmentedControl is an input that always has exactly one selected option.'},
      {guidance: false, description: 'Use for simple on/off states; use ToggleButton instead. ToggleButton can be toggled on or off independently, while SegmentedControl enforces a single selection from a group.'},
      {guidance: false, description: 'Wrap a disabled SegmentedControl in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    anatomy,
    description:
      'A segmented button group that allows users to make a single selection from a small set of mutually exclusive options. Use SegmentedControl when all options should be visible at once and the selection controls a value or mode, not page navigation.',
    bestPractices: [
      {guidance: true, description: 'Use for switching between 2–5 mutually exclusive views or modes where all options should be visible.'},
      {guidance: true, description: 'Provide a descriptive label for the control to ensure the group is accessible to screen readers.'},
      {guidance: false, description: 'Use for page-level navigation; use TabList instead. TabList is a navigation component, while SegmentedControl is an input that always has exactly one selected option.'},
      {guidance: false, description: 'Use for simple on/off states; use ToggleButton instead. ToggleButton can be toggled on or off independently, while SegmentedControl enforces a single selection from a group.'},
      {guidance: false, description: 'Wrap a disabled SegmentedControl in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.'},
    ],
  },
  propDescriptions: {
    value: 'currently selected value (controlled)',
    onChange: 'callback on segment selection',
    label: 'aria-label for radio group (never rendered)',
    size: 'size variant',
    layout: 'hug (default) sizes to content, capped at container; fill stretches equally',
    isDisabled: 'disables entire control',
    children: 'SegmentedControlItem children',
    xstyle: 'additional StyleX styles for container',
  },
};
