// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
import {
  Squares2X2Icon,
  ListBulletIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Core/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant for the control',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the entire control is disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the control is disabled (whole-group state, not per segment). With isDisabled, shows a tooltip on hover/keyboard focus and keeps the control focusable via aria-disabled (selection stays blocked). Use this instead of wrapping a disabled SegmentedControl in Tooltip.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = {
  args: {
    size: 'md',
    isDisabled: false,
  },
  render: args => {
    const [value, setValue] = useState('grid');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="View mode"
        size={args.size}
        isDisabled={args.isDisabled}>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>
    );
  },
};

export const InVerticalStack: Story = {
  name: 'Inside a vertical stack',
  render: () => {
    const [value, setValue] = useState('viewer');
    return (
      <VStack width="100%">
        <SegmentedControl
          value={value}
          onChange={setValue}
          label="Access level"
          layout="hug">
          <SegmentedControlItem value="viewer" label="Viewer" />
          <SegmentedControlItem value="operator" label="Operator" />
          <SegmentedControlItem value="owner" label="Owner" />
        </SegmentedControl>
      </VStack>
    );
  },
};

const WORKSPACE_SUMMARY: Record<string, string> = {
  overview: '4 projects, 2 due this week.',
  activity: '18 updates since Monday.',
  members: '12 members, 3 pending invites.',
  billing: 'Next invoice on October 1.',
};

function WorkspaceCard() {
  const [view, setView] = useState('overview');
  return (
    <Card maxWidth={480}>
      <VStack gap={3}>
        <Heading level={3}>Team workspace</Heading>
        <SegmentedControl
          label="Workspace view"
          value={view}
          onChange={setView}>
          <SegmentedControlItem value="overview" label="Overview" />
          <SegmentedControlItem value="activity" label="Activity" />
          <SegmentedControlItem value="members" label="Members" />
          <SegmentedControlItem value="billing" label="Billing" />
        </SegmentedControl>
        <Text color="secondary">{WORKSPACE_SUMMARY[view]}</Text>
      </VStack>
    </Card>
  );
}

/**
 * The SegmentedControl.doc.mjs "In a narrow card" example at 320px, 390px, and
 * 480px. With room (390px and 480px) the hug control keeps its content width
 * inside the VStack instead of stretching. At 320px it caps at the card width
 * and its labels truncate instead of running past the card edge.
 */
export const InNarrowCard: Story = {
  name: 'In a narrow card',
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
      {[320, 390, 480].map(width => (
        <div key={width} style={{width}}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}>
            {width}px
          </p>
          <WorkspaceCard />
        </div>
      ))}
    </div>
  ),
};

export const WithIcons: Story = {
  args: {
    size: 'md',
  },
  render: args => {
    const [value, setValue] = useState('grid');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="View mode"
        size={args.size}>
        <SegmentedControlItem
          value="grid"
          label="Grid"
          icon={<Icon icon={Squares2X2Icon} color="inherit" />}
        />
        <SegmentedControlItem
          value="list"
          label="List"
          icon={<Icon icon={ListBulletIcon} color="inherit" />}
        />
        <SegmentedControlItem
          value="table"
          label="Table"
          icon={<Icon icon={TableCellsIcon} color="inherit" />}
        />
      </SegmentedControl>
    );
  },
};

export const IconOnly: Story = {
  args: {
    size: 'sm',
  },
  render: args => {
    const [value, setValue] = useState('grid');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="View mode"
        size={args.size}>
        <SegmentedControlItem
          value="grid"
          label="Grid"
          isLabelHidden
          icon={<Icon icon={Squares2X2Icon} color="inherit" />}
        />
        <SegmentedControlItem
          value="list"
          label="List"
          isLabelHidden
          icon={<Icon icon={ListBulletIcon} color="inherit" />}
        />
      </SegmentedControl>
    );
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [value, setValue] = useState('day');
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
        <div>
          <div
            style={{
              marginBottom: '8px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
            }}>
            Small
          </div>
          <SegmentedControl
            value={value}
            onChange={setValue}
            label="Time period"
            size="sm">
            <SegmentedControlItem value="day" label="Day" />
            <SegmentedControlItem value="week" label="Week" />
            <SegmentedControlItem value="month" label="Month" />
          </SegmentedControl>
        </div>
        <div>
          <div
            style={{
              marginBottom: '8px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
            }}>
            Medium (default)
          </div>
          <SegmentedControl
            value={value}
            onChange={setValue}
            label="Time period"
            size="md">
            <SegmentedControlItem value="day" label="Day" />
            <SegmentedControlItem value="week" label="Week" />
            <SegmentedControlItem value="month" label="Month" />
          </SegmentedControl>
        </div>
        <div>
          <div
            style={{
              marginBottom: '8px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
            }}>
            Large
          </div>
          <SegmentedControl
            value={value}
            onChange={setValue}
            label="Time period"
            size="lg">
            <SegmentedControlItem value="day" label="Day" />
            <SegmentedControlItem value="week" label="Week" />
            <SegmentedControlItem value="month" label="Month" />
          </SegmentedControl>
        </div>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = useState('all');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="Filter"
        isDisabled>
        <SegmentedControlItem value="all" label="All" />
        <SegmentedControlItem value="active" label="Active" />
        <SegmentedControlItem value="completed" label="Completed" />
      </SegmentedControl>
    );
  },
};

export const DisabledItem: Story = {
  render: () => {
    const [value, setValue] = useState('hourly');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="Data granularity">
        <SegmentedControlItem value="hourly" label="Hourly" />
        <SegmentedControlItem value="daily" label="Daily" />
        <SegmentedControlItem value="weekly" label="Weekly" isDisabled />
      </SegmentedControl>
    );
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the control to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the selected segment stays focusable (selection is still
// blocked). disabledMessage applies to the whole-group disabled state. Use it
// instead of wrapping a disabled SegmentedControl in Tooltip: disabled controls
// swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: () => {
    const [value, setValue] = useState('all');
    return (
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="Filter"
        isDisabled
        disabledMessage="Choose a project to filter tasks">
        <SegmentedControlItem value="all" label="All" />
        <SegmentedControlItem value="active" label="Active" />
        <SegmentedControlItem value="completed" label="Completed" />
      </SegmentedControl>
    );
  },
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold an unselected item to see the system's `--color-overlay-pressed` layer. The selected item keeps its raised surface, and the disabled item remains visually unchanged and cannot be selected.",
      },
    },
  },
  render: () => {
    const [value, setValue] = useState('grid');
    return (
      <SegmentedControl value={value} onChange={setValue} label="View mode">
        <SegmentedControlItem value="grid" label="Grid — selected" />
        <SegmentedControlItem value="list" label="List — press and hold" />
        <SegmentedControlItem value="board" label="Board" />
        <SegmentedControlItem
          value="unavailable"
          label="Unavailable — no pressed state"
          isDisabled
        />
      </SegmentedControl>
    );
  },
};

const PERIODS = [
  {value: 'day', label: 'Day'},
  {value: 'week', label: 'Week'},
  {value: 'month', label: 'Month'},
  {value: 'year', label: 'Year to date'},
];

/**
 * On a touch screen the selection slides from one segment to the next on
 * UIKit's spring, whether a finger, a key or the app changed the value. With a
 * mouse or a pen every change, a click included, slides on the theme's
 * duration and easing, and a drag carries it as a finger does.
 */
export const SelectionMotion: Story = {
  name: 'Selection motion',
  parameters: {
    docs: {
      description: {
        story:
          'Under a finger the selection slides between segments on UIKit’s spring, for taps, arrow keys and programmatic changes alike (the button changes the value from outside). Drag the selected segment to another one and let go: the segment under the finger is chosen, and letting go outside the control selects nothing. Under Reduce Motion nothing travels: the old selection fades out as the new one fades in. With a mouse or a pen every change, a click included, slides on the theme’s duration and easing, and a drag carries the selection as a finger does.',
      },
    },
  },
  render: () => {
    const [value, setValue] = useState('day');
    const next = () => {
      const index = PERIODS.findIndex(period => period.value === value);
      setValue(PERIODS[(index + 1) % PERIODS.length].value);
    };
    return (
      <VStack gap={4} width="100%">
        <SegmentedControl value={value} onChange={setValue} label="Period">
          {PERIODS.map(period => (
            <SegmentedControlItem key={period.value} {...period} />
          ))}
        </SegmentedControl>
        <SegmentedControl
          value={value}
          onChange={setValue}
          label="Period, filling the row"
          layout="fill">
          {PERIODS.map(period => (
            <SegmentedControlItem key={period.value} {...period} />
          ))}
        </SegmentedControl>
        <Button label="Next period" onClick={next} />
      </VStack>
    );
  },
};
