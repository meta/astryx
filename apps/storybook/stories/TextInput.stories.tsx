// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  MagnifyingGlassIcon,
  EnvelopeIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof TextInput> = {
  title: 'Core/TextInput',
  component: TextInput,
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
      control: 'text',
      description: 'Current input value (required)',
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
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextInput in Tooltip.',
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
  },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Name',
    placeholder: 'Enter your name',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    description: "We'll never share your email with anyone.",
    placeholder: 'Enter your email',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
    placeholder: 'Search...',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Hello, world!');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Greeting',
    value: 'Hello, world!',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');
    const [value3, setValue3] = useState('Pre-filled value');
    const [value4, setValue4] = useState('');
    const [value5, setValue5] = useState('');
    const [value6, setValue6] = useState('');
    const [value7, setValue7] = useState('');
    const [value8, setValue8] = useState('Disabled input');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Visible label"
          value={value1}
          onChange={setValue1}
          placeholder="Enter text..."
        />
        <TextInput
          label="With description"
          description="Helpful description text"
          value={value4}
          onChange={setValue4}
          placeholder="Enter text..."
        />
        <TextInput
          label="Hidden label"
          isLabelHidden
          value={value2}
          onChange={setValue2}
          placeholder="Hidden label input"
        />
        <TextInput label="With value" value={value3} onChange={setValue3} />
        <TextInput
          label="Optional field"
          isOptional
          value={value5}
          onChange={setValue5}
          placeholder="Optional..."
        />
        <TextInput
          label="Required field"
          isRequired
          value={value6}
          onChange={setValue6}
          placeholder="Required..."
        />
        <TextInput
          label="Description with optional"
          description="Enter your nickname"
          isOptional
          value={value7}
          onChange={setValue7}
          placeholder="Nickname..."
        />
        <TextInput
          label="Disabled field"
          isDisabled
          value={value8}
          onChange={setValue8}
        />
      </div>
    );
  },
};

export const OptionalField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Nickname',
    isOptional: true,
    placeholder: 'Enter your nickname',
  },
};

export const RequiredField: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    isRequired: true,
    placeholder: 'Enter your username',
  },
};

export const DescriptionWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Bio',
    description: 'Tell us about yourself',
    isOptional: true,
    placeholder: 'Your bio here...',
  },
};

// Read-only shows a value the user should see and send but not change. Unlike
// a disabled field it is not dimmed and still submits.
export const ReadOnly: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'ACCT-4417-9920');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Account number',
    isReadOnly: true,
    value: 'ACCT-4417-9920',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Cannot edit this');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked Field',
    isDisabled: true,
    value: 'Cannot edit this',
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the input to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the input stays focusable (editing is still blocked).
// Use disabledMessage instead of wrapping a disabled TextInput in Tooltip:
// disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'alice@example.com');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Owner',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
    value: 'alice@example.com',
  },
};

export const WithStartIcon: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Search...',
    startIcon: MagnifyingGlassIcon,
  },
};

export const WithStartIconAndSmallSize: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Search...',
    startIcon: MagnifyingGlassIcon,
    size: 'sm',
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [sm, setSm] = useState('');
    const [md, setMd] = useState('');
    const [lg, setLg] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Small (28px)"
          value={sm}
          onChange={setSm}
          placeholder="Small size"
          size="sm"
        />
        <TextInput
          label="Medium (32px)"
          value={md}
          onChange={setMd}
          placeholder="Medium size (default)"
          size="md"
        />
        <TextInput
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

export const StartIconVariations: Story = {
  render: () => {
    const [search, setSearch] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Search"
          value={search}
          onChange={setSearch}
          placeholder="Search..."
          startIcon={MagnifyingGlassIcon}
        />
        <TextInput
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="Enter your email"
          startIcon={EnvelopeIcon}
        />
        <TextInput
          label="Username"
          value={username}
          onChange={setUsername}
          placeholder="Enter your username"
          startIcon={UserIcon}
        />
      </div>
    );
  },
};

export const ErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'invalid@');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    status: {type: 'error', message: 'Please enter a valid email address'},
  },
};

export const WarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'user123');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    placeholder: 'Enter your username',
    status: {type: 'warning', message: 'This username is already taken'},
  },
};

export const SuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'validuser');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Username',
    placeholder: 'Enter your username',
    status: {type: 'success', message: 'Username is available'},
  },
};

export const StatusWithoutMessage: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'test');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Field',
    placeholder: 'Enter value',
    status: {type: 'error'},
  },
};

export const StatusVariations: Story = {
  render: () => {
    const [error, setError] = useState('invalid@');
    const [warning, setWarning] = useState('user123');
    const [success, setSuccess] = useState('validuser');
    const [errorNoMsg, setErrorNoMsg] = useState('test');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <TextInput
          label="Error with message"
          value={error}
          onChange={setError}
          status={{type: 'error', message: 'Please enter a valid email'}}
        />
        <TextInput
          label="Warning with message"
          value={warning}
          onChange={setWarning}
          status={{type: 'warning', message: 'This username may be taken'}}
        />
        <TextInput
          label="Success with message"
          value={success}
          onChange={setSuccess}
          status={{type: 'success', message: 'Username is available'}}
        />
        <TextInput
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
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'API Key',
    placeholder: 'Enter your API key',
    labelTooltip: 'Your unique API key for authentication. Keep this secret!',
  },
};

export const Password: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    type: 'password',
    label: 'Password',
    placeholder: 'Enter your password',
  },
};

export const TooltipWithOptional: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? '');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Webhook URL',
    placeholder: 'https://example.com/webhook',
    labelTooltip: 'The URL where we will send event notifications.',
    isOptional: true,
  },
};

export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'Hello world');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Search',
    placeholder: 'Type to search...',
    hasClear: true,
  },
};

export const ClearableWithStatus: Story = {
  render: args => {
    const [value, setValue] = useState(args.value ?? 'invalid-email');
    return <TextInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Email',
    hasClear: true,
    status: {type: 'error', message: 'Invalid email address'},
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState('invalid@');
    const [b, setB] = useState('invalid@');
    const [c, setC] = useState('invalid@');
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 280}}>
        <TextInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Enter a valid email'}}
        />
        <TextInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Enter a valid email'}}
          statusVariant="detached"
        />
        <TextInput
          label="Tooltip (focus, hover, or tap the status icon)"
          value={c}
          onChange={setC}
          status={{type: 'error', message: 'Enter a valid email'}}
          statusVariant="tooltip"
        />
      </div>
    );
  },
};
