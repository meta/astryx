// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect} from 'storybook/test';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Field} from '@astryxdesign/core/Field';
import {Text} from '@astryxdesign/core/Text';
import * as stylex from '@stylexjs/stylex';

const meta: Meta<typeof FormLayout> = {
  title: 'Core/FormLayout',
  component: FormLayout,
  tags: ['autodocs'],
  args: {
    direction: 'vertical',
  },
  argTypes: {
    direction: {
      control: 'select',
      options: ['vertical', 'horizontal', 'horizontal-labels'],
      description: 'Direction of field arrangement',
    },
    defaultOptionality: {
      control: 'select',
      options: [undefined, 'optional', 'required'],
      description:
        'Form-wide default so only the exception shows an optional/required indicator',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FormLayout>;

// Helper component that uses args so Storybook controls work
function FormLayoutDemo({
  direction,
}: {
  direction?: 'vertical' | 'horizontal' | 'horizontal-labels';
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  return (
    <FormLayout direction={direction}>
      <TextInput label="Name" value={name} onChange={setName} />
      <TextInput label="Email" value={email} onChange={setEmail} />
      <TextInput label="Bio" value={bio} onChange={setBio} />
    </FormLayout>
  );
}

// ─── Vertical (default) ───────────────────────────────────────────────────

export const Vertical: Story = {
  name: 'Vertical (Default)',
  render: args => <FormLayoutDemo direction={args.direction} />,
};

// ─── Horizontal ───────────────────────────────────────────────────────────

export const Horizontal: Story = {
  name: 'Horizontal',
  args: {
    direction: 'horizontal',
  },
  render: args => {
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    return (
      <FormLayout direction={args.direction}>
        <TextInput label="First Name" value={first} onChange={setFirst} />
        <TextInput label="Last Name" value={last} onChange={setLast} />
      </FormLayout>
    );
  },
};

// ─── Horizontal Labels ────────────────────────────────────────────────────

export const HorizontalLabels: Story = {
  name: 'Horizontal Labels (Settings)',
  args: {
    direction: 'horizontal-labels',
  },
  render: args => {
    const [displayName, setDisplayName] = useState('Jane Doe');
    const [email, setEmail] = useState('jane@example.com');
    const [timezone, setTimezone] = useState('America/Los_Angeles');
    return (
      <FormLayout direction={args.direction}>
        <TextInput
          label="Display Name"
          value={displayName}
          onChange={setDisplayName}
        />
        <TextInput label="Email" value={email} onChange={setEmail} />
        <Selector
          label="Timezone"
          value={timezone}
          onChange={v => setTimezone(v as string)}
          options={[
            {label: 'Pacific Time', value: 'America/Los_Angeles'},
            {label: 'Eastern Time', value: 'America/New_York'},
            {label: 'UTC', value: 'UTC'},
          ]}
        />
      </FormLayout>
    );
  },
  // Run by .github/scripts/story-play-guard.js at a phone and a 481px viewport.
  play: async ({canvasElement}) => {
    const layout = canvasElement.querySelector(
      '[data-direction="horizontal-labels"]',
    );
    if (!layout) {
      throw new Error('Expected a horizontal-labels FormLayout');
    }
    await expect(layout.children).toHaveLength(3);
    const layoutWidth = layout.getBoundingClientRect().width;
    const collapsed = window.matchMedia('(max-width: 480px)').matches;
    // Each Field is display: contents, so its label wrapper and control
    // wrapper are the layout's items.
    for (const field of Array.from(layout.children)) {
      const label = field.children[0].getBoundingClientRect();
      const control = field.children[1].children[0].getBoundingClientRect();
      if (collapsed) {
        // Stacked: every control fills the column, whatever its value's width.
        await expect(control.width).toBeCloseTo(layoutWidth, 0);
      } else {
        // Two columns: the label sits to the left of its control.
        await expect(label.right).toBeLessThanOrEqual(control.left);
      }
    }
  },
};

// ─── Mixed: Astryx inputs + Field-wrapped custom controls ─────────────────

const checkboxStyles = stylex.create({
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
});

export const MixedControls: Story = {
  name: 'Mixed Controls',
  render: () => {
    const [name, setName] = useState('');
    const [role, setRole] = useState('viewer');
    return (
      <FormLayout>
        <TextInput label="Name" value={name} onChange={setName} />
        <Selector
          label="Role"
          value={role}
          onChange={v => setRole(v as string)}
          options={[
            {label: 'Viewer', value: 'viewer'},
            {label: 'Editor', value: 'editor'},
            {label: 'Admin', value: 'admin'},
          ]}
        />
        <Field label="Notifications" inputID="notif-group">
          <div {...stylex.props(checkboxStyles.group)} id="notif-group">
            <label {...stylex.props(checkboxStyles.label)}>
              <input type="checkbox" defaultChecked /> Email
            </label>
            <label {...stylex.props(checkboxStyles.label)}>
              <input type="checkbox" /> SMS
            </label>
            <label {...stylex.props(checkboxStyles.label)}>
              <input type="checkbox" defaultChecked /> Push
            </label>
          </div>
        </Field>
      </FormLayout>
    );
  },
};

// ─── Nested Layouts ───────────────────────────────────────────────────────

export const Nested: Story = {
  name: 'Nested Layouts',
  render: () => {
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [email, setEmail] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zip, setZip] = useState('');
    return (
      <FormLayout>
        <FormLayout direction="horizontal">
          <TextInput label="First Name" value={first} onChange={setFirst} />
          <TextInput label="Last Name" value={last} onChange={setLast} />
        </FormLayout>
        <TextInput label="Email" value={email} onChange={setEmail} />
        <FormLayout direction="horizontal">
          <TextInput label="City" value={city} onChange={setCity} />
          <TextInput label="State" value={state} onChange={setState} />
          <TextInput label="ZIP" value={zip} onChange={setZip} />
        </FormLayout>
      </FormLayout>
    );
  },
};

// ─── In a Dialog (form attribute pattern) ─────────────────────────────────

const dialogStyles = stylex.create({
  container: {
    border: '1px solid #ddd',
    borderRadius: 8,
    maxWidth: 480,
    overflow: 'hidden',
  },
  header: {
    padding: 16,
    borderBottom: '1px solid #eee',
  },
  body: {
    padding: 16,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 16,
    borderTop: '1px solid #eee',
  },
  button: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
  },
  primary: {
    backgroundColor: '#0064E0',
    color: '#fff',
  },
  secondary: {
    backgroundColor: '#F1F4F7',
    color: '#0A1317',
  },
});

export const InDialog: Story = {
  name: 'In a Dialog',
  render: () => {
    const [name, setName] = useState('Jane Doe');
    const [email, setEmail] = useState('jane@example.com');
    return (
      <div {...stylex.props(dialogStyles.container)}>
        <div {...stylex.props(dialogStyles.header)}>
          <Text type="label">Edit Profile</Text>
        </div>
        <div {...stylex.props(dialogStyles.body)}>
          <form
            id="edit-profile"
            onSubmit={e => {
              e.preventDefault();
              alert(`Saved: ${name}, ${email}`);
            }}>
            <FormLayout>
              <TextInput label="Name" value={name} onChange={setName} />
              <TextInput label="Email" value={email} onChange={setEmail} />
            </FormLayout>
          </form>
        </div>
        <div {...stylex.props(dialogStyles.footer)}>
          <button
            {...stylex.props(dialogStyles.button, dialogStyles.secondary)}
            type="button">
            Cancel
          </button>
          <button
            {...stylex.props(dialogStyles.button, dialogStyles.primary)}
            type="submit"
            form="edit-profile">
            Save
          </button>
        </div>
      </div>
    );
  },
};

// ─── Default optionality: mark only the exception ─────────────────────────

export const DefaultOptionalityOptional: Story = {
  name: 'Default Optionality — Optional',
  render: () => {
    const [bio, setBio] = useState('');
    const [nickname, setNickname] = useState('');
    const [email, setEmail] = useState('');
    // Everything reads as optional; only the required field is marked.
    return (
      <FormLayout defaultOptionality="optional">
        <TextInput label="Bio" value={bio} onChange={setBio} />
        <TextInput
          label="Nickname"
          value={nickname}
          onChange={setNickname}
          isOptional
        />
        <TextInput label="Email" value={email} onChange={setEmail} isRequired />
      </FormLayout>
    );
  },
};

export const DefaultOptionalityRequired: Story = {
  name: 'Default Optionality — Required',
  render: () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [nickname, setNickname] = useState('');
    // Everything reads as required; only the optional field is marked.
    return (
      <FormLayout defaultOptionality="required">
        <TextInput label="Name" value={name} onChange={setName} />
        <TextInput label="Email" value={email} onChange={setEmail} isRequired />
        <TextInput
          label="Nickname"
          value={nickname}
          onChange={setNickname}
          isOptional
        />
      </FormLayout>
    );
  },
};

// ─── Audit matrix ─────────────────────────────────────────────────────────────

/**
 * Stable, always-rendered FormLayout states for exact-head visual, accessibility,
 * RTL, and responsive verification. One fixture keeps all three arrangements and
 * both optionality exceptions observable without duplicating one story per prop.
 */
export const AuditMatrix: Story = {
  parameters: {layout: 'padded'},
  render: () => (
    <div data-form-layout-audit="matrix">
      <Text type="label">Vertical</Text>
      <FormLayout data-audit-layout="vertical">
        <TextInput label="Name" value="Ada Lovelace" onChange={() => {}} />
        <TextInput
          label="Email"
          value="ada.lovelace@example.com"
          onChange={() => {}}
        />
      </FormLayout>

      <Text type="label">Horizontal</Text>
      <FormLayout direction="horizontal" data-audit-layout="horizontal">
        <TextInput label="First name" value="Ada" onChange={() => {}} />
        <TextInput label="Last name" value="Lovelace" onChange={() => {}} />
        <TextInput label="Team" value="Analytical Engine" onChange={() => {}} />
      </FormLayout>

      <Text type="label">Horizontal labels</Text>
      <FormLayout
        direction="horizontal-labels"
        data-audit-layout="horizontal-labels">
        <TextInput
          label="Display name"
          value="Ada Lovelace"
          onChange={() => {}}
        />
        <TextInput
          label="Contact email"
          value="ada.lovelace@example.com"
          onChange={() => {}}
        />
      </FormLayout>

      <Text type="label">Required by default</Text>
      <FormLayout
        defaultOptionality="required"
        data-audit-layout="required-default">
        <TextInput label="Account name" value="Ada" onChange={() => {}} />
        <TextInput
          label="Nickname"
          value="Enchantress of Numbers"
          onChange={() => {}}
          isOptional
        />
      </FormLayout>
    </div>
  ),
  play: async ({canvasElement}) => {
    const layouts = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-audit-layout]'),
    );
    await expect(layouts).toHaveLength(4);
    for (const layout of layouts) {
      await expect(layout).toHaveAttribute('data-direction');
      await expect(layout.className).toContain('astryx-form-layout');
      const box = layout.getBoundingClientRect();
      await expect(box.width).toBeGreaterThan(0);
      await expect(box.left).toBeGreaterThanOrEqual(0);
      await expect(box.right).toBeLessThanOrEqual(
        document.documentElement.clientWidth + 1,
      );
    }

    const horizontal = canvasElement.querySelector<HTMLElement>(
      '[data-audit-layout="horizontal"]',
    );
    if (!horizontal) {
      throw new Error('Expected the horizontal audit layout');
    }
    const [first, second] = Array.from(horizontal.children).map(child =>
      child.getBoundingClientRect(),
    );
    const isRtl = getComputedStyle(horizontal).direction === 'rtl';
    if (isRtl) {
      await expect(first.left).toBeGreaterThan(second.left);
    } else {
      await expect(first.left).toBeLessThan(second.left);
    }

    const horizontalLabels = canvasElement.querySelector<HTMLElement>(
      '[data-audit-layout="horizontal-labels"]',
    );
    if (!horizontalLabels) {
      throw new Error('Expected the horizontal-labels audit layout');
    }
    const shouldCollapse = window.matchMedia('(max-width: 480px)').matches;
    await expect(getComputedStyle(horizontalLabels).display).toBe(
      shouldCollapse ? 'flex' : 'grid',
    );

    const requiredDefault = canvasElement.querySelector<HTMLElement>(
      '[data-audit-layout="required-default"]',
    );
    if (!requiredDefault) {
      throw new Error('Expected the required-default audit layout');
    }
    await expect(
      requiredDefault.querySelectorAll('[aria-required="true"]'),
    ).toHaveLength(1);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    );
  },
};
