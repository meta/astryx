// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Field} from '@astryxdesign/core/Field';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Selector} from '@astryxdesign/core/Selector';
import {StackItem} from '@astryxdesign/core/Stack';
import {EnvelopeIcon} from '@heroicons/react/24/outline';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// A minimal native input styled to match Astryx aesthetics —
// demonstrating that Field wraps any custom or native input.
const inputStyles = stylex.create({
  root: {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: typographyVars['--font-family-body'],
    fontSize: '14px',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
    outline: 'none',
    ':focus': {
      borderColor: colorVars['--color-accent'],
    },
  },
});

const NativeInput = ({
  id,
  describedBy,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  describedBy?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <input
    id={id}
    aria-describedby={describedBy}
    placeholder={placeholder}
    value={value}
    onChange={e => onChange(e.target.value)}
    {...stylex.props(inputStyles.root)}
  />
);

const meta: Meta<typeof Field> = {
  title: 'Core/Field',
  component: Field,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text'},
    isLabelHidden: {control: 'boolean'},
    description: {control: 'text'},
    isOptional: {control: 'boolean'},
    isRequired: {control: 'boolean'},
    labelTooltip: {control: 'text'},
  },
};

export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  args: {label: 'Email'},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="email-input">
        <NativeInput
          id="email-input"
          placeholder="you@example.com"
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const WithDescription: Story = {
  args: {label: 'Email', description: "We'll never share your email."},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="email-desc-input" descriptionID="email-desc">
        <NativeInput
          id="email-desc-input"
          describedBy="email-desc"
          placeholder="you@example.com"
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const WithHiddenLabel: Story = {
  args: {label: 'Search', isLabelHidden: true},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="search-input">
        <NativeInput
          id="search-input"
          placeholder="Search..."
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const OptionalField: Story = {
  args: {label: 'Nickname', isOptional: true},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="nickname-input">
        <NativeInput
          id="nickname-input"
          placeholder="Enter your nickname"
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const RequiredField: Story = {
  args: {label: 'Username', isRequired: true},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="username-input">
        <NativeInput
          id="username-input"
          placeholder="Enter your username"
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const WithTooltip: Story = {
  args: {
    label: 'API Key',
    labelTooltip: 'Your unique API key. Keep this secret!',
  },
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="api-key-input">
        <NativeInput
          id="api-key-input"
          placeholder="sk-..."
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const WithLabelIcon: Story = {
  args: {label: 'Email', labelIcon: EnvelopeIcon},
  render: args => {
    const [value, setValue] = useState('');
    return (
      <Field {...args} inputID="email-icon-input">
        <NativeInput
          id="email-icon-input"
          placeholder="you@example.com"
          value={value}
          onChange={setValue}
        />
      </Field>
    );
  },
};

export const AllVariations: Story = {
  render: () => {
    const [vals, setVals] = useState({a: '', b: '', c: '', d: '', e: ''});
    const set = (k: keyof typeof vals) => (v: string) =>
      setVals(prev => ({...prev, [k]: v}));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          maxWidth: 320,
        }}>
        <Field label="Default" inputID="v-a">
          <NativeInput id="v-a" value={vals.a} onChange={set('a')} />
        </Field>
        <Field
          label="With description"
          description="Some helpful info"
          inputID="v-b"
          descriptionID="v-b-desc">
          <NativeInput
            id="v-b"
            describedBy="v-b-desc"
            value={vals.b}
            onChange={set('b')}
          />
        </Field>
        <Field label="Optional" isOptional inputID="v-c">
          <NativeInput id="v-c" value={vals.c} onChange={set('c')} />
        </Field>
        <Field label="Required" isRequired inputID="v-d">
          <NativeInput id="v-d" value={vals.d} onChange={set('d')} />
        </Field>
        <Field
          label="With tooltip"
          labelTooltip="Extra info here"
          inputID="v-e">
          <NativeInput id="v-e" value={vals.e} onChange={set('e')} />
        </Field>
      </div>
    );
  },
};

export const StatusVariants: Story = {
  render: () => {
    const [vals, setVals] = useState({
      native: 'custom-value',
      error: 'bad-email',
      warning: 'admin',
      success: 'valid-user',
    });
    const set = (k: keyof typeof vals) => (v: string) =>
      setVals(prev => ({...prev, [k]: v}));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          maxWidth: 400,
        }}>
        <Field
          label="Native input"
          inputID="native-status-input"
          status={{
            type: 'warning',
            message: 'The attached status stays behind this custom control',
            messageID: 'native-status-message',
          }}>
          <NativeInput
            id="native-status-input"
            describedBy="native-status-message"
            value={vals.native}
            onChange={set('native')}
          />
        </Field>
        <TextInput
          label="Email"
          description="Enter your work email"
          value={vals.error}
          onChange={set('error')}
          status={{
            type: 'error',
            message: 'Please enter a valid email address',
          }}
        />
        <TextInput
          label="Username"
          description="Choose a unique username"
          value={vals.warning}
          onChange={set('warning')}
          status={{
            type: 'warning',
            message: 'This username is reserved for administrators',
          }}
        />
        <TextInput
          label="API Key"
          description="Paste your API key"
          value={vals.success}
          onChange={set('success')}
          status={{type: 'success', message: 'API key is valid and active'}}
        />
      </div>
    );
  },
};

function OrdersFilterBar({wrap = 'wrap'}: {wrap?: 'wrap' | 'nowrap'}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Awaiting fulfillment');
  const [region, setRegion] = useState('All regions');
  const [sort, setSort] = useState('Newest first');
  return (
    <HStack gap={2} wrap={wrap} vAlign="center">
      <StackItem size="fill">
        <TextInput
          label="Search orders"
          isLabelHidden
          placeholder="Search by order or customer"
          startIcon={<Icon icon="search" />}
          value={query}
          onChange={setQuery}
        />
      </StackItem>
      <Selector
        label="Status"
        isLabelHidden
        options={[
          'All statuses',
          'Awaiting fulfillment',
          'Shipped',
          'Delivered',
          'Returned',
        ]}
        value={status}
        onChange={setStatus}
      />
      <Selector
        label="Region"
        isLabelHidden
        options={['All regions', 'North America', 'Europe', 'Asia Pacific']}
        value={region}
        onChange={setRegion}
      />
      <Selector
        label="Sort"
        isLabelHidden
        options={['Newest first', 'Oldest first', 'Highest total']}
        value={sort}
        onChange={setSort}
      />
    </HStack>
  );
}

const frameCaption = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  marginBottom: 8,
};

/**
 * Comparison fixture for Field-owned structural states: horizontal labels,
 * a detached status with explicit description/status wiring, and a group label.
 */
export const StructuralStates: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{maxWidth: 560}}>
        <FormLayout direction="horizontal-labels">
          <Field
            label="Workspace name"
            inputID="audit-workspace"
            description="Used in navigation and invitations."
            descriptionID="audit-workspace-help"
            status={{
              type: 'warning',
              message: 'Choose a name before continuing.',
              messageID: 'audit-workspace-status',
            }}
            statusVariant="detached">
            <NativeInput
              id="audit-workspace"
              describedBy="audit-workspace-help audit-workspace-status"
              placeholder="Design systems"
              value={value}
              onChange={setValue}
            />
          </Field>
          <Field
            label="Visibility"
            inputID="audit-visibility"
            labelID="audit-visibility-label"
            isGroupLabel>
            <div
              id="audit-visibility"
              role="radiogroup"
              aria-labelledby="audit-visibility-label">
              <label>
                <input type="radio" name="audit-visibility" defaultChecked />
                Private
              </label>{' '}
              <label>
                <input type="radio" name="audit-visibility" /> Public
              </label>
            </div>
          </Field>
        </FormLayout>
      </div>
    );
  },
};

/**
 * The Field.doc.mjs "Filter bar" example (a search TextInput and three
 * Selectors) in a 390px phone frame, a 768px tablet frame, and at full width.
 * The last frame is the same bar without `wrap` at 390px: its fields now
 * shrink inside the frame instead of pushing past it, which is why filter bars
 * should wrap on phones.
 */
export const FilterBar: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      {[390, 768].map(width => (
        <div key={width} style={{width, outline: '1px dashed #ccc'}}>
          <p style={frameCaption}>{width}px, wrap</p>
          <OrdersFilterBar />
        </div>
      ))}
      <div>
        <p style={frameCaption}>Full width, wrap</p>
        <OrdersFilterBar />
      </div>
      <div style={{width: 390, outline: '1px dashed #ccc'}}>
        <p style={frameCaption}>390px, no wrap: fields shrink inside the row</p>
        <OrdersFilterBar wrap="nowrap" />
      </div>
    </div>
  ),
};
