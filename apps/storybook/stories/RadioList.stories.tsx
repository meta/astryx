// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Badge} from '@astryxdesign/core/Badge';
import {Link} from '@astryxdesign/core/Link';

const meta: Meta<typeof RadioList> = {
  title: 'Core/RadioList',
  component: RadioList,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text (required)',
    },
    isLabelHidden: {
      control: 'boolean',
      description:
        'Visually hide the label (still accessible to screen readers)',
    },
    description: {
      control: 'text',
      description: 'Description text displayed below the label',
    },
    value: {
      control: 'text',
      description: 'The currently selected value',
    },
    orientation: {
      control: 'select',
      options: ['vertical', 'horizontal'],
      description: 'Layout direction of the radio items',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether all radio items are disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the group is disabled (whole-group state, not per item). With isDisabled, shows a tooltip on hover/keyboard focus and keeps the radios focusable via aria-disabled (selection stays blocked). Use this instead of wrapping a disabled RadioList in Tooltip.',
    },
    isRequired: {
      control: 'boolean',
      description: 'Whether the radio group is required',
    },
    isOptional: {
      control: 'boolean',
      description: 'Whether the field is optional',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RadioList>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem
          label="Email"
          value="email"
          description="Receive notifications via email"
        />
        <RadioListItem
          label="SMS"
          value="sms"
          description="Standard messaging rates apply"
        />
        <RadioListItem
          label="Push notification"
          value="push"
          description="Instant alerts on your device"
        />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    description: 'Choose how you would like to be notified',
  },
};

export const RichContent: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'pro');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem
          label="Starter"
          value="starter"
          description={
            <>
              Free forever. <Link href="#pricing">Compare plans</Link>
            </>
          }
        />
        <RadioListItem
          label={
            <>
              Pro <Link href="#pro-details">details</Link>{' '}
              <Badge label="Popular" />
            </>
          }
          aria-label="Pro"
          value="pro"
          description={
            <>
              $12 per seat. <Link href="#pricing">See what is included</Link>
            </>
          }
          endContent={<span data-testid="radio-end-content">$12/mo</span>}
        />
      </RadioList>
    );
  },
  args: {
    label: 'Plan',
    description:
      'A ReactNode label or description can carry links and other rich content. Nested controls keep their own behavior without selecting the option.',
  },
};

export const Horizontal: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Small" value="sm" />
        <RadioListItem label="Medium" value="md" />
        <RadioListItem label="Large" value="lg" />
      </RadioList>
    );
  },
  args: {
    label: 'Size',
    orientation: 'horizontal',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'email');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    isDisabled: true,
  },
};

export const DisabledItem: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" isDisabled />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    isRequired: true,
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    isOptional: true,
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    isRequired: true,
    status: {type: 'error', message: 'Please select a notification method'},
  },
};

export const WithStartContent: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem
          label="Email"
          value="email"
          startContent={<span>📧</span>}
        />
        <RadioListItem label="SMS" value="sms" startContent={<span>💬</span>} />
        <RadioListItem
          label="Push notification"
          value="push"
          startContent={<span>🔔</span>}
        />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
  },
};

export const WithEndContent: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem
          label="Free"
          value="free"
          endContent={<span style={{color: '#0D8626'}}>$0/mo</span>}
        />
        <RadioListItem
          label="Pro"
          value="pro"
          endContent={<span style={{color: '#0064E0'}}>$9/mo</span>}
        />
        <RadioListItem
          label="Enterprise"
          value="enterprise"
          endContent={<span style={{color: '#5B08D8'}}>Custom</span>}
        />
      </RadioList>
    );
  },
  args: {
    label: 'Plan',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('email');
    const [value3, setValue3] = useState('');
    const [value4, setValue4] = useState('sm');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '400px',
        }}>
        <RadioList label="Unselected" value={value1} onChange={setValue1}>
          <RadioListItem label="Option A" value="a" />
          <RadioListItem label="Option B" value="b" />
        </RadioList>
        <RadioList label="Pre-selected" value={value2} onChange={setValue2}>
          <RadioListItem label="Email" value="email" />
          <RadioListItem label="SMS" value="sms" />
        </RadioList>
        <RadioList
          label="Disabled group"
          value=""
          onChange={() => {}}
          isDisabled>
          <RadioListItem label="Option A" value="a" />
          <RadioListItem label="Option B" value="b" />
        </RadioList>
        <RadioList
          label="With descriptions"
          value={value3}
          onChange={setValue3}>
          <RadioListItem
            label="Email"
            value="email"
            description="Delivered to your inbox"
          />
          <RadioListItem
            label="SMS"
            value="sms"
            description="Standard rates apply"
          />
        </RadioList>
        <RadioList
          label="Horizontal"
          value={value4}
          onChange={setValue4}
          orientation="horizontal">
          <RadioListItem label="S" value="sm" />
          <RadioListItem label="M" value="md" />
          <RadioListItem label="L" value="lg" />
        </RadioList>
        <RadioList
          label="With error"
          value=""
          onChange={() => {}}
          isRequired
          status={{
            type: 'error',
            message: 'Please select an option',
          }}>
          <RadioListItem label="Option A" value="a" />
          <RadioListItem label="Option B" value="b" />
        </RadioList>
      </div>
    );
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the group to see
// why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the radios stay focusable (selection is still blocked).
// disabledMessage applies to the whole-group disabled state. Use it instead of
// wrapping a disabled RadioList in Tooltip: disabled controls swallow the
// pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'email');
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <RadioList {...restArgs} value={value} onChange={setValue}>
        <RadioListItem label="Email" value="email" />
        <RadioListItem label="SMS" value="sms" />
        <RadioListItem label="Push notification" value="push" />
      </RadioList>
    );
  },
  args: {
    label: 'Notification preference',
    isDisabled: true,
    disabledMessage: 'Upgrade your account to change preferences',
  },
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold an enabled option row to paint the system's `--color-overlay-pressed` layer on its indicator. Selected and unselected indicators both respond; the disabled example and the SMS row's nested link remain visually independent and cannot change selection.",
      },
    },
  },
  render: () => {
    const [value, setValue] = useState('email');
    return (
      <RadioList
        label="Notification preference"
        value={value}
        onChange={setValue}>
        <RadioListItem label="Email — selected, press and hold" value="email" />
        <RadioListItem
          label={
            <>
              <span data-testid="radio-row-press-target">
                SMS — press and hold
              </span>{' '}
              <Link href="#details">Details — independent link</Link>
            </>
          }
          aria-label="SMS — press and hold"
          value="sms"
        />
        <RadioListItem
          label="Push — disabled, no pressed state"
          value="push"
          isDisabled
        />
      </RadioList>
    );
  },
};
