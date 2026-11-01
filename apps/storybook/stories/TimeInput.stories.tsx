// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Text} from '@astryxdesign/core/Text';
import {InputGroup, InputGroupText} from '@astryxdesign/core/InputGroup';
import type {ISOTimeString} from '@astryxdesign/core';

const meta: Meta<typeof TimeInput> = {
  title: 'Core/TimeInput',
  component: TimeInput,
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
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the input (activation stays blocked). Use this instead of wrapping a disabled TimeInput in Tooltip.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the input',
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
        'text-input',
        'popover',
        'bottom-sheet',
        'native',
        'adaptive-bottom-sheet',
        'adaptive-native',
      ],
      description:
        'Which surface selects the time (spec:AST-043); nativePicker is deprecated',
    },
    nativePicker: {
      control: 'radio',
      options: ['touch', 'always', 'never'],
      description:
        "Deprecated — use presentation ('touch' → 'adaptive-native', 'always' → 'native', 'never' → 'text-input'); presentation wins when both are set",
    },
    increment: {
      control: 'number',
      description: 'Minutes to increment/decrement with arrow keys',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TimeInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Time',
    placeholder: 'Select a time',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '14:30' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting time',
  },
};

export const NativePickerModes: Story = {
  render: () => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '14:30' as ISOTimeString,
    );
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <TimeInput
          label="presentation='adaptive-native' (default)"
          description="Native picker on a coarse primary pointer; Astryx typed field on a fine pointer"
          value={value}
          onChange={setValue}
          presentation="adaptive-native"
        />
        <TimeInput
          label="presentation='native'"
          description="Native picker wherever input type=time is compatible"
          value={value}
          onChange={setValue}
          presentation="native"
        />
        <TimeInput
          label="presentation='adaptive-bottom-sheet'"
          description="Astryx bottom sheet on a coarse primary pointer; Astryx typed field on a fine pointer"
          value={value}
          onChange={setValue}
          presentation="adaptive-bottom-sheet"
        />
        <TimeInput
          label="presentation='text-input'"
          description="Astryx typed field on every pointer type"
          value={value}
          onChange={setValue}
          presentation="text-input"
        />
      </div>
    );
  },
};

export const TwentyFourHourFormat: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '14:30' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Time (24h)',
    hourFormat: '24h',
  },
};

export const WithSeconds: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '14:30:45' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Precise time',
    hasSeconds: true,
  },
};

export const WithClearButton: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '09:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start time',
    hasClear: true,
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Alarm time',
    description: 'When should we wake you up?',
    placeholder: 'Set alarm time',
  },
};

export const WithMinMax: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Appointment time',
    min: '09:00' as ISOTimeString,
    max: '17:00' as ISOTimeString,
    description: 'Business hours: 9 AM - 5 PM',
    placeholder: 'Select appointment time',
  },
};

export const WithIncrement: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '09:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Time slot',
    increment: 15,
    description: 'Use arrow keys to change by 15 minutes',
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Preferred time',
    isOptional: true,
    placeholder: 'Select a time (optional)',
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start time',
    isRequired: true,
    placeholder: 'Select a start time',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '10:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked time',
    isDisabled: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the field to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby (activation is still blocked). Use disabledMessage instead
// of wrapping a disabled TimeInput in Tooltip, so the reason is tied to the
// field.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start time',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
  },
};

export const SmallSize: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(undefined);
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Time',
    size: 'sm',
    placeholder: 'Select a time',
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '22:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event time',
    status: {
      type: 'error',
      message: 'Time must be during business hours',
    },
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '07:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
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
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '10:00' as ISOTimeString,
    );
    return <TimeInput {...args} value={value} onChange={setValue} />;
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
    const [value1, setValue1] = useState<ISOTimeString | undefined>(undefined);
    const [value2, setValue2] = useState<ISOTimeString | undefined>(
      '14:30' as ISOTimeString,
    );
    const [value3, setValue3] = useState<ISOTimeString | undefined>(
      '09:15:30' as ISOTimeString,
    );
    const [value4, setValue4] = useState<ISOTimeString | undefined>(undefined);
    const [value5, setValue5] = useState<ISOTimeString | undefined>(undefined);
    const [value6, setValue6] = useState<ISOTimeString | undefined>(
      '10:00' as ISOTimeString,
    );
    const [value7, setValue7] = useState<ISOTimeString | undefined>(
      '22:00' as ISOTimeString,
    );

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TimeInput
          label="Default (12h)"
          value={value1}
          onChange={setValue1}
          placeholder="Select a time"
        />
        <TimeInput
          label="24-hour format"
          value={value2}
          onChange={setValue2}
          hourFormat="24h"
        />
        <TimeInput
          label="With seconds"
          value={value3}
          onChange={setValue3}
          hasSeconds
        />
        <TimeInput
          label="With clear button"
          value={value4}
          onChange={setValue4}
          hasClear
          placeholder="Select a time"
        />
        <TimeInput
          label="With description"
          description="Pick your preferred time"
          value={value5}
          onChange={setValue5}
          placeholder="Select a time"
        />
        <TimeInput
          label="Disabled"
          isDisabled
          value={value6}
          onChange={setValue6}
        />
        <TimeInput
          label="With error"
          value={value7}
          onChange={setValue7}
          status={{
            type: 'error',
            message: 'Invalid time selection',
          }}
        />
      </div>
    );
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<ISOTimeString | undefined>(
      '22:00' as ISOTimeString,
    );
    const [b, setB] = useState<ISOTimeString | undefined>(
      '22:00' as ISOTimeString,
    );
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 280}}>
        <TimeInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Must be during business hours'}}
        />
        <TimeInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Must be during business hours'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

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
          data-parts-row="control-text-input"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="text-input"</Text>
          <TimeInput
            label="Start time"
            presentation="text-input"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div data-parts-row="control-native" style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="native"</Text>
          <TimeInput
            label="Start time"
            presentation="native"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-bottom-sheet"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="bottom-sheet"</Text>
          <TimeInput
            label="Start time"
            presentation="bottom-sheet"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <TimeInput label="Start time" controlStyle={CONTROL_STYLE} />
          </FormLayout>
        </div>
        <div
          data-parts-row="control-input-group"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">InputGroup</Text>
          <InputGroup label="Start time group">
            <InputGroupText>At</InputGroupText>
            <TimeInput
              label="Start time"
              isLabelHidden
              controlStyle={CONTROL_STYLE}
            />
          </InputGroup>
        </div>
      </div>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">containerStyle and controlStyle</Text>
        <div
          data-parts-row="container-text-input"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="text-input"</Text>
          <TimeInput
            label="Start time"
            presentation="text-input"
            containerStyle={CONTAINER_STYLE}
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="container-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <TimeInput
              label="Start time"
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
        <div
          data-parts-row="container-input-group"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">InputGroup</Text>
          <InputGroup label="Start time group">
            <InputGroupText>At</InputGroupText>
            <TimeInput
              label="Start time"
              isLabelHidden
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </InputGroup>
        </div>
      </div>
    </div>
  ),
};
