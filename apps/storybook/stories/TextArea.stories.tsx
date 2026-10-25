// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {
  DocumentTextIcon,
  ChatBubbleLeftIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof TextArea> = {
  title: 'Core/TextArea',
  component: TextArea,
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
      description: 'Description text displayed between the label and textarea',
    },
    value: {
      control: 'text',
      description: 'Current textarea value (required)',
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
    rows: {
      control: 'number',
      description: 'Number of visible text rows (default: 3)',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    isReadOnly: {
      control: 'boolean',
      description:
        'Whether the textarea is read-only. The value still submits with the form but cannot be edited. Unlike isDisabled it is not dimmed and keeps its form value.',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the textarea is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the textarea focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextArea in Tooltip.',
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
    hasSpellCheck: {
      control: 'boolean',
      description: 'Whether to enable browser spell checking (default: true)',
    },
    maxLength: {
      control: 'number',
      description:
        'Maximum number of characters allowed. Displays a counter when set.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Textarea size (affects padding, not height)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TextArea>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    description: 'Tell us about yourself in a few sentences.',
    placeholder: 'Write your bio here...',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Comments',
    isLabelHidden: true,
    placeholder: 'Add a comment...',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ??
        'This is a pre-filled textarea with some content that demonstrates how the component handles existing text.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Notes',
    value:
      'This is a pre-filled textarea with some content that demonstrates how the component handles existing text.',
  },
};

export const CustomRows: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Message',
    rows: 6,
    placeholder: 'Write a longer message...',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');
    const [value3, setValue3] = useState('Pre-filled content in the textarea.');
    const [value4, setValue4] = useState('');
    const [value5, setValue5] = useState('');
    const [value6, setValue6] = useState('');
    const [value7, setValue7] = useState('');
    const [value8, setValue8] = useState('');
    const [value9, setValue9] = useState('This field is disabled');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <TextArea
          label="Visible label"
          value={value1}
          onChange={setValue1}
          placeholder="Enter text..."
        />
        <TextArea
          label="With description"
          description="Helpful description text"
          value={value4}
          onChange={setValue4}
          placeholder="Enter text..."
        />
        <TextArea
          label="Hidden label"
          isLabelHidden
          value={value2}
          onChange={setValue2}
          placeholder="Hidden label textarea"
        />
        <TextArea label="With value" value={value3} onChange={setValue3} />
        <TextArea
          label="Optional field"
          isOptional
          value={value5}
          onChange={setValue5}
          placeholder="Optional..."
        />
        <TextArea
          label="Required field"
          isRequired
          value={value6}
          onChange={setValue6}
          placeholder="Required..."
        />
        <TextArea
          label="Description with optional"
          description="Additional notes"
          isOptional
          value={value7}
          onChange={setValue7}
          placeholder="Notes..."
        />
        <TextArea
          label="Custom rows (6)"
          rows={6}
          value={value8}
          onChange={setValue8}
          placeholder="Larger textarea..."
        />
        <TextArea
          label="Disabled field"
          isDisabled
          value={value9}
          onChange={setValue9}
        />
      </div>
    );
  },
};

export const OptionalField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Additional Notes',
    isOptional: true,
    placeholder: 'Any additional notes...',
  },
};

export const RequiredField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Feedback',
    isRequired: true,
    placeholder: 'Please provide your feedback...',
  },
};

export const DescriptionWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Comments',
    description: 'Share any additional thoughts or comments',
    isOptional: true,
    placeholder: 'Your comments here...',
  },
};

// Read-only shows a value the user should see and send but not change. Unlike
// a disabled field it is not dimmed and still submits.
export const ReadOnly: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ??
        'Generated by the importer; edit the source file to change it.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Import summary',
    isReadOnly: true,
    value: 'Generated by the importer; edit the source file to change it.',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ?? 'This textarea is disabled and cannot be edited.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Disabled Field',
    isDisabled: true,
    value: 'This textarea is disabled and cannot be edited.',
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the textarea to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the textarea stays focusable (editing is still
// blocked). Use disabledMessage instead of wrapping a disabled TextArea in
// Tooltip: disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ?? 'These notes are locked after submission.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Notes',
    isDisabled: true,
    disabledMessage: 'Notes are locked after submission',
    value: 'These notes are locked after submission.',
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Notes',
    placeholder: 'Enter your notes...',
    startIcon: DocumentTextIcon,
  },
};

export const StartIconVariations: Story = {
  render: () => {
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState('');
    const [draft, setDraft] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <TextArea
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Enter your notes..."
          startIcon={DocumentTextIcon}
        />
        <TextArea
          label="Message"
          value={message}
          onChange={setMessage}
          placeholder="Type your message..."
          startIcon={ChatBubbleLeftIcon}
        />
        <TextArea
          label="Draft"
          value={draft}
          onChange={setDraft}
          placeholder="Write your draft..."
          startIcon={PencilSquareIcon}
        />
      </div>
    );
  },
};

export const ErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Too short');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
    status: {
      type: 'error',
      message: 'Description must be at least 50 characters',
    },
  },
};

export const WarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ?? 'This content may contain issues',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Content',
    placeholder: 'Enter content...',
    status: {
      type: 'warning',
      message: 'Content may need review before publishing',
    },
  },
};

export const SuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ?? 'This is a valid description that meets all requirements.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
    status: {type: 'success', message: 'Description looks good!'},
  },
};

export const StatusWithoutMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Invalid content');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Field',
    placeholder: 'Enter value',
    status: {type: 'error'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [error, setError] = useState('Too short');
    const [warning, setWarning] = useState('This may need review');
    const [success, setSuccess] = useState(
      'This description meets all the requirements perfectly.',
    );
    const [errorNoMsg, setErrorNoMsg] = useState('Invalid');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <TextArea
          label="Error with message"
          value={error}
          onChange={setError}
          status={{type: 'error', message: 'Must be at least 50 characters'}}
        />
        <TextArea
          label="Warning with message"
          value={warning}
          onChange={setWarning}
          status={{type: 'warning', message: 'Content may need review'}}
        />
        <TextArea
          label="Success with message"
          value={success}
          onChange={setSuccess}
          status={{type: 'success', message: 'Description is valid'}}
        />
        <TextArea
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
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'API Documentation',
    placeholder: 'Describe your API endpoint...',
    labelTooltip:
      'Provide a detailed description of what this API endpoint does, including expected inputs and outputs.',
  },
};

export const TooltipWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Additional Notes',
    placeholder: 'Any additional information...',
    labelTooltip:
      'Include any extra details that might be helpful for reviewers.',
    isOptional: true,
  },
};

export const Loading: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Saving your changes…');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
    isLoading: true,
  },
};

// The loading spinner and status icon share the end slot and render side by
// side (matching TextInput/DateInput/TimeInput), not mutually exclusively.
// Toggle isLoading to see the spinner appear beside the status icon.
export const LoadingWithStatus: Story = {
  render: () => {
    const [value, setValue] = useState('Too short');
    const [isLoading, setIsLoading] = useState(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 360,
        }}>
        <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <input
            type="checkbox"
            checked={isLoading}
            onChange={e => setIsLoading(e.target.checked)}
          />
          isLoading
        </label>
        <TextArea
          label="Description"
          value={value}
          onChange={setValue}
          isLoading={isLoading}
          status={{
            type: 'error',
            message: 'Description must be at least 50 characters',
          }}
        />
      </div>
    );
  },
};

export const CombinedFeatures: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{maxWidth: '400px'}}>
        <TextArea
          label="Detailed Description"
          description="Provide a comprehensive description of your project"
          value={value}
          onChange={setValue}
          placeholder="Enter description..."
          startIcon={DocumentTextIcon}
          labelTooltip="This description will be visible to all team members"
          isRequired
          status={
            value.length > 0 && value.length < 20
              ? {type: 'warning', message: 'Consider adding more detail'}
              : value.length >= 20
                ? {type: 'success', message: 'Description looks good!'}
                : undefined
          }
        />
      </div>
    );
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [smArea, setSmArea] = useState('');
    const [mdArea, setMdArea] = useState('');
    const [lgArea, setLgArea] = useState('');
    const [smInput, setSmInput] = useState('');
    const [mdInput, setMdInput] = useState('');
    const [lgInput, setLgInput] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
        {(['sm', 'md', 'lg'] as const).map((sz, i) => {
          const label = {
            sm: 'Small (28px)',
            md: 'Medium (32px)',
            lg: 'Large (36px)',
          }[sz];
          const [area, setArea] = [
            [smArea, setSmArea],
            [mdArea, setMdArea],
            [lgArea, setLgArea],
          ][i] as [string, (v: string) => void];
          const [input, setInput] = [
            [smInput, setSmInput],
            [mdInput, setMdInput],
            [lgInput, setLgInput],
          ][i] as [string, (v: string) => void];
          return (
            <div key={sz} style={{display: 'flex', gap: '16px'}}>
              <div style={{flex: 1}}>
                <TextArea
                  label={label}
                  value={area}
                  onChange={setArea}
                  placeholder="TextArea"
                  size={sz}
                />
              </div>
              <div style={{flex: 1}}>
                <TextInput
                  label={label}
                  value={input}
                  onChange={setInput}
                  placeholder="TextInput"
                  size={sz}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  },
};

export const WithMaxLength: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    placeholder: 'Tell us about yourself...',
    maxLength: 150,
  },
};

export const MaxLengthWithValue: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ??
        'This is a pre-filled bio that demonstrates the character counter.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    maxLength: 100,
  },
};

// When the value exceeds maxLength the counter turns red AND shows a warning
// icon, so the over-limit state isn't conveyed by color alone (WCAG 1.4.1).
// Screen-reader users hear the over-limit count announced as they type.
export const MaxLengthOverLimit: Story = {
  render: args => {
    const [value, setValue] = useState(
      args.value ??
        'This bio is intentionally longer than the limit to show the over-limit state.',
    );
    return <TextArea {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    maxLength: 50,
  },
};

export const MaxLengthVariations: Story = {
  render: () => {
    const [short, setShort] = useState('');
    const [medium, setMedium] = useState('Some text here');
    const [long, setLong] = useState(
      'This is a longer text that approaches the maximum length limit.',
    );
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <TextArea
          label="Short limit"
          value={short}
          onChange={setShort}
          placeholder="Max 50 characters"
          maxLength={50}
        />
        <TextArea
          label="Medium limit"
          value={medium}
          onChange={setMedium}
          placeholder="Max 100 characters"
          maxLength={100}
        />
        <TextArea
          label="Long limit"
          value={long}
          onChange={setLong}
          placeholder="Max 200 characters"
          maxLength={200}
        />
      </div>
    );
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState('Too short');
    const [b, setB] = useState('Too short');
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 320}}>
        <TextArea
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Must be at least 50 characters'}}
        />
        <TextArea
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Must be at least 50 characters'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

// TextArea composed with other inputs in a vertical FormLayout, to validate
// that its label, control edges, and internal content align with sibling
// inputs (TextInput, Selector) now that the textarea spans the full container.
export const VerticalFormAlignment: Story = {
  name: 'Vertical Form Alignment',
  render: () => {
    const [name, setName] = useState('');
    const [visibility, setVisibility] = useState('public');
    const [summary, setSummary] = useState('');
    const [bio, setBio] = useState('Design systems engineer.');
    return (
      <div style={{width: 360}}>
        <FormLayout>
          <TextInput label="Display name" value={name} onChange={setName} />
          <Selector
            label="Visibility"
            value={visibility}
            onChange={v => setVisibility(v as string)}
            options={[
              {label: 'Public', value: 'public'},
              {label: 'Followers only', value: 'followers'},
              {label: 'Private', value: 'private'},
            ]}
          />
          <TextArea
            label="Summary"
            value={summary}
            onChange={setSummary}
            placeholder="A short one-liner"
            maxLength={80}
          />
          <TextArea
            label="Bio"
            value={bio}
            onChange={setBio}
            rows={4}
            description="Tell people a bit about yourself."
            maxLength={200}
          />
        </FormLayout>
      </div>
    );
  },
};
