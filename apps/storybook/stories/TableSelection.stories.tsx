// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {
  Table,
  TableSelectionToolbar,
  useTableSelection,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import type {TableColumn, TableSelectionState} from '@astryxdesign/core/Table';
import {
  colorVars,
  radiusVars,
  shadowVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// =============================================================================
// Sample Data
// =============================================================================

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  isLocked: boolean;
}

const users: User[] = [
  {
    id: '1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Engineer',
    isLocked: false,
  },
  {
    id: '2',
    name: 'Bob',
    email: 'bob@example.com',
    role: 'Designer',
    isLocked: false,
  },
  {
    id: '3',
    name: 'Charlie',
    email: 'charlie@example.com',
    role: 'Manager',
    isLocked: false,
  },
  {
    id: '4',
    name: 'Diana',
    email: 'diana@example.com',
    role: 'Engineer',
    isLocked: true,
  },
  {
    id: '5',
    name: 'Eve',
    email: 'eve@example.com',
    role: 'Admin',
    isLocked: false,
  },
];

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name'},
  {key: 'email', header: 'Email'},
  {key: 'role', header: 'Role'},
];

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TableSelection',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Selected: {selectedKeys.size} of {users.length}
        </p>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const WithPreselection: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
      new Set(['1', '3']),
    );

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Selected: {[...selectedKeys].join(', ') || 'none'}
        </p>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const NonSelectableRows: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
      getIsItemSelectable: item => item.role !== 'Admin',
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Admin rows have no checkbox. Selected: {selectedKeys.size}
        </p>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const DisabledRows: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
      getIsItemEnabled: item => !item.isLocked,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Locked rows (Diana) have a disabled checkbox. Select-all skips them.
          Selected: {selectedKeys.size}
        </p>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const Compact: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          density="compact"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const Spacious: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          density="spacious"
          hasHover
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const WithStripedRows: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {selectionConfig} = useTableSelectionState<User>({
      data: users,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<User>(selectionConfig);

    return (
      <div style={{maxWidth: 600}}>
        <Table
          data={users}
          columns={columns}
          idKey="id"
          isStriped
          plugins={{selection: selectionPlugin}}
        />
      </div>
    );
  },
};

const longUsers: User[] = Array.from({length: 40}, (_, index) => {
  const user = users[index % users.length];
  return {
    ...user,
    id: `long-${index + 1}`,
    name: `${user.name} ${index + 1}`,
  };
});

const bulkActionsStyles = stylex.create({
  page: {
    maxWidth: 600,
    marginInline: 'auto',
  },
  scrollContainer: {
    maxBlockSize: 640,
    isolation: 'isolate',
    scrollbarGutter: 'stable',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-6'],
  },
  metricCard: {
    padding: spacingVars['--spacing-4'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  metricLabel: {
    display: 'block',
    color: colorVars['--color-text-secondary'],
  },
  metricValue: {
    display: 'block',
    marginBlockStart: spacingVars['--spacing-1'],
    color: colorVars['--color-text-primary'],
  },
  tableRegion: {
    position: 'relative',
  },
  floatingRegion: {
    // Reserve the 28px sm control plus 8px block padding on each side, then a
    // 16px gap. The toolbar reads the same value for every placement offset,
    // so selection never moves the table.
    '--table-bulk-actions-space': `calc(${sizeVars['--size-element-sm']} + ${spacingVars['--spacing-2']} + ${spacingVars['--spacing-2']} + ${spacingVars['--spacing-4']})`,
    paddingBlockStart: 'var(--table-bulk-actions-space)',
  },
  floatingToolbar: {
    // The transformed normal position is 16px above the table. The sticky
    // inset includes one additional 16px gap, leaving the visible surface 16px
    // from the self-contained scrollport edge.
    position: 'sticky',
    insetBlockStart: `calc(var(--table-bulk-actions-space) + ${spacingVars['--spacing-4']})`,
    transform: 'translateY(calc(0px - var(--table-bulk-actions-space)))',
    marginBlockEnd: `calc(${spacingVars['--spacing-4']} - var(--table-bulk-actions-space))`,
    zIndex: 1,
    borderRadius: radiusVars['--radius-element'],
    boxShadow: shadowVars['--shadow-med'],
  },
});

type BulkActionsLayout = 'fixed' | 'floating';

function BulkActionsBar({
  layout,
  selection,
}: {
  layout: BulkActionsLayout;
  selection: TableSelectionState;
}) {
  return (
    <TableSelectionToolbar
      selection={selection}
      data-layout={layout}
      xstyle={
        layout === 'floating' ? bulkActionsStyles.floatingToolbar : undefined
      }
      startContent={
        layout === 'floating' ? (
          <Button label="Approve" variant="ghost" onClick={() => {}} />
        ) : (
          <>
            <Button label="Export" variant="ghost" onClick={() => {}} />
            <Button
              label="Delete"
              variant="ghost"
              onClick={selection.clearSelection}
            />
          </>
        )
      }
    />
  );
}

function BulkActionsExample({layout}: {layout: BulkActionsLayout}) {
  const data = layout === 'floating' ? longUsers : users;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const {selectionConfig, selectionState} = useTableSelectionState<User>({
    data,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<User>(selectionConfig);

  const content = (
    <>
      {layout === 'floating' ? (
        <div {...stylex.props(bulkActionsStyles.metrics)}>
          {[
            ['Active users', '12,840'],
            ['Selection rate', '18.4%'],
            ['Pending reviews', '247'],
          ].map(([label, value]) => (
            <div key={label} {...stylex.props(bulkActionsStyles.metricCard)}>
              <span {...stylex.props(bulkActionsStyles.metricLabel)}>
                {label}
              </span>
              <strong {...stylex.props(bulkActionsStyles.metricValue)}>
                {value}
              </strong>
            </div>
          ))}
        </div>
      ) : null}
      <div
        data-table-region={layout}
        {...stylex.props(
          bulkActionsStyles.tableRegion,
          layout === 'floating' && bulkActionsStyles.floatingRegion,
        )}>
        <BulkActionsBar layout={layout} selection={selectionState} />
        <Table
          data={data}
          columns={columns}
          idKey="id"
          hasHover
          plugins={{selection: selectionPlugin}}
        />
      </div>
    </>
  );

  return layout === 'floating' ? (
    <div {...stylex.props(bulkActionsStyles.page)}>
      <ScrollableArea
        axis="block"
        label="Bulk actions example"
        overscroll="contain"
        xstyle={bulkActionsStyles.scrollContainer}>
        {content}
      </ScrollableArea>
    </div>
  ) : (
    <div {...stylex.props(bulkActionsStyles.page)}>{content}</div>
  );
}

/**
 * Product-composed in-flow bar. Actions lead; selection status and clear trail.
 */
export const BulkActions: Story = {
  render: () => <BulkActionsExample layout="fixed" />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByLabelText('Select row')[0]);

    const toolbar = canvas.getByRole('toolbar', {name: 'Bulk actions'});
    const toolbarSurface = toolbar.closest('.astryx-section');
    await expect(toolbar).toHaveAttribute('data-layout', 'fixed');
    await expect(toolbar).toHaveAttribute('data-size', 'sm');
    await expect(toolbarSurface).toHaveAttribute('data-variant', 'muted');
    await expect(toolbar.closest('[role="group"]')).toBeNull();
    await expect(canvas.getByText('1 selected')).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', {name: 'Unselect All'}));
    await expect(
      canvas.queryByRole('toolbar', {name: 'Bulk actions'}),
    ).not.toBeInTheDocument();

    // Leave the story ready for manual review.
    await userEvent.click(canvas.getAllByLabelText('Select row')[0]);
  },
};

/**
 * Product-composed floating bar for a long, non-sticky table below metrics.
 * The example owns a capped scrollport; the toolbar stays 16px from that
 * scrollport and releases at the table region's block-end boundary.
 */
export const BulkActionsFloating: Story = {
  render: () => <BulkActionsExample layout="floating" />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const scrollRegion = await canvas.findByRole('group', {
      name: 'Bulk actions example',
    });
    const table = canvas.getByRole('table');
    const tableTopBeforeSelection = table.getBoundingClientRect().top;

    await expect(scrollRegion.scrollHeight).toBeGreaterThan(
      scrollRegion.clientHeight,
    );
    await expect(scrollRegion).toHaveAttribute('tabindex', '0');
    await expect(canvas.queryByRole('region', {name: 'Metrics'})).toBeNull();
    const scrollStyles = getComputedStyle(scrollRegion);
    await expect(scrollStyles.overscrollBehaviorY).toBe('contain');
    await expect(scrollStyles.overscrollBehaviorX).toBe('auto');
    await expect(scrollStyles.isolation).toBe('isolate');
    await userEvent.click(canvas.getAllByLabelText('Select row')[0]);

    const toolbar = canvas.getByRole('toolbar', {name: 'Bulk actions'});
    const toolbarSurface = toolbar.closest<HTMLElement>('.astryx-section');
    if (toolbarSurface == null) {
      throw new Error('Expected the Toolbar surface');
    }

    await expect(toolbar).toHaveAttribute('data-layout', 'floating');
    await expect(toolbar).toHaveAttribute('data-size', 'sm');
    await expect(toolbarSurface).toHaveAttribute('data-variant', 'muted');
    await expect(toolbar.closest('[role="group"]')).toBe(scrollRegion);
    await expect(
      Math.abs(table.getBoundingClientRect().top - tableTopBeforeSelection),
    ).toBeLessThanOrEqual(1);

    scrollRegion.scrollTop = 300;
    scrollRegion.dispatchEvent(new Event('scroll'));
    await waitFor(() => {
      expect(
        Math.round(
          toolbarSurface.getBoundingClientRect().top -
            scrollRegion.getBoundingClientRect().top,
        ),
      ).toBe(16);
    });

    scrollRegion.scrollTop = 0;
  },
};
