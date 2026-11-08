// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {
  BellIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof CheckboxInput> = {
  title: 'Core/CheckboxInput',
  component: CheckboxInput,
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
      control: 'select',
      options: [true, false, 'indeterminate'],
      description:
        'Whether the checkbox is checked, unchecked, or indeterminate',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the checkbox is disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the checkbox is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the checkbox focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled CheckboxInput in Tooltip.',
    },
    isRequired: {
      control: 'boolean',
      description: 'Whether the checkbox is required',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Size of the checkbox',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CheckboxInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Accept terms and conditions',
  },
};

export const Checked: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? true,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'I agree to the terms',
    value: true,
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Subscribe to newsletter',
    description: 'Receive weekly updates about new features and announcements.',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Select row',
    isLabelHidden: true,
  },
};

export const Indeterminate: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? 'indeterminate',
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Select all items',
    description: 'Some items are selected',
    value: 'indeterminate',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
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

export const DisabledChecked: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? true,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
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

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<boolean | 'indeterminate'>(false);
    const [value2, setValue2] = useState<boolean | 'indeterminate'>(true);
    const [value3, setValue3] = useState<boolean | 'indeterminate'>(
      'indeterminate',
    );
    const [value4, setValue4] = useState<boolean | 'indeterminate'>(false);
    const [value5, setValue5] = useState<boolean | 'indeterminate'>(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <CheckboxInput label="Unchecked" value={value1} onChange={setValue1} />
        <CheckboxInput label="Checked" value={value2} onChange={setValue2} />
        <CheckboxInput
          label="Indeterminate"
          description="Some items are selected"
          value={value3}
          onChange={setValue3}
        />
        <CheckboxInput
          label="Disabled unchecked"
          value={value4}
          onChange={setValue4}
          isDisabled
        />
        <CheckboxInput
          label="Disabled checked"
          value={value5}
          onChange={setValue5}
          isDisabled
        />
      </div>
    );
  },
};

export const SmallSize: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Compact checkbox',
    size: 'sm',
  },
};

export const SizeComparison: Story = {
  render: () => {
    const [value1, setValue1] = useState<boolean | 'indeterminate'>(false);
    const [value2, setValue2] = useState<boolean | 'indeterminate'>(false);
    const [value3, setValue3] = useState<boolean | 'indeterminate'>(true);
    const [value4, setValue4] = useState<boolean | 'indeterminate'>(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <CheckboxInput
          label="Medium size (default)"
          data-testid="checkbox-md"
          value={value1}
          onChange={setValue1}
          size="md"
        />
        <CheckboxInput
          label="Small size"
          data-testid="checkbox-sm"
          value={value2}
          onChange={setValue2}
          size="sm"
        />
        <CheckboxInput
          label="Medium size checked"
          data-testid="checkbox-md"
          value={value3}
          onChange={setValue3}
          size="md"
        />
        <CheckboxInput
          label="Small size checked"
          data-testid="checkbox-sm"
          value={value4}
          onChange={setValue4}
          size="sm"
        />
      </div>
    );
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
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

export const StartIconVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<boolean | 'indeterminate'>(false);
    const [value2, setValue2] = useState<boolean | 'indeterminate'>(true);
    const [value3, setValue3] = useState<boolean | 'indeterminate'>(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <CheckboxInput
          label="Email notifications"
          description="Receive updates via email"
          value={value1}
          onChange={setValue1}
          labelIcon={EnvelopeIcon}
        />
        <CheckboxInput
          label="Push notifications"
          description="Get instant alerts on your device"
          value={value2}
          onChange={setValue2}
          labelIcon={BellIcon}
        />
        <CheckboxInput
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

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Accept terms and conditions',
    status: {type: 'error', message: 'You must accept the terms to continue'},
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? true,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
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
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? true,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Email verified',
    status: {type: 'success', message: 'Your email has been verified'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<boolean | 'indeterminate'>(false);
    const [value2, setValue2] = useState<boolean | 'indeterminate'>(true);
    const [value3, setValue3] = useState<boolean | 'indeterminate'>(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '400px',
        }}>
        <CheckboxInput
          label="Accept terms and conditions"
          value={value1}
          onChange={setValue1}
          status={{
            type: 'error',
            message: 'You must accept the terms to continue',
          }}
        />
        <CheckboxInput
          label="Share usage data"
          description="Help us improve by sharing anonymous usage statistics"
          value={value2}
          onChange={setValue2}
          status={{
            type: 'warning',
            message: 'This data may be shared with partners',
          }}
        />
        <CheckboxInput
          label="Email verified"
          value={value3}
          onChange={setValue3}
          status={{type: 'success', message: 'Your email has been verified'}}
        />
      </div>
    );
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the checkbox to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the checkbox stays focusable (toggling is still
// blocked). Use disabledMessage instead of wrapping a disabled CheckboxInput in
// Tooltip: disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<boolean | 'indeterminate'>(
      args.value ?? false,
    );
    const {value: _, onChange: __, ...restArgs} = args;
    return (
      <CheckboxInput
        {...restArgs}
        value={value}
        onChange={checked => setValue(checked)}
      />
    );
  },
  args: {
    label: 'Accept terms',
    isDisabled: true,
    disabledMessage: 'Terms are managed by your administrator',
  },
};

// A theme can replace the checkbox visual outright: the indicator receives the
// state, the CheckboxInput keeps the input, label, focus, and disabled
// behavior. Hover and focus reach the indicator through the row's ancestor
// marker, so a replacement never needs interaction props.
const brandIndicatorTheme = defineTheme({
  name: 'checkbox-indicator-demo',
  indicators: {
    checkbox: ({state, size, isDisabled}) => (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size === 'sm' ? 20 : 24,
          height: size === 'sm' ? 20 : 24,
          border: '1px solid currentColor',
          borderRadius: 6,
          color: '#7c3aed',
          opacity: isDisabled ? 0.5 : 1,
        }}>
        {state === 'checked' ? '★' : state === 'indeterminate' ? '–' : ''}
      </span>
    ),
  },
});

export const ThemedIndicator: Story = {
  render: () => (
    <Theme theme={brandIndicatorTheme} mode="light">
      <div style={{display: 'grid', gap: 12}}>
        <CheckboxInput label="Custom checked glyph" value={true} />
        <CheckboxInput
          label="Custom indeterminate glyph"
          value="indeterminate"
        />
        <CheckboxInput label="Unchecked" value={false} />
        <CheckboxInput label="Disabled" value={true} isDisabled />
      </div>
    </Theme>
  ),
};

// Restyling without replacing: the indicator renders the
// `checkbox-indicator` theme target, so ordinary component overrides reach it.
const roundCheckboxTheme = defineTheme({
  name: 'checkbox-round-demo',
  components: {
    'checkbox-indicator': {
      base: {borderRadius: 'var(--radius-full)'},
      checked: {
        backgroundColor: 'var(--color-positive)',
        borderColor: 'var(--color-positive)',
      },
    },
  },
});

export const ThemedCheckboxTarget: Story = {
  render: () => (
    <Theme theme={roundCheckboxTheme} mode="light">
      <div style={{display: 'grid', gap: 12}}>
        <CheckboxInput label="Round, positive when checked" value={true} />
        <CheckboxInput label="Unchecked" value={false} />
      </div>
    </Theme>
  ),
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold an enabled row to paint the system's `--color-overlay-pressed` layer on its indicator. Checked and unchecked indicators both respond; the disabled example remains visually unchanged.",
      },
    },
  },
  render: () => {
    const [unchecked, setUnchecked] = useState<boolean | 'indeterminate'>(
      false,
    );
    const [checked, setChecked] = useState<boolean | 'indeterminate'>(true);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <CheckboxInput
          label="Unchecked — press and hold"
          value={unchecked}
          onChange={setUnchecked}
        />
        <CheckboxInput
          label="Checked — press and hold"
          value={checked}
          onChange={setChecked}
        />
        <CheckboxInput
          label="Disabled — no pressed state"
          value={false}
          onChange={() => {}}
          isDisabled
        />
      </div>
    );
  },
};
