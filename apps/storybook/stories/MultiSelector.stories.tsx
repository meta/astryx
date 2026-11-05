// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {InputGroup, InputGroupText} from '@astryxdesign/core/InputGroup';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof MultiSelector> = {
  title: 'Core/MultiSelector',
  component: MultiSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 300}}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    label: {control: 'text'},
    isLabelHidden: {control: 'boolean'},
    description: {control: 'text'},
    placeholder: {control: 'text'},
    size: {control: 'radio', options: ['sm', 'md', 'lg']},
    variant: {control: 'radio', options: ['input', 'secondary', 'ghost']},
    presentation: {
      control: 'radio',
      options: ['popover', 'bottom-sheet', 'adaptive'],
    },
    triggerDisplay: {
      control: 'radio',
      options: ['count', 'labels', 'badges'],
    },
    isDisabled: {control: 'boolean'},
    isReadOnly: {control: 'boolean'},
    disabledMessage: {control: 'text'},
    isOptional: {control: 'boolean'},
    isRequired: {control: 'boolean'},
    hasSelectAll: {control: 'boolean'},
    hasSearch: {control: 'boolean'},
  },
};

export default meta;
type Story = StoryObj<typeof MultiSelector>;

// Basic with strings
export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['Role', 'Created']);
    return (
      <MultiSelector
        {...args}
        label={args.label ?? 'Columns'}
        options={args.options ?? ['Name', 'Email', 'Role', 'Status', 'Created']}
        value={value}
        onChange={setValue}
      />
    );
  },
  args: {
    placeholder: 'Select columns...',
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Assigned teams',
    options: ['Design', 'Engineering', 'Marketing'],
    value: ['Design', 'Engineering'],
    onChange: () => {},
    hasClear: true,
    hasSearch: true,
    htmlName: 'teams',
    triggerDisplay: 'labels',
    isReadOnly: true,
  },
};

export const BottomSheetPresentation: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Teams"
        options={['Design', 'Engineering', 'Marketing', 'Operations']}
        value={value}
        onChange={setValue}
        hasSelectAll
        presentation="bottom-sheet"
      />
    );
  },
};

// With sections
export const Sections: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Permissions"
        options={[
          {
            type: 'section',
            title: 'Read',
            options: [
              {value: 'read_posts', label: 'Read posts'},
              {value: 'read_comments', label: 'Read comments'},
              {value: 'read_users', label: 'Read users'},
            ],
          },
          {
            type: 'section',
            title: 'Write',
            options: [
              {value: 'write_posts', label: 'Write posts'},
              {value: 'write_comments', label: 'Write comments'},
            ],
          },
        ]}
        value={value}
        onChange={setValue}
        placeholder="Select permissions..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// Searchable with sections: filtering keeps group headers and drops empty groups
export const SearchableSections: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Permissions"
        hasSearch
        options={[
          {
            type: 'section',
            title: 'Read',
            options: [
              {value: 'read_posts', label: 'Read posts'},
              {value: 'read_comments', label: 'Read comments'},
              {value: 'read_users', label: 'Read users'},
            ],
          },
          {
            type: 'section',
            title: 'Write',
            options: [
              {value: 'write_posts', label: 'Write posts'},
              {value: 'write_comments', label: 'Write comments'},
            ],
          },
        ]}
        value={value}
        onChange={setValue}
        placeholder="Select permissions..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// With Select All
export const SelectAll: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Columns"
        options={['Name', 'Email', 'Role', 'Status', 'Created', 'Updated']}
        value={value}
        onChange={setValue}
        hasSelectAll
        placeholder="Select columns..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// Searchable: the dropdown search field has a built-in leading magnifier icon
// and a trailing clear (✕) button that appears once a query is typed.
export const Searchable: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Countries"
        options={[
          'United States',
          'United Kingdom',
          'Canada',
          'Australia',
          'Germany',
          'France',
          'Japan',
          'Brazil',
          'India',
          'Mexico',
        ]}
        value={value}
        onChange={setValue}
        hasSearch
        hasSelectAll
        placeholder="Select countries..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// Empty states
export const EmptyStates: Story = {
  render: () => {
    const [a, setA] = useState<string[]>([]);
    const [b, setB] = useState<string[]>([]);
    const [c, setC] = useState<string[]>([]);
    const [d, setD] = useState<string[]>([]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 300}}>
        <MultiSelector
          label="No options (default)"
          options={[]}
          value={a}
          onChange={setA}
        />
        <MultiSelector
          label="No options (custom)"
          options={[]}
          value={b}
          onChange={setB}
          emptyText="No countries loaded yet"
        />
        <MultiSelector
          label="Search for xyz (custom)"
          options={['Canada', 'France', 'Japan']}
          value={c}
          onChange={setC}
          hasSearch
          emptySearchText="Nothing matches that country"
        />
        <MultiSelector
          label="Loading (no message)"
          options={[]}
          value={d}
          onChange={setD}
          isLoading
        />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Trigger display modes
export const TriggerModes: Story = {
  render: () => {
    const [value1, setValue1] = useState<string[]>(['Name', 'Email']);
    const [value2, setValue2] = useState<string[]>(['Name', 'Email', 'Role']);
    const [value3, setValue3] = useState<string[]>([
      'Name',
      'Email',
      'Role',
      'Status',
      'Created',
    ]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 300}}>
        <MultiSelector
          label="Count (default)"
          options={['Name', 'Email', 'Role', 'Status', 'Created']}
          value={value1}
          onChange={setValue1}
          triggerDisplay="count"
        />
        <MultiSelector
          label="Labels"
          options={['Name', 'Email', 'Role', 'Status', 'Created']}
          value={value2}
          onChange={setValue2}
          triggerDisplay="labels"
        />
        <MultiSelector
          label="Badges"
          options={['Name', 'Email', 'Role', 'Status', 'Created']}
          value={value3}
          onChange={setValue3}
          triggerDisplay="badges"
          maxBadges={3}
        />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Disabled items
export const DisabledItems: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['admin']);
    return (
      <MultiSelector
        label="Roles"
        options={[
          {value: 'admin', label: 'Admin', disabled: true},
          {value: 'editor', label: 'Editor'},
          {value: 'viewer', label: 'Viewer'},
          {value: 'guest', label: 'Guest'},
        ]}
        value={value}
        onChange={setValue}
        hasSelectAll
        placeholder="Select roles..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the trigger to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby, and the trigger stays focusable (activation is still
// blocked). Use disabledMessage instead of wrapping a disabled MultiSelector in
// Tooltip: disabled controls swallow the pointer events a Tooltip wrapper needs.
export const DisabledWithMessage: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelector
        label="Columns"
        options={['Name', 'Email', 'Role', 'Status', 'Created']}
        value={value}
        onChange={setValue}
        isDisabled
        disabledMessage="Select a table before choosing columns"
        placeholder="Select columns..."
      />
    );
  },
  decorators: [Story => <Story />],
};

// Ghost variant for toolbar composition
export const GhostVariant: Story = {
  render: () => {
    const [columns, setColumns] = useState<string[]>(['Name', 'Email']);
    const [filters, setFilters] = useState<string[]>(['Active']);
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: 'max-content',
        }}>
        <Button label="Refresh" variant="ghost" />
        <MultiSelector
          label="Columns"
          isLabelHidden
          variant="ghost"
          size="md"
          options={['Name', 'Email', 'Role', 'Status', 'Created']}
          value={columns}
          onChange={setColumns}
          triggerDisplay="labels"
          placeholder="Columns"
        />
        <MultiSelector
          label="Status"
          isLabelHidden
          variant="ghost"
          size="md"
          options={['Active', 'Inactive', 'Pending', 'Archived']}
          value={filters}
          onChange={setFilters}
          triggerDisplay="labels"
          placeholder="Status"
          status={{type: 'warning', message: 'Some filters hide archived rows'}}
          statusVariant="tooltip"
        />
        <Button label="Export" variant="ghost" />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Secondary variant for toolbar composition beside secondary buttons
export const SecondaryVariant: Story = {
  render: () => {
    const [columns, setColumns] = useState<string[]>(['Name', 'Email']);
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: 'max-content',
        }}>
        <Button label="Refresh" variant="secondary" />
        <MultiSelector
          label="Columns"
          isLabelHidden
          variant="secondary"
          size="md"
          width={180}
          options={['Name', 'Email', 'Role', 'Status', 'Created']}
          value={columns}
          onChange={setColumns}
          triggerDisplay="labels"
          placeholder="Columns"
        />
        <Button label="Export" variant="secondary" />
      </div>
    );
  },
  decorators: [Story => <Story />],
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox', {name: 'Columns'});
    const root = canvasElement.querySelector<HTMLElement>(
      '.astryx-multi-selector[data-variant="secondary"]',
    );
    if (root == null) {
      throw new Error('Secondary MultiSelector root not found');
    }
    const widthBefore = root.getBoundingClientRect().width;
    expect(widthBefore).toBeCloseTo(180, 0);

    await userEvent.click(trigger);
    const listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', {name: /Role/}));
    await waitFor(() =>
      expect(root.getBoundingClientRect().width).toBeCloseTo(widthBefore, 0),
    );
    await userEvent.keyboard('{Escape}');
    trigger.blur();
  },
};

// Secondary trigger as the first, middle, and last member of an InputGroup:
// it keeps its neutral fill and takes the group's row height and seam edges.
export const SecondaryInInputGroup: Story = {
  render: () => {
    const selector = (label: string) => (
      <MultiSelector
        label={label}
        isLabelHidden
        variant="secondary"
        options={['Name', 'Email', 'Role']}
        value={['Name']}
        onChange={() => {}}
      />
    );
    return (
      <div
        data-secondary-input-group-matrix
        style={{display: 'grid', gap: 16, width: 320}}>
        <InputGroup label="Secondary first" isLabelHidden>
          {selector('Columns first')}
          <InputGroupText>cols</InputGroupText>
        </InputGroup>
        <InputGroup label="Secondary middle" isLabelHidden>
          <InputGroupText>#</InputGroupText>
          {selector('Columns middle')}
          <InputGroupText>cols</InputGroupText>
        </InputGroup>
        <InputGroup label="Secondary last" isLabelHidden>
          <InputGroupText>#</InputGroupText>
          {selector('Columns last')}
        </InputGroup>
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Status variants
export const Status: Story = {
  render: () => {
    const [value1, setValue1] = useState<string[]>([]);
    const [value2, setValue2] = useState<string[]>(['Email']);
    const [value3, setValue3] = useState<string[]>(['Name', 'Email']);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 300}}>
        <MultiSelector
          label="Error"
          options={['Name', 'Email', 'Role']}
          value={value1}
          onChange={setValue1}
          status={{type: 'error', message: 'Please select at least one column'}}
          placeholder="Select..."
        />
        <MultiSelector
          label="Warning"
          options={['Name', 'Email', 'Role']}
          value={value2}
          onChange={setValue2}
          status={{type: 'warning', message: 'Email column has issues'}}
        />
        <MultiSelector
          label="Success"
          options={['Name', 'Email', 'Role']}
          value={value3}
          onChange={setValue3}
          status={{type: 'success'}}
        />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Size variants
const compactSizingTheme = defineTheme({
  name: 'multi-selector-compact-sizing',
  tokens: {
    '--spacing-5': '10px',
    '--size-element-sm': '24px',
    '--size-element-md': '28px',
    '--size-element-lg': '32px',
  },
});

export const Sizes: Story = {
  render: () => {
    const [value1, setValue1] = useState<string[]>([]);
    const [value2, setValue2] = useState<string[]>([]);
    const [value3, setValue3] = useState<string[]>([]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 300}}>
        <MultiSelector
          label="Small"
          size="sm"
          options={['Name', 'Email', 'Role']}
          value={value1}
          onChange={setValue1}
          placeholder="Small (28px)"
        />
        <MultiSelector
          label="Medium"
          size="md"
          options={['Name', 'Email', 'Role']}
          value={value2}
          onChange={setValue2}
          placeholder="Medium (32px)"
        />
        <MultiSelector
          label="Large"
          size="lg"
          options={['Name', 'Email', 'Role']}
          value={value3}
          onChange={setValue3}
          placeholder="Large (36px)"
        />
        <Theme theme={compactSizingTheme}>
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} style={{display: 'grid', gap: 8}}>
              {(
                [
                  'plain',
                  'start',
                  'option',
                  'status',
                  'tooltip',
                  'clear',
                  'loading',
                  'readonly',
                ] as const
              ).map(state => (
                <MultiSelector
                  key={state}
                  label={`Compact ${size} ${state}`}
                  size={size}
                  options={[
                    {
                      value: 'name',
                      label: 'Name',
                      icon: state === 'option' ? 'search' : undefined,
                    },
                  ]}
                  value={['name']}
                  onChange={() => {}}
                  startIcon={state === 'start' ? 'search' : undefined}
                  status={
                    state === 'status' || state === 'tooltip'
                      ? {type: 'warning', message: 'Check selection'}
                      : undefined
                  }
                  statusVariant={state === 'tooltip' ? 'tooltip' : 'attached'}
                  hasClear={state === 'clear'}
                  isLoading={state === 'loading'}
                  isReadOnly={state === 'readonly'}
                />
              ))}
            </div>
          ))}
        </Theme>
      </div>
    );
  },
  decorators: [Story => <Story />],
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    const triggers = canvasElement.querySelectorAll<HTMLElement>(
      '.astryx-multi-selector',
    );
    expect(triggers).toHaveLength(27);
    for (const trigger of triggers) {
      const size = Number.parseFloat(
        getComputedStyle(trigger).getPropertyValue(
          `--size-element-${trigger.dataset.size}`,
        ),
      );
      expect(
        trigger.getBoundingClientRect().height,
        trigger.textContent ?? '',
      ).toBeCloseTo(size, 1);
    }
  },
};

// Form composition
export const FormComposition: Story = {
  render: () => {
    const [columns, setColumns] = useState<string[]>(['name', 'email']);
    const [filters, setFilters] = useState<string[]>([]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 16, width: 300}}>
        <MultiSelector
          label="Visible columns"
          description="Choose which columns to display in the table"
          options={[
            {value: 'name', label: 'Name'},
            {value: 'email', label: 'Email'},
            {value: 'role', label: 'Role'},
            {value: 'status', label: 'Status'},
            {value: 'created', label: 'Created at'},
          ]}
          value={columns}
          onChange={setColumns}
          hasSelectAll
          isRequired
          triggerDisplay="labels"
        />
        <MultiSelector
          label="Status filter"
          description="Filter by status"
          options={['Active', 'Inactive', 'Pending', 'Archived']}
          value={filters}
          onChange={setFilters}
          isOptional
          triggerDisplay="badges"
          placeholder="All statuses"
        />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

// Column visibility
export const ColumnVisibility: Story = {
  render: () => {
    const allColumns = [
      {value: 'name', label: 'Name'},
      {value: 'email', label: 'Email'},
      {value: 'role', label: 'Role'},
      {value: 'status', label: 'Status'},
      {value: 'created', label: 'Created'},
      {value: 'updated', label: 'Updated'},
      {value: 'actions', label: 'Actions'},
    ];
    const [visible, setVisible] = useState<string[]>([
      'name',
      'email',
      'role',
      'status',
    ]);
    return (
      <MultiSelector
        label="Columns"
        isLabelHidden
        options={allColumns}
        value={visible}
        onChange={setVisible}
        hasSelectAll
        hasSearch
        triggerDisplay="count"
        placeholder="Columns"
      />
    );
  },
  decorators: [Story => <Story />],
};

export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['react', 'typescript']);
    return (
      <MultiSelector
        {...args}
        options={[
          {value: 'react', label: 'React'},
          {value: 'typescript', label: 'TypeScript'},
          {value: 'stylex', label: 'StyleX'},
          {value: 'vitest', label: 'Vitest'},
        ]}
        value={value}
        onChange={setValue}
        hasClear
      />
    );
  },
  args: {
    label: 'Technologies',
    placeholder: 'Select technologies...',
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<string[]>([]);
    const [b, setB] = useState<string[]>([]);
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 300}}>
        <MultiSelector
          label="Attached (default)"
          options={['Name', 'Email', 'Role']}
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'Select at least one column'}}
          placeholder="Select..."
        />
        <MultiSelector
          label="Detached"
          options={['Name', 'Email', 'Role']}
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'Select at least one column'}}
          statusVariant="detached"
          placeholder="Select..."
        />
      </div>
    );
  },
  decorators: [Story => <Story />],
};

/**
 * Theme the clear and chevron glyphs precisely via `defineTheme`.
 *
 * - `components['input-clear-icon'].base` scopes overrides to the
 *   clear icon itself (via the `astryx-input-clear-icon` target), so a
 *   theme can recolor it, morph its color on hover, and resize it — without a
 *   fragile descendant selector or raw CSS.
 * - `components['multi-selector-indicator-icon']` scopes overrides to the
 *   chevron, and its `state:expanded` restyles the open state, which the icon
 *   reflects as a `data-state` attribute.
 *
 * Same-element rules in `@layer astryx-theme` win over each icon's own base
 * color/size.
 */
const iconTheme = defineTheme({
  name: 'multi-selector-icon-demo',
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
    'multi-selector-indicator-icon': {
      base: {
        width: '14px',
        height: '14px',
        fontSize: '14px',
        color: 'var(--color-icon-secondary)',
      },
      'state:expanded': {
        color: 'var(--color-accent)',
      },
    },
  },
});

export const ThemedIcons: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['Apple', 'Banana']);
    return (
      <Theme theme={iconTheme} mode="light">
        <MultiSelector
          label="Icons themed (accent on hover/open)"
          options={['Apple', 'Banana', 'Orange']}
          value={value}
          onChange={setValue}
          hasClear
        />
      </Theme>
    );
  },
};

/**
 * `indicatorPosition="end"` moves the checkbox to the trailing edge of each
 * row. The default is `start`, where the checkbox leads the label as it does in
 * CheckboxList.
 */
export const EndIndicatorPosition: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['Name', 'Email']);
    return (
      // No hasSelectAll: its divider is an unallowed listbox child and fails
      // the a11y audit as soon as a story opens the popup (#4994).
      <MultiSelector
        label="Columns"
        options={['Name', 'Email', 'Role', 'Status']}
        value={value}
        onChange={setValue}
        indicatorPosition="end"
        isDefaultOpen
      />
    );
  },
};

export const CreateFromQuery: Story = {
  render: () => {
    const [options, setOptions] = useState([
      {value: 'bug', label: 'Bug'},
      {value: 'feature', label: 'Feature'},
      {value: 'docs', label: 'Docs'},
    ]);
    const [value, setValue] = useState<string[]>(['bug']);
    return (
      <MultiSelector
        label="Labels"
        options={options}
        value={value}
        onChange={(next, change) => {
          if (change?.type === 'create') {
            setOptions(current => [
              ...current,
              {value: change.query, label: change.query},
            ]);
          }
          setValue(next);
        }}
        hasSearch
        hasCreate
        triggerDisplay="badges"
        isDefaultOpen
      />
    );
  },
};

export const RowActions: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['feature']);
    const [lastEdited, setLastEdited] = useState<string | null>(null);
    const action = (label: string) => (
      <IconButton
        label={`Edit ${label}`}
        icon="moreHorizontal"
        variant="ghost"
        size="sm"
        tooltip={`Edit ${label}`}
        onClick={() => setLastEdited(label)}
      />
    );
    return (
      <>
        <MultiSelector
          label="Labels"
          options={[
            {
              type: 'section',
              title: 'Type',
              options: [
                {value: 'feature', label: 'Feature'},
                {value: 'bug', label: 'Bug', action: action('Bug')},
                {value: 'docs', label: 'Docs'},
                {
                  value: 'review',
                  label: 'Design review',
                  action: action('Design review'),
                },
              ],
            },
            {
              type: 'section',
              title: 'Priority',
              options: [
                {value: 'p0', label: 'P0', action: action('P0')},
                {value: 'p1', label: 'P1', action: action('P1')},
              ],
            },
          ]}
          value={value}
          onChange={setValue}
          hasSearch
          hasSelectAll
          hasClear
          triggerDisplay="badges"
          isDefaultOpen
        />
        <output data-testid="last-edited">{lastEdited ?? ''}</output>
      </>
    );
  },
};

export const RowActionsRtl: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <div dir="rtl">
        <MultiSelector
          label="Labels"
          options={[
            {
              value: 'bug',
              label: 'Bug',
              action: (
                <IconButton
                  label="Edit Bug"
                  icon="moreHorizontal"
                  variant="ghost"
                  size="sm"
                />
              ),
            },
            {value: 'feature', label: 'Feature'},
          ]}
          value={value}
          onChange={setValue}
          isDefaultOpen
        />
      </div>
    );
  },
};
