// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {HashtagIcon, CurrencyDollarIcon} from '@heroicons/react/24/outline';

const meta: Meta<typeof NumberInput> = {
  title: 'Core/NumberInput',
  component: NumberInput,
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
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    description: {
      control: 'text',
      description: 'Description text displayed between the label and input',
    },
    value: {
      control: 'number',
      description: 'Current input value (number, null, or undefined)',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
    isOptional: {
      control: 'boolean',
      description:
        'Whether the field is optional (mutually exclusive with isRequired)',
    },
    isRequired: {
      control: 'boolean',
      description:
        'Whether the field is required (mutually exclusive with isOptional)',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    isReadOnly: {
      control: 'boolean',
      description:
        'Whether the input is read-only. The value still submits with the form but cannot be edited. Unlike isDisabled it is not dimmed and keeps its form value.',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled NumberInput in Tooltip.',
    },
    status: {
      control: 'object',
      description:
        'Status indicator with type (warning/error/success) and optional message',
    },
    labelTooltip: {
      control: 'text',
      description:
        'Tooltip text to display in an info icon at the end of the label',
    },
    min: {
      control: 'number',
      description: 'Minimum value allowed',
    },
    max: {
      control: 'number',
      description: 'Maximum value allowed',
    },
    step: {
      control: 'number',
      description: 'Step increment for the input',
    },
    formatValue: {
      control: false,
      description: 'Formats the committed value while the input is not focused',
    },
    isWheelEnabled: {
      control: 'boolean',
      description:
        'Whether a wheel gesture over the focused input steps the value',
    },
    hasNumberSteppers: {
      control: 'boolean',
      description: 'Shows increment and decrement buttons',
    },
    units: {
      control: 'text',
      description:
        'Units text to display at the end of the input (e.g., "%" or "GB")',
    },
    isIntegerOnly: {
      control: 'boolean',
      description: 'Only allow integer values (no floating point)',
    },
    autoComplete: {
      control: 'text',
      description: 'HTML autocomplete attribute',
    },
  },
};

export default meta;
type Story = StoryObj<typeof NumberInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Quantity',
    placeholder: 'Enter quantity',
  },
};

export const PasteFormattedNumber: Story = {
  render: () => {
    const [enUS, setEnUS] = useState<number | null>(null);
    const [deDE, setDeDE] = useState<number | null>(null);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
        <div>
          <NumberInput
            label="Impressions (en-US)"
            description="Paste 1,234,234,234 or $1,234.56, then blur"
            placeholder="Paste a formatted number"
            value={enUS}
            onChange={setEnUS}
            hasClear
          />
          <p data-testid="en-committed">Committed: {String(enUS)}</p>
        </div>
        <InternationalizationProvider locale="de-DE">
          <div>
            <NumberInput
              label="Impressionen (de-DE)"
              description="Paste 1.234.234.234 or 1,5"
              placeholder="Paste a formatted number"
              value={deDE}
              onChange={setDeDE}
              formatValue={value =>
                new Intl.NumberFormat('de-DE').format(value)
              }
              hasClear
            />
            <p data-testid="de-committed">Committed: {String(deDE)}</p>
          </div>
        </InternationalizationProvider>
      </div>
    );
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Age',
    description: 'Enter your age in years',
    placeholder: 'Enter your age',
  },
};

export const WithMinMax: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Rating',
    placeholder: '1-5',
    min: 1,
    max: 5,
    description: 'Rate from 1 to 5',
  },
};

export const WithStep: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Price',
    placeholder: '0.00',
    min: 0,
    step: 0.01,
    startIcon: CurrencyDollarIcon,
  },
};

export const FormattedDisplay: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 1234.56);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Monthly revenue',
    value: 1234.56,
    min: 0,
    step: 0.01,
    description: 'Focus the input to edit the raw numeric value',
    formatValue: value =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value),
  },
};

export const WithNumberSteppers: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 2);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Quantity',
    value: 2,
    min: 0,
    max: 10,
    hasNumberSteppers: true,
  },
};

export const WheelBehavior: Story = {
  render: () => {
    const [enabledValue, setEnabledValue] = useState<number | null>(2);
    const [disabledValue, setDisabledValue] = useState<number | null>(2);
    return (
      <div
        style={{
          width: 360,
          height: 260,
          overflowY: 'auto',
          padding: 16,
          border: '1px solid #ccd3db',
        }}>
        <div style={{height: 140}}>Scroll down to the focused examples.</div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          <NumberInput
            label="Wheel stepping enabled (default)"
            description="Focus, then use the wheel to change the value"
            value={enabledValue}
            onChange={setEnabledValue}
          />
          <NumberInput
            label="Wheel stepping disabled"
            description="Focused wheel gestures continue scrolling"
            value={disabledValue}
            onChange={setDisabledValue}
            isWheelEnabled={false}
          />
        </div>
        <div style={{height: 180}} />
      </div>
    );
  },
};

export const WithUnits: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 50);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Discount',
    placeholder: 'Enter discount',
    min: 0,
    max: 100,
    units: '%',
  },
};

export const WithUnitsGB: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 128);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Storage',
    placeholder: 'Enter storage',
    min: 0,
    units: 'GB',
  },
};

export const IntegerOnly: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Count',
    placeholder: 'Enter count',
    isIntegerOnly: true,
    description: 'Only accepts whole numbers',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 42);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Quantity',
    value: 42,
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<number | null>(null);
    const [value2, setValue2] = useState<number | null>(null);
    const [value3, setValue3] = useState<number | null>(100);
    const [value4, setValue4] = useState<number | null>(null);
    const [value5, setValue5] = useState<number | null>(null);
    const [value6, setValue6] = useState<number | null>(null);
    const [value7, setValue7] = useState<number | null>(null);
    const [value8, setValue8] = useState<number | null>(50);
    const [value9, setValue9] = useState<number | null>(75);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <NumberInput
          label="Visible label"
          value={value1}
          onChange={setValue1}
          placeholder="Enter number..."
        />
        <NumberInput
          label="With description"
          description="Helpful description text"
          value={value4}
          onChange={setValue4}
          placeholder="Enter number..."
        />
        <NumberInput
          label="Hidden label"
          isLabelHidden
          value={value2}
          onChange={setValue2}
          placeholder="Hidden label input"
        />
        <NumberInput label="With value" value={value3} onChange={setValue3} />
        <NumberInput
          label="Optional field"
          isOptional
          value={value5}
          onChange={setValue5}
          placeholder="Optional..."
        />
        <NumberInput
          label="Required field"
          isRequired
          value={value6}
          onChange={setValue6}
          placeholder="Required..."
        />
        <NumberInput
          label="With min/max"
          description="Enter a value between 1 and 10"
          min={1}
          max={10}
          value={value7}
          onChange={setValue7}
          placeholder="1-10"
        />
        <NumberInput
          label="Disabled field"
          isDisabled
          value={value8}
          onChange={setValue8}
        />
        <NumberInput
          label="With units"
          value={value9}
          onChange={setValue9}
          units="%"
        />
      </div>
    );
  },
};

export const OptionalField: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Phone Extension',
    isOptional: true,
    placeholder: 'Enter extension',
  },
};

export const RequiredField: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Quantity',
    isRequired: true,
    placeholder: 'Enter quantity',
  },
};

// Read-only shows a value the user should see and send but not change. Unlike
// a disabled field it is not dimmed and still submits.
export const ReadOnly: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 1024);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Allocated storage (GB)',
    isReadOnly: true,
    value: 1024,
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 100);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked Amount',
    isDisabled: true,
    value: 100,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the input to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the input stays focusable (editing is still blocked).
// Use disabledMessage instead of wrapping a disabled NumberInput in Tooltip:
// disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 100);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Quantity',
    isDisabled: true,
    disabledMessage: 'Editing is locked while the order is processing',
    value: 100,
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Count',
    placeholder: 'Enter count...',
    startIcon: HashtagIcon,
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState<number | null>(null);
    const [md, setMd] = useState<number | null>(null);
    const [lg, setLg] = useState<number | null>(null);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <NumberInput
          label="Small (28px)"
          value={sm}
          onChange={setSm}
          placeholder="Small size"
          size="sm"
        />
        <NumberInput
          label="Medium (32px)"
          value={md}
          onChange={setMd}
          placeholder="Medium size (default)"
          size="md"
        />
        <NumberInput
          label="Large (36px)"
          value={lg}
          onChange={setLg}
          placeholder="Large size"
          size="lg"
        />
      </div>
    );
  },
};

export const ErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? -5);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Age',
    placeholder: 'Enter your age',
    min: 0,
    status: {type: 'error', message: 'Age must be a positive number'},
  },
};

export const WarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 150);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Age',
    placeholder: 'Enter your age',
    status: {type: 'warning', message: 'This value seems unusually high'},
  },
};

export const SuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 25);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Age',
    placeholder: 'Enter your age',
    status: {type: 'success', message: 'Valid age'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [error, setError] = useState<number | null>(-5);
    const [warning, setWarning] = useState<number | null>(150);
    const [success, setSuccess] = useState<number | null>(25);
    const [errorNoMsg, setErrorNoMsg] = useState<number | null>(0);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <NumberInput
          label="Error with message"
          value={error}
          onChange={setError}
          status={{type: 'error', message: 'Must be positive'}}
        />
        <NumberInput
          label="Warning with message"
          value={warning}
          onChange={setWarning}
          status={{type: 'warning', message: 'Value seems high'}}
        />
        <NumberInput
          label="Success with message"
          value={success}
          onChange={setSuccess}
          status={{type: 'success', message: 'Looks good'}}
        />
        <NumberInput
          label="Error without message"
          value={errorNoMsg}
          onChange={setErrorNoMsg}
          status={{type: 'error'}}
        />
      </div>
    );
  },
};

export const WithTooltip: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'API Rate Limit',
    placeholder: 'Enter rate limit',
    labelTooltip: 'Maximum number of API requests per minute',
  },
};

export const DecimalInput: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    return <NumberInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Price',
    placeholder: '0.00',
    min: 0,
    step: 0.01,
    startIcon: CurrencyDollarIcon,
    description: 'Enter amount in dollars',
  },
};

export const WithEventHandlers: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? null);
    const [events, setEvents] = useState<string[]>([]);

    const addEvent = (event: string) => {
      setEvents(prev => [...prev.slice(-4), event]);
    };

    return (
      <div style={{maxWidth: '300px'}}>
        <NumberInput
          label={args.label}
          placeholder={args.placeholder}
          description={args.description}
          value={value}
          onChange={v => {
            setValue(v);
            addEvent(`onChange: ${v}`);
          }}
          onFocus={() => addEvent('onFocus')}
          onBlur={() => addEvent('onBlur')}
          onEnter={() => addEvent('onEnter')}
        />
        <div
          style={{
            marginTop: '16px',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}>
          <strong>Events:</strong>
          <ul style={{margin: '4px 0', paddingLeft: '20px'}}>
            {events.map((event, i) => (
              <li key={i}>{event}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
  args: {
    label: 'Interactive',
    placeholder: 'Type and press Enter',
    description: 'Events are logged below',
  },
};

export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 42);
    return <NumberInput {...args} value={value} onChange={setValue} hasClear />;
  },
  args: {
    label: 'Quantity',
    placeholder: 'Enter a number',
  },
};

export const ClearableWithUnits: Story = {
  render: args => {
    const [value, setValue] = useState<number | null>(args.value ?? 75);
    return <NumberInput {...args} value={value} onChange={setValue} hasClear />;
  },
  args: {
    label: 'Progress',
    units: '%',
    min: 0,
    max: 100,
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<number | null>(-5);
    const [b, setB] = useState<number | null>(-5);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 280}}>
        <NumberInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Must be a positive number'}}
        />
        <NumberInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Must be a positive number'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};
