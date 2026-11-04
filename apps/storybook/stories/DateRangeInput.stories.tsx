// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {DateRangeInput} from '@astryxdesign/core/DateRangeInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Text} from '@astryxdesign/core/Text';
import type {DateRange} from '@astryxdesign/core/DateRangeInput';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

function daysAgo(n: number): ISODateString {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10) as ISODateString;
}

function today(): ISODateString {
  return new Date().toISOString().slice(0, 10) as ISODateString;
}

function startOfMonth(): ISODateString {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10) as ISODateString;
}

const defaultPresets = [
  {label: 'Last 1 day', getRange: () => ({start: daysAgo(1), end: today()})},
  {label: 'Last 3 days', getRange: () => ({start: daysAgo(3), end: today()})},
  {label: 'Last 7 days', getRange: () => ({start: daysAgo(7), end: today()})},
  {
    label: 'Last 14 days',
    getRange: () => ({start: daysAgo(14), end: today()}),
  },
  {
    label: 'Last 30 days',
    getRange: () => ({start: daysAgo(30), end: today()}),
  },
  {
    label: 'This month',
    getRange: () => ({start: startOfMonth(), end: today()}),
  },
];

const meta: Meta<typeof DateRangeInput> = {
  title: 'Core/DateRangeInput',
  component: DateRangeInput,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text', description: 'Label text (required)'},
    isLabelHidden: {
      control: 'boolean',
      description: 'Visually hide the label',
    },
    placeholder: {control: 'text', description: 'Placeholder text'},
    description: {control: 'text', description: 'Description text'},
    isOptional: {control: 'boolean', description: 'Show optional indicator'},
    isRequired: {control: 'boolean', description: 'Mark as required'},
    isDisabled: {control: 'boolean', description: 'Disable the picker'},
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the trigger (activation stays blocked). Use this instead of wrapping a disabled DateRangeInput in Tooltip.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
    hasClear: {control: 'boolean', description: 'Show clear button'},
    numberOfMonths: {
      control: 'radio',
      options: [1, 2],
      description: 'Calendar months',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DateRangeInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date range',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>({
      start: '2026-03-10' as ISODateString,
      end: '2026-03-20' as ISODateString,
    });
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Report period',
  },
};

export const WithPresets: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date range',
    presets: defaultPresets,
  },
};

export const WithPresetsAndValue: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>({
      start: daysAgo(7),
      end: today(),
    });
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Analytics period',
    presets: defaultPresets,
  },
};

export const WithDisabledPresets: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Constrained analytics period',
    presets: defaultPresets,
    maxRangeSpan: 1,
  },
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Coverage period',
    description: 'Select the start and end dates for the report',
  },
};

export const WithMinMax: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Booking dates',
    min: '2026-03-01' as ISODateString,
    max: '2026-06-30' as ISODateString,
    description: 'Available: Mar 1 – Jun 30, 2026',
  },
};

export const MaxRangeSpan: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Reporting period',
    maxRangeSpan: 7,
    description: 'Pick a start date, then any end within a 7-day window',
  },
};

export const RangeSpanBounds: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Stay',
    minRangeSpan: 2,
    maxRangeSpan: 30,
    description: 'At least 2 and at most 30 days',
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Filter by date',
    isOptional: true,
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Coverage period',
    isRequired: true,
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>({
      start: '2026-03-10' as ISODateString,
      end: '2026-03-20' as ISODateString,
    });
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked range',
    isDisabled: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the field to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby on the trigger (activation is still blocked). Use
// disabledMessage instead of wrapping a disabled DateRangeInput in Tooltip, so
// the reason is tied to the field.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Reporting period',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState<DateRange | null>(null);
    const [md, setMd] = useState<DateRange | null>(null);
    const [lg, setLg] = useState<DateRange | null>(null);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '340px',
        }}>
        <DateRangeInput
          label="Small (28px)"
          value={sm}
          onChange={setSm}
          size="sm"
        />
        <DateRangeInput
          label="Medium (32px)"
          value={md}
          onChange={setMd}
          size="md"
        />
        <DateRangeInput
          label="Large (36px)"
          value={lg}
          onChange={setLg}
          size="lg"
        />
      </div>
    );
  },
};

export const SingleMonth: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date range',
    numberOfMonths: 1,
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>(null);
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date range',
    status: {type: 'error', message: 'Please select a date range'},
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>({
      start: '2026-03-01' as ISODateString,
      end: '2026-06-30' as ISODateString,
    });
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date range',
    status: {type: 'warning', message: 'Range exceeds 90 days'},
  },
};

export const NoClear: Story = {
  render: args => {
    const [value, setValue] = useState<DateRange | null>({
      start: '2026-03-10' as ISODateString,
      end: '2026-03-20' as ISODateString,
    });
    return <DateRangeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Required range',
    hasClear: false,
  },
};

export const AllVariations: Story = {
  render: () => {
    const [v1, setV1] = useState<DateRange | null>(null);
    const [v2, setV2] = useState<DateRange | null>({
      start: '2026-03-10' as ISODateString,
      end: '2026-03-20' as ISODateString,
    });
    const [v3, setV3] = useState<DateRange | null>(null);
    const [v4, setV4] = useState<DateRange | null>({
      start: '2026-03-10' as ISODateString,
      end: '2026-03-20' as ISODateString,
    });
    const [v5, setV5] = useState<DateRange | null>(null);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '340px',
        }}>
        <DateRangeInput label="Default" value={v1} onChange={setV1} />
        <DateRangeInput label="With value" value={v2} onChange={setV2} />
        <DateRangeInput
          label="With presets"
          value={v3}
          onChange={setV3}
          presets={defaultPresets}
        />
        <DateRangeInput
          label="Disabled"
          isDisabled
          value={v4}
          onChange={setV4}
        />
        <DateRangeInput
          label="With error"
          value={v5}
          onChange={setV5}
          status={{type: 'error', message: 'Date range is required'}}
        />
      </div>
    );
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<DateRange | null>(null);
    const [b, setB] = useState<DateRange | null>(null);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 320}}>
        <DateRangeInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Please select a date range'}}
        />
        <DateRangeInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Please select a date range'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

/**
 * Theme the clear and calendar-toggle glyphs precisely via `defineTheme`.
 * `components['input-clear-icon'].base` and
 * `components['date-range-input-toggle-icon'].base` scope overrides to the
 * icons themselves (via the `astryx-date-range-input-*-icon` targets), so a
 * theme can recolor, hover-morph, and resize them — without a fragile
 * descendant selector or raw CSS. Same-element rules in `@layer astryx-theme`
 * win over each icon's own base color/size.
 */
const iconTheme = defineTheme({
  name: 'date-range-input-icon-demo',
  components: {
    'input-clear-icon': {
      base: {
        width: '12px',
        height: '12px',
        fontSize: '12px',
        color: 'var(--color-icon-secondary)',
        ':hover': {color: 'var(--color-accent)'},
      },
    },
    'date-range-input-toggle-icon': {
      base: {
        width: '14px',
        height: '14px',
        fontSize: '14px',
        color: 'var(--color-accent)',
      },
    },
  },
});

export const ThemedIcons: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | null>({
      start: daysAgo(7),
      end: today(),
    });
    return (
      <Theme theme={iconTheme} mode="light">
        <div style={{width: 320}}>
          <DateRangeInput
            label="Icons themed (12px clear w/ hover, 14px accent toggle)"
            value={value}
            onChange={setValue}
            hasClear
          />
        </div>
      </Theme>
    );
  },
};

// The StylingParts fields are uncontrolled demos; nothing reads their value.
const noop = () => {};
const CONTROL_STYLE = {outline: '2px dashed #c800ff', outlineOffset: 3};
const CONTAINER_STYLE = {
  backgroundColor: 'rgba(0, 150, 255, 0.16)',
  padding: 8,
  borderRadius: 8,
};

/**
 * Where each styling part lands (family:input-fields FR10). The dashed outline
 * is `controlStyle` on the visual control box. The blue tint is
 * `containerStyle` on the Field box; in a `horizontal-labels` FormLayout and
 * inside InputGroup no Field box renders, so there it has no effect (and warns
 * in development).
 */
export const StylingParts: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24, maxWidth: 360}}>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">controlStyle</Text>
        <div
          data-parts-row="control-standalone"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">Standalone</Text>
          <DateRangeInput
            value={null}
            onChange={noop}
            label="Stay"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateRangeInput
              value={null}
              onChange={noop}
              label="Stay"
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
      </div>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">containerStyle and controlStyle</Text>
        <div
          data-parts-row="container-standalone"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">Standalone</Text>
          <DateRangeInput
            value={null}
            onChange={noop}
            label="Stay"
            containerStyle={CONTAINER_STYLE}
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="container-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateRangeInput
              value={null}
              onChange={noop}
              label="Stay"
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
      </div>
    </div>
  ),
};
