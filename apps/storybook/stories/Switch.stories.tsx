// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Switch} from '@astryxdesign/core/Switch';
import {
  BellIcon,
  MoonIcon,
  ShieldCheckIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof Switch> = {
  title: 'Core/Switch',
  component: Switch,
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
      control: 'boolean',
      description: 'Whether the switch is on or off',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the switch is disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the switch is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the switch focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled Switch in Tooltip.',
    },
    isOptional: {
      control: 'boolean',
      description: 'Whether the field is optional',
    },
    isRequired: {
      control: 'boolean',
      description: 'Whether the switch is required',
    },
    labelPosition: {
      control: 'select',
      options: ['start', 'end'],
      description: 'Which side of the switch the label appears on',
    },
    labelSpacing: {
      control: 'select',
      options: ['hug', 'spread'],
      description: 'Spacing behavior between label and switch',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Enable notifications',
  },
};

export const On: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? true);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Notifications enabled',
    value: true,
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Dark mode',
    description: 'Switch to a darker color scheme for reduced eye strain.',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Toggle row',
    isLabelHidden: true,
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Premium feature',
    description: 'Upgrade to enable this option',
    isDisabled: true,
  },
};

export const DisabledOn: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? true);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Feature enabled',
    value: true,
    isDisabled: true,
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Accept terms and conditions',
    isRequired: true,
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Subscribe to newsletter',
    isOptional: true,
  },
};

export const WithLabelIcon: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Enable notifications',
    description: 'Receive alerts when important events occur',
    labelIcon: BellIcon,
  },
};

export const WithLabelTooltip: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Auto-save',
    labelTooltip: 'Automatically save your changes as you work',
    labelIcon: CloudArrowUpIcon,
  },
};

export const LabelPositionStart: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Enable dark mode',
    labelPosition: 'start',
    labelIcon: MoonIcon,
  },
};

export const LabelSpacingSpread: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <div style={{width: 300, border: '1px solid #ccc', padding: 16}}>
        <Switch
          {...restArgs}
          value={value}
          onChange={checked => setValue(checked)}
        />
      </div>
    );
  },
  args: {
    label: 'Enable notifications',
    labelPosition: 'start',
    labelSpacing: 'spread',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState(false);
    const [value2, setValue2] = useState(true);
    const [value3, setValue3] = useState(false);
    const [value4, setValue4] = useState(true);
    const [value5, setValue5] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <Switch label="Off state" value={value1} onChange={setValue1} />
        <Switch label="On state" value={value2} onChange={setValue2} />
        <Switch
          label="Disabled off"
          value={value3}
          onChange={setValue3}
          isDisabled
        />
        <Switch
          label="Disabled on"
          value={value4}
          onChange={setValue4}
          isDisabled
        />
        <Switch
          label="With description"
          description="Additional context for this setting"
          value={value5}
          onChange={setValue5}
        />
      </div>
    );
  },
};

export const LabelIconVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState(false);
    const [value2, setValue2] = useState(true);
    const [value3, setValue3] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <Switch
          label="Notifications"
          description="Receive push notifications"
          value={value1}
          onChange={setValue1}
          labelIcon={BellIcon}
        />
        <Switch
          label="Dark mode"
          description="Use dark color scheme"
          value={value2}
          onChange={setValue2}
          labelIcon={MoonIcon}
        />
        <Switch
          label="Two-factor authentication"
          description="Add an extra layer of security"
          value={value3}
          onChange={setValue3}
          labelIcon={ShieldCheckIcon}
          isDisabled
        />
      </div>
    );
  },
};

export const LabelPositionComparison: Story = {
  render: () => {
    const [value1, setValue1] = useState(false);
    const [value2, setValue2] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <Switch
          label="Label at end (default)"
          value={value1}
          onChange={setValue1}
          labelPosition="end"
        />
        <Switch
          label="Label at start"
          value={value2}
          onChange={setValue2}
          labelPosition="start"
        />
      </div>
    );
  },
};

export const SpreadSpacingExample: Story = {
  render: () => {
    const [value1, setValue1] = useState(false);
    const [value2, setValue2] = useState(true);
    const [value3, setValue3] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '350px',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '16px',
        }}>
        <Switch
          label="Enable notifications"
          value={value1}
          onChange={setValue1}
          labelPosition="start"
          labelSpacing="spread"
          labelIcon={BellIcon}
        />
        <Switch
          label="Dark mode"
          value={value2}
          onChange={setValue2}
          labelPosition="start"
          labelSpacing="spread"
          labelIcon={MoonIcon}
        />
        <Switch
          label="Auto-save"
          value={value3}
          onChange={setValue3}
          labelPosition="start"
          labelSpacing="spread"
          labelIcon={CloudArrowUpIcon}
          labelTooltip="Save changes automatically as you work"
        />
      </div>
    );
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Accept terms and conditions',
    isRequired: true,
    status: {type: 'error', message: 'You must accept the terms to continue'},
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? true);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Share usage data',
    description: 'Help us improve by sharing anonymous usage statistics',
    status: {type: 'warning', message: 'This data may be shared with partners'},
  },
};

export const WithSuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? true);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Two-factor authentication',
    labelIcon: ShieldCheckIcon,
    status: {type: 'success', message: 'Your account is now more secure'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState(false);
    const [value2, setValue2] = useState(true);
    const [value3, setValue3] = useState(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '400px',
        }}>
        <Switch
          label="Accept terms and conditions"
          value={value1}
          onChange={setValue1}
          isRequired
          status={{
            type: 'error',
            message: 'You must accept the terms to continue',
          }}
        />
        <Switch
          label="Share usage data"
          description="Help us improve by sharing anonymous usage statistics"
          value={value2}
          onChange={setValue2}
          status={{
            type: 'warning',
            message: 'This data may be shared with partners',
          }}
        />
        <Switch
          label="Two-factor authentication"
          value={value3}
          onChange={setValue3}
          labelIcon={ShieldCheckIcon}
          status={{type: 'success', message: 'Your account is now more secure'}}
        />
      </div>
    );
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the switch to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the switch stays focusable (toggling is still blocked).
// Use disabledMessage instead of wrapping a disabled Switch in Tooltip: disabled
// controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Enable notifications',
    isDisabled: true,
    disabledMessage: 'Notifications are turned off org-wide',
  },
};

// The owner changes the value, not the user. A settings page does this when a
// saved value arrives, or when another control implies this one. The switch
// still reports the new state, and is still operable afterwards.
export const ControlledUpdate: Story = {
  render: args => {
    const [value, setValue] = useState(false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '12px',
        }}>
        <Switch
          {...restArgs}
          value={value}
          onChange={checked => setValue(checked)}
        />
        <button type="button" onClick={() => setValue(true)}>
          Turn on remotely
        </button>
      </div>
    );
  },
  args: {
    label: 'Sync photos',
  },
};

// Waiting on the change it just started. The switch stays focusable and reports
// itself busy, and activation is blocked until the change settles, so a second
// press cannot queue a second change.
export const Loading: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? false);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <Switch
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Sync photos',
    isLoading: true,
  },
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold an enabled switch to paint the system's `--color-overlay-pressed` layer on its track and thumb together. The disabled example remains visually unchanged and cannot toggle.",
      },
    },
  },
  render: () => {
    const [off, setOff] = useState(false);
    const [on, setOn] = useState(true);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <Switch label="Off — press and hold" value={off} onChange={setOff} />
        <Switch label="On — press and hold" value={on} onChange={setOn} />
        <Switch
          label="Disabled — no pressed state"
          value={false}
          onChange={() => {}}
          isDisabled
        />
      </div>
    );
  },
};
