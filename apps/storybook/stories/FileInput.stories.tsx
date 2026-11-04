// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {FileInput} from '@astryxdesign/core/FileInput';

const meta: Meta<typeof FileInput> = {
  title: 'Core/FileInput',
  component: FileInput,
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
    accept: {
      control: 'text',
      description: 'Accepted file types (e.g. "image/*", ".pdf,.doc")',
    },
    isMultiple: {
      control: 'boolean',
      description: 'Whether multiple files can be selected',
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
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the trigger focusable via aria-disabled (opening the file picker stays blocked). Use this instead of wrapping a disabled FileInput in Tooltip.',
    },
    isLoading: {
      control: 'boolean',
      description: 'Whether the input is in a loading state',
    },
    mode: {
      control: 'select',
      options: ['input', 'dropzone'],
      description: 'Visual mode: compact input or drag-and-drop dropzone',
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
type Story = StoryObj<typeof FileInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Upload file',
    placeholder: 'Drag files here or click to browse',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Resume',
    description: 'Upload your resume in PDF or Word format. Max 5MB.',
    accept: '.pdf,.doc,.docx',
  },
};

export const MultipleFiles: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Attachments',
    isMultiple: true,
    description: 'Upload up to 10 files. Max 5MB each.',
    maxFiles: 10,
    maxSize: 5 * 1024 * 1024,
  },
};

export const ImagesOnly: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Profile photo',
    accept: 'image/png,image/jpeg',
    description: 'PNG or JPEG, max 2MB.',
    maxSize: 2 * 1024 * 1024,
  },
};

export const DropzoneMode: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Upload files',
    mode: 'dropzone',
    placeholder: 'Drag files here or click to browse',
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Supporting document',
    isRequired: true,
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Cover letter',
    isOptional: true,
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Upload locked',
    isDisabled: true,
    placeholder: 'Upload is currently disabled',
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the trigger to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the trigger stays focusable (opening the picker is
// still blocked). Use disabledMessage instead of wrapping a disabled FileInput
// in Tooltip: disabled controls swallow the pointer events a Tooltip wrapper
// needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Resume',
    isDisabled: true,
    disabledMessage: 'Uploads are locked until your profile is verified',
    placeholder: 'Upload is currently disabled',
  },
};

export const Loading: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Uploading...',
    isLoading: true,
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Upload document',
    status: {type: 'error', message: 'File must be under 10MB'},
  },
};

export const WithSuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Upload document',
    status: {type: 'success', message: 'File uploaded successfully'},
  },
};

export const WithTooltip: Story = {
  render: args => {
    const [value, setValue] = useState<File | File[] | null>(null);
    return <FileInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Tax documents',
    labelTooltip: 'Upload W-2 forms, 1099s, or other tax-related documents.',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [v1, setV1] = useState<File | File[] | null>(null);
    const [v2, setV2] = useState<File | File[] | null>(null);
    const [v3, setV3] = useState<File | File[] | null>(null);
    const [v4, setV4] = useState<File | File[] | null>(null);
    const [v5, setV5] = useState<File | File[] | null>(null);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '400px',
        }}>
        <FileInput label="Default (input mode)" value={v1} onChange={setV1} />
        <FileInput
          label="Dropzone with constraints"
          value={v2}
          onChange={setV2}
          mode="dropzone"
          isMultiple
          accept="image/*"
          maxSize={5 * 1024 * 1024}
          maxFiles={5}
          description="Up to 5 images, max 5MB each"
        />
        <FileInput
          label="Dropzone mode"
          value={v3}
          onChange={setV3}
          mode="dropzone"
          placeholder="Drag files here or click to browse"
        />
        <FileInput label="Disabled" value={v4} onChange={setV4} isDisabled />
        <FileInput
          label="With error"
          value={v5}
          onChange={setV5}
          status={{type: 'error', message: 'Please upload a valid file'}}
        />
      </div>
    );
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<File | File[] | null>(null);
    const [b, setB] = useState<File | File[] | null>(null);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 320}}>
        <FileInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'File must be under 10MB'}}
        />
        <FileInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'File must be under 10MB'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

// Fixed files make selected states reachable without a file picker. The long
// name is one unbroken token, as exported scans and generated reports often are.
const AUDIT_FILES = {
  short: new File(['audit'], 'resume.pdf', {type: 'application/pdf'}),
  long: new File(
    ['audit'],
    'quarterly-financial-report-final-revised-approved-2026-q3-v12.pdf',
    {type: 'application/pdf'},
  ),
} as const;

const ERROR_STATUS = {
  type: 'error',
  message: 'File must be under 10MB',
} as const;

type AuditCase = {
  id: string;
  label: string;
  mode: 'input' | 'dropzone';
  value?: File | null;
  status?: typeof ERROR_STATUS;
  statusVariant?: 'attached' | 'detached' | 'tooltip';
  isLoading?: boolean;
};

const AUDIT_CASES: AuditCase[] = [
  {id: 'input-empty', label: 'Resume', mode: 'input'},
  {
    id: 'input-selected',
    label: 'Resume',
    mode: 'input',
    value: AUDIT_FILES.short,
  },
  {
    id: 'input-long-name',
    label: 'Report',
    mode: 'input',
    value: AUDIT_FILES.long,
  },
  {
    id: 'input-error-attached',
    label: 'Resume',
    mode: 'input',
    status: ERROR_STATUS,
  },
  {
    id: 'input-error-tooltip',
    label: 'Resume',
    mode: 'input',
    status: ERROR_STATUS,
    statusVariant: 'tooltip',
  },
  {
    id: 'input-loading-error-tooltip',
    label: 'Resume',
    mode: 'input',
    value: AUDIT_FILES.short,
    status: ERROR_STATUS,
    statusVariant: 'tooltip',
    isLoading: true,
  },
  {id: 'dropzone-empty', label: 'Attachments', mode: 'dropzone'},
  {
    id: 'dropzone-selected',
    label: 'Attachments',
    mode: 'dropzone',
    value: AUDIT_FILES.short,
  },
  {
    id: 'dropzone-long-name',
    label: 'Attachments',
    mode: 'dropzone',
    value: AUDIT_FILES.long,
  },
  {
    id: 'dropzone-error-attached',
    label: 'Attachments',
    mode: 'dropzone',
    status: ERROR_STATUS,
  },
  {
    id: 'dropzone-error-detached',
    label: 'Attachments',
    mode: 'dropzone',
    status: ERROR_STATUS,
    statusVariant: 'detached',
  },
  {
    id: 'dropzone-error-tooltip',
    label: 'Attachments',
    mode: 'dropzone',
    status: ERROR_STATUS,
    statusVariant: 'tooltip',
  },
  {
    id: 'dropzone-selected-error-tooltip',
    label: 'Attachments',
    mode: 'dropzone',
    value: AUDIT_FILES.short,
    status: ERROR_STATUS,
    statusVariant: 'tooltip',
  },
  {
    id: 'dropzone-loading-error-tooltip',
    label: 'Attachments',
    mode: 'dropzone',
    status: ERROR_STATUS,
    statusVariant: 'tooltip',
    isLoading: true,
  },
  {
    id: 'dropzone-loading',
    label: 'Attachments',
    mode: 'dropzone',
    isLoading: true,
  },
];

function AuditCaseField({item}: {item: AuditCase}) {
  const [value, setValue] = useState<File | File[] | null>(item.value ?? null);
  return (
    <div data-audit-case={item.id} style={{minWidth: 0}}>
      <FileInput
        label={item.label}
        mode={item.mode}
        value={value}
        onChange={setValue}
        status={item.status}
        statusVariant={item.statusVariant}
        isLoading={item.isLoading}
      />
    </div>
  );
}

/**
 * Every mode in its empty, selected, long-name, status, and loading states,
 * including each status placement, for the component audit. The disabled
 * states keep their own stories.
 */
export const AuditMatrix: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        gap: 24,
        width: '100%',
        padding: 16,
        boxSizing: 'border-box',
      }}>
      {AUDIT_CASES.map(item => (
        <AuditCaseField key={item.id} item={item} />
      ))}
    </div>
  ),
};
