// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {List} from '@astryxdesign/core/List';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Link} from '@astryxdesign/core/Link';
import CheckboxListSelectAllPattern from '../../../packages/cli/assets/templates/blocks/components/CheckboxList/CheckboxListSelectAllPattern';

const meta: Meta<typeof CheckboxList> = {
  title: 'Core/CheckboxList',
  component: CheckboxList,
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
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Spacing density for list items',
    },
    hasDividers: {
      control: 'boolean',
      description: 'Whether to show dividers between items',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether all checkbox items are disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the group is disabled (whole-group state, not per item). With isDisabled, shows a tooltip on hover/keyboard focus and keeps the checkboxes focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled CheckboxList in Tooltip.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CheckboxList>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(args.value ?? []);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
  },
};

export const WithDescriptions: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(args.value ?? []);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem
          label="Email"
          value="email"
          description="Receive notifications via email"
        />
        <CheckboxListItem
          label="SMS"
          value="sms"
          description="Standard messaging rates apply"
        />
        <CheckboxListItem
          label="Push notification"
          value="push"
          description="Instant alerts on your device"
        />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
    description: 'Choose how you would like to be notified',
    hasDividers: true,
  },
};

export const RichDescriptions: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(args.value ?? ['analytics']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem
          label={
            <>
              Analytics <Link href="#analytics-details">details</Link>
            </>
          }
          value="analytics"
          description={
            <>
              Usage data only. <Link href="#privacy">Read the policy</Link>
            </>
          }
          endContent={<span data-testid="checkbox-end-content">$0/mo</span>}
        />
        <CheckboxListItem
          label="Personalization"
          value="personalization"
          description={
            <>
              Tailors what you see. <Link href="#privacy">Learn more</Link>
            </>
          }
        />
      </CheckboxList>
    );
  },
  args: {
    label: 'Data sharing',
    description:
      'Labels and descriptions can carry links and other rich content without toggling the item.',
  },
};

export const DynamicItems: Story = {
  render: args => {
    const items = [
      {id: 'react', label: 'React'},
      {id: 'vue', label: 'Vue'},
      {id: 'angular', label: 'Angular'},
      {id: 'svelte', label: 'Svelte'},
    ];
    const [value, setValue] = useState<string[]>(['react']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        {items.map(item => (
          <CheckboxListItem key={item.id} label={item.label} value={item.id} />
        ))}
      </CheckboxList>
    );
  },
  args: {
    label: 'Frameworks',
  },
};

export const StandaloneMode: Story = {
  render: () => {
    const [accepted, setAccepted] = useState(false);
    const [subscribed, setSubscribed] = useState(true);
    const [marketing, setMarketing] = useState(false);
    return (
      <List>
        <CheckboxListItem
          label="Accept terms and conditions"
          isChecked={accepted}
          onCheck={setAccepted}
        />
        <CheckboxListItem
          label="Subscribe to newsletter"
          description="Weekly updates about new features"
          isChecked={subscribed}
          onCheck={setSubscribed}
        />
        <CheckboxListItem
          label="Receive marketing emails"
          isChecked={marketing}
          onCheck={setMarketing}
        />
      </List>
    );
  },
};

export const ReadOnly: Story = {
  render: () => (
    <List>
      <CheckboxListItem label="Completed task" isChecked={true} />
      <CheckboxListItem label="Pending task" isChecked={false} />
      <CheckboxListItem label="In progress" isChecked="indeterminate" />
    </List>
  ),
};

export const SelectAllWithIndeterminate: Story = {
  render: () => {
    const allItems = ['email', 'sms', 'push'];
    const [selected, setSelected] = useState<string[]>(['email']);

    const allChecked = allItems.every(item => selected.includes(item));
    const noneChecked = selected.length === 0;
    const selectAllState = allChecked
      ? true
      : noneChecked
        ? false
        : ('indeterminate' as const);

    const handleSelectAll = (checked: boolean) => {
      if (checked) {
        setSelected([...allItems]);
      } else {
        setSelected([]);
      }
    };

    return (
      <CheckboxList label="Notifications" hasDividers>
        <CheckboxListItem
          label="Select all"
          isChecked={selectAllState}
          onCheck={handleSelectAll}
        />
        {allItems.map(item => (
          <CheckboxListItem
            key={item}
            label={item.charAt(0).toUpperCase() + item.slice(1)}
            isChecked={selected.includes(item)}
            onCheck={checked => {
              setSelected(prev =>
                checked ? [...prev, item] : prev.filter(v => v !== item),
              );
            }}
          />
        ))}
      </CheckboxList>
    );
  },
};

/**
 * The select-all block exactly as the CLI ships it, so browser and axe audits
 * cover the copied template rather than a look-alike.
 */
export const SelectAllPatternBlock: Story = {
  render: () => <CheckboxListSelectAllPattern />,
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['email']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
    isDisabled: true,
  },
};

export const Loading: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['email']);
    return (
      <CheckboxList
        label="Notification preferences"
        value={value}
        onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" isLoading />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
};

export const ChangeAction: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['email']);
    // Simulates persisting the new selection to a server. While the promise
    // is pending, the toggled item shows a spinner inside its checkbox and
    // blocks re-toggling; the other items stay interactive.
    const persist = (next: string[]) =>
      new Promise<void>(resolve => {
        setTimeout(() => {
          setValue(next);
          resolve();
        }, 1500);
      });
    return (
      <CheckboxList
        label="Notification preferences"
        description="Toggle an option — it spins while saving"
        value={value}
        changeAction={persist}
        hasDividers>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
};

export const DisabledItem: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>([]);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" isDisabled />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>([]);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
    status: {
      type: 'error',
      message: 'Please select at least one notification method',
    },
  },
};

export const WithEndContent: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['free']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem
          label="Free tier"
          value="free"
          description="Basic features included"
          endContent={<Badge variant="success" label="$0/mo" />}
        />
        <CheckboxListItem
          label="Pro tier"
          value="pro"
          description="Advanced features"
          endContent={<Badge variant="info" label="$9/mo" />}
        />
        <CheckboxListItem
          label="Enterprise"
          value="enterprise"
          description="Custom solutions"
          endContent={<Badge variant="purple" label="Custom" />}
        />
      </CheckboxList>
    );
  },
  args: {
    label: 'Add-on packages',
    hasDividers: true,
  },
};

export const AllVariations: Story = {
  render: () => {
    const [value1, setValue1] = useState<string[]>([]);
    const [value2, setValue2] = useState<string[]>(['email']);
    const [standalone1, setStandalone1] = useState(false);
    const [standalone2, setStandalone2] = useState(true);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '400px',
        }}>
        <CheckboxList label="Unselected" value={value1} onChange={setValue1}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>
        <CheckboxList label="Pre-selected" value={value2} onChange={setValue2}>
          <CheckboxListItem label="Email" value="email" />
          <CheckboxListItem label="SMS" value="sms" />
        </CheckboxList>
        <CheckboxList
          label="Disabled group"
          value={['a']}
          onChange={() => {}}
          isDisabled>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>
        <CheckboxList
          label="With descriptions"
          value={value1}
          onChange={setValue1}
          hasDividers>
          <CheckboxListItem
            label="Email"
            value="email"
            description="Delivered to your inbox"
          />
          <CheckboxListItem
            label="SMS"
            value="sms"
            description="Standard rates apply"
          />
        </CheckboxList>
        <CheckboxList
          label="With error"
          value={[]}
          onChange={() => {}}
          status={{
            type: 'error',
            message: 'Please select at least one option',
          }}>
          <CheckboxListItem label="Option A" value="a" />
          <CheckboxListItem label="Option B" value="b" />
        </CheckboxList>
        <div>
          <h4 style={{margin: '0 0 8px'}}>Standalone mode</h4>
          <List>
            <CheckboxListItem
              label="Accept terms"
              isChecked={standalone1}
              onCheck={setStandalone1}
            />
            <CheckboxListItem
              label="Subscribe"
              isChecked={standalone2}
              onCheck={setStandalone2}
            />
          </List>
        </div>
      </div>
    );
  },
};

export const InsideCard: Story = {
  render() {
    const [selected, setSelected] = useState<string[]>(['email']);
    return (
      <div style={{maxWidth: 400}}>
        <Card>
          <CheckboxList
            label="Notifications"
            description="Choose how to be notified"
            value={selected}
            onChange={setSelected}>
            <CheckboxListItem
              value="email"
              label="Email"
              description="Weekly digest"
            />
            <CheckboxListItem value="push" label="Push notifications" />
            <CheckboxListItem value="sms" label="SMS" isDisabled />
          </CheckboxList>
        </Card>
      </div>
    );
  },
};

export const InsideCardWithDividers: Story = {
  render() {
    const [selected, setSelected] = useState<string[]>(['admin']);
    return (
      <div style={{maxWidth: 400}}>
        <Card>
          <CheckboxList
            label="Assign Roles"
            value={selected}
            onChange={setSelected}
            hasDividers>
            <CheckboxListItem value="admin" label="Admin" />
            <CheckboxListItem value="editor" label="Editor" />
            <CheckboxListItem value="viewer" label="Viewer" />
            <CheckboxListItem value="guest" label="Guest" />
          </CheckboxList>
        </Card>
      </div>
    );
  },
};

// Long option content in a sized field. String labels and descriptions stay on
// one line with an ellipsis (the full string still names the checkbox); rich
// labels and descriptions wrap. `width` sizes the label, list, and status
// together.
export const LongContent: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['comments']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem
          label="Comments, mentions, and replies across every shared workspace"
          value="comments"
          description="Delivered to the primary address listed in your account settings"
        />
        <CheckboxListItem
          label={
            <span>
              Security alerts for new sign-ins on phones, tablets, and desktops
            </span>
          }
          value="security"
          description={
            <span>
              Includes a weekly summary of every device that accessed your
              account
            </span>
          }
        />
        <CheckboxListItem label="SMS" value="sms" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification channels for workspace activity and account security',
    description:
      'Choose every channel that should receive these notifications. You can change this at any time.',
    width: 280,
    hasDividers: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the group to see
// why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the checkboxes stay focusable (toggling is still
// blocked). disabledMessage applies to the whole-group disabled state. Use it
// instead of wrapping a disabled CheckboxList in Tooltip: disabled controls
// swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['email']);
    const {value: _value, onChange: _onChange, ...restArgs} = args;
    return (
      <CheckboxList {...restArgs} value={value} onChange={setValue}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
        <CheckboxListItem label="Push notification" value="push" />
      </CheckboxList>
    );
  },
  args: {
    label: 'Notification preferences',
    isDisabled: true,
    disabledMessage: 'Notifications are managed by your administrator',
  },
};
