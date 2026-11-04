// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {DateTimeInput} from '@astryxdesign/core/DateTimeInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Text} from '@astryxdesign/core/Text';
import type {ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof DateTimeInput> = {
  title: 'Core/DateTimeInput',
  component: DateTimeInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A date-time field that fits the pointer it is used with. On a mouse or trackpad it renders the existing side-by-side date and time inputs: the date half opens a calendar popover, and the time half accepts typed entry plus optional preset times.\n\n' +
          "Where the primary pointer is a finger (`pointer: coarse`), the closed control still renders separate Date and Time segments; tapping either segment opens a bottom sheet directly to the matching section. A segmented Date/Time pill stays at the top of the sheet for switching; Date reuses Astryx's custom swipable month picker and month/year wheels, its Save date action advances to Time, and Time uses accessible hour/minute/second wheels with the final Save action. The public props are the same on both surfaces.\n\n" +
          '**Seeing the touch surface:** open any story on a phone/tablet or in device emulation reporting a coarse pointer. No separate story is needed because the same component chooses the surface at runtime.',
      },
    },
  },
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
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the fields (activation stays blocked). Use this instead of wrapping a disabled DateTimeInput in Tooltip.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
    hourFormat: {
      control: 'radio',
      options: ['12h', '24h'],
      description: 'Hour format for display',
    },
    hasSeconds: {
      control: 'boolean',
      description: 'Whether to include seconds in the time',
    },
    hasClear: {
      control: 'boolean',
      description: 'Whether to show a clear button',
    },
    presentation: {
      control: 'select',
      options: [
        'popover',
        'bottom-sheet',
        'native',
        'adaptive-bottom-sheet',
        'adaptive-native',
      ],
      description:
        'Which surfaces draw the pickers (spec:AST-043); nativePicker is deprecated',
    },
    nativePicker: {
      control: 'radio',
      options: ['touch', 'always', 'never'],
      description:
        "Deprecated — use presentation ('touch' → 'adaptive-native', 'always' → 'native', 'never' → 'adaptive-bottom-sheet'); presentation wins when both are set",
    },
    numberOfMonths: {
      control: 'radio',
      options: [1, 2],
      description: 'Number of months to display in calendar',
    },
    timeIncrement: {
      control: 'number',
      description:
        'Desktop only: minutes to increment/decrement with arrow keys. Mobile touch uses wheels.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DateTimeInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
    placeholder: 'Select a date',
  },
};

export const NarrowContainer: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    return (
      <div style={{width: '320px', maxWidth: '100%'}}>
        <DateTimeInput {...args} value={value} onChange={setValue} />
      </div>
    );
  },
  args: {
    label: 'Meeting time',
    hasClear: true,
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event time',
  },
};

export const NativePickerModes: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <DateTimeInput
          label="presentation='adaptive-native' (default)"
          description="Native date and compatible time controls on a coarse primary pointer"
          value={value}
          onChange={setValue}
          presentation="adaptive-native"
        />
        <DateTimeInput
          label="presentation='native'"
          description="Native date and compatible time controls on every pointer type"
          value={value}
          onChange={setValue}
          presentation="native"
        />
        <DateTimeInput
          label="presentation='adaptive-bottom-sheet'"
          description="Astryx bottom sheet on coarse pointers; calendar popover on fine pointers"
          value={value}
          onChange={setValue}
          presentation="adaptive-bottom-sheet"
        />
      </div>
    );
  },
};

export const TwentyFourHourFormat: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Appointment',
    hourFormat: '24h',
  },
};

export const WithSeconds: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30:45' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Log timestamp',
    hasSeconds: true,
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Deadline',
    description: 'When is this task due?',
    placeholder: 'Select deadline',
  },
};

export const WithClearButton: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T09:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start time',
    hasClear: true,
  },
};

/**
 * Selects a date, clears the controlled value, and reopens the calendar. The
 * final frame is the regression endpoint: an empty field with no selected day.
 */
export const ClearedCalendarSelection: Story = {
  tags: ['visual-baseline'],
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T09:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
    hasClear: true,
    min: '2026-03-01T00:00' as ISODateTimeString,
    max: '2026-03-31T23:59' as ISODateTimeString,
    presentation: 'popover',
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', {name: 'Open calendar'}));
    await userEvent.click(canvas.getByRole('button', {name: /March 20, 2026/}));
    await userEvent.click(
      canvas.getByRole('button', {name: 'Clear Meeting time'}),
    );
    await userEvent.click(canvas.getByRole('button', {name: 'Open calendar'}));

    await waitFor(() => {
      expect(
        canvas.queryAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(0);
    });
  },
};

export const WithMinMax: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Appointment',
    min: '2026-03-15T09:00' as ISODateTimeString,
    max: '2026-03-15T17:00' as ISODateTimeString,
    description: 'Available: Mar 15, 9 AM - 5 PM',
  },
};

export const WithTimeIncrement: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T09:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Time slot',
    timeIncrement: 15,
    description: 'Use arrow keys to change by 15 minutes',
  },
};

/**
 * `timeOptionInterval` turns the time field into a combobox over a list of
 * preset times at that cadence. Click the time field or press Alt+ArrowDown to
 * open it; ArrowUp/ArrowDown move through the list, Enter picks, Escape closes.
 *
 * The list is a shortcut, not a restriction — a time between two options can
 * still be typed, and with the list closed the arrow keys keep stepping by
 * `timeIncrement` exactly as they do without this prop.
 */
export const WithTimeOptions: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T09:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
    timeOptionInterval: 30,
    description: 'Pick from half-hour slots, or type any time',
  },
};

/**
 * An hourly list — the 12 AM to 11 PM shape most scheduling flows want.
 * `min` and `max` trim the list on the boundary date, so only bookable hours
 * are offered.
 */
export const WithHourlyTimeOptions: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T13:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Office hours',
    timeOptionInterval: 60,
    min: '2026-03-15T09:00' as ISODateTimeString,
    max: '2026-03-15T17:00' as ISODateTimeString,
    description: 'Hourly slots, trimmed to 9 AM - 5 PM',
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Preferred time',
    isOptional: true,
    placeholder: 'Select a date (optional)',
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start time',
    isRequired: true,
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T10:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked time',
    isDisabled: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the field to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby on the fields (activation is still blocked). Use
// disabledMessage instead of wrapping a disabled DateTimeInput in Tooltip, so
// the reason is tied to the field.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState<ISODateTimeString | undefined>(undefined);
    const [md, setMd] = useState<ISODateTimeString | undefined>(undefined);
    const [lg, setLg] = useState<ISODateTimeString | undefined>(undefined);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '460px',
        }}>
        <DateTimeInput
          label="Small (28px)"
          value={sm}
          onChange={setSm}
          placeholder="Small size"
          size="sm"
        />
        <DateTimeInput
          label="Medium (32px)"
          value={md}
          onChange={setMd}
          placeholder="Medium size (default)"
          size="md"
        />
        <DateTimeInput
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

export const TwoMonthCalendar: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Travel departure',
    numberOfMonths: 2,
    presentation: 'adaptive-bottom-sheet',
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event time',
    status: {
      type: 'error',
      message: 'This time slot is not available',
    },
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T07:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
    status: {
      type: 'warning',
      message: 'Early morning meeting - are you sure?',
    },
  },
};

export const WithSuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateTimeString | undefined>(
      '2026-03-15T10:00' as ISODateTimeString,
    );
    return <DateTimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Scheduled time',
    status: {
      type: 'success',
      message: 'Time slot is available',
    },
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    const [value2, setValue2] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    const [value3, setValue3] = useState<ISODateTimeString | undefined>(
      '2026-03-15T14:30' as ISODateTimeString,
    );
    const [value4, setValue4] = useState<ISODateTimeString | undefined>(
      undefined,
    );
    const [value5, setValue5] = useState<ISODateTimeString | undefined>(
      '2026-03-15T10:00' as ISODateTimeString,
    );
    const [value6, setValue6] = useState<ISODateTimeString | undefined>(
      '2026-03-15T22:00' as ISODateTimeString,
    );

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '460px',
        }}>
        <DateTimeInput
          label="Default"
          value={value1}
          onChange={setValue1}
          placeholder="Select a date"
        />
        <DateTimeInput
          label="With value (12h)"
          value={value2}
          onChange={setValue2}
        />
        <DateTimeInput
          label="24-hour format"
          value={value3}
          onChange={setValue3}
          hourFormat="24h"
        />
        <DateTimeInput
          label="With description"
          description="Pick your preferred datetime"
          value={value4}
          onChange={setValue4}
        />
        <DateTimeInput
          label="Disabled"
          isDisabled
          value={value5}
          onChange={setValue5}
        />
        <DateTimeInput
          label="With error"
          value={value6}
          onChange={setValue6}
          status={{
            type: 'error',
            message: 'Invalid datetime selection',
          }}
        />
      </div>
    );
  },
};

/**
 * Theme the two segments precisely via `defineTheme`.
 *
 * Before the segment targets existed, the date and time wrappers were
 * anonymous nodes with hashed atomic classes only, so a theme that restyles
 * input geometry through the `text-input` / `date-input` / `time-input`
 * targets could not reach them — DateTimeInput rendered visibly shorter than
 * every other input under such a theme.
 *
 * `components['date-time-input-date-segment']` and its time twin scope
 * overrides to one segment each, and both reflect `size` and `status` the same
 * way the root does. Defaults are unchanged; this story only demonstrates the
 * override channel.
 */
const segmentTheme = defineTheme({
  name: 'date-time-input-segments-demo',
  components: {
    'date-time-input-date-segment': {
      base: {borderColor: 'var(--color-accent)'},
    },
    'date-time-input-time-segment': {
      base: {backgroundColor: 'var(--color-background-muted)'},
    },
  },
});

export const ThemedSegments: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateTimeString | undefined>();
    return (
      <Theme theme={segmentTheme} mode="light">
        <DateTimeInput
          label="Themed segments"
          description="Date segment gets an accent border; time segment a muted fill."
          value={value}
          onChange={setValue}
        />
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
        <div data-parts-row="control-popover" style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="popover"</Text>
          <DateTimeInput
            onChange={noop}
            label="Starts"
            presentation="popover"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div data-parts-row="control-native" style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="native"</Text>
          <DateTimeInput
            onChange={noop}
            label="Starts"
            presentation="native"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-bottom-sheet"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="bottom-sheet"</Text>
          <DateTimeInput
            onChange={noop}
            label="Starts"
            presentation="bottom-sheet"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateTimeInput
              onChange={noop}
              label="Starts"
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
      </div>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">containerStyle and controlStyle</Text>
        <div
          data-parts-row="container-popover"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="popover"</Text>
          <DateTimeInput
            onChange={noop}
            label="Starts"
            presentation="popover"
            containerStyle={CONTAINER_STYLE}
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="container-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateTimeInput
              onChange={noop}
              label="Starts"
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
      </div>
    </div>
  ),
};
