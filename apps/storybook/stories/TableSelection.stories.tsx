// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Pagination} from '@astryxdesign/core/Pagination';
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

// =============================================================================
// Recipe: select every matching row across server pages
// =============================================================================

const MATCHING_TOTAL = 248;
const MATCHING_PAGE_SIZE = 5;
const MATCHING_ROLES = ['Engineer', 'Designer', 'Manager', 'Admin'];

/** Stands in for a server that returns one page of the matching rows. */
function fetchMatchingPage(page: number): User[] {
  const start = (page - 1) * MATCHING_PAGE_SIZE;
  const count = Math.min(MATCHING_PAGE_SIZE, MATCHING_TOTAL - start);
  return Array.from({length: count}, (_, index) => {
    const number = start + index + 1;
    return {
      id: `record-${number}`,
      name: `Record ${number}`,
      email: `record${number}@example.com`,
      role: MATCHING_ROLES[number % MATCHING_ROLES.length],
      isLocked: false,
    };
  });
}

/**
 * The app's own selection model. `picked` holds the rows chosen one by one;
 * when `isAllMatching` is true, every matching row is selected except
 * `excluded`, including rows on pages that were never loaded.
 */
interface MatchingSelection {
  isAllMatching: boolean;
  picked: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
}

const NO_SELECTION: MatchingSelection = {
  isAllMatching: false,
  picked: new Set(),
  excluded: new Set(),
};

function SelectAllMatchingExample() {
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<MatchingSelection>(NO_SELECTION);
  const rows = fetchMatchingPage(page);

  const isSelected = (row: User) =>
    selection.isAllMatching
      ? !selection.excluded.has(row.id)
      : selection.picked.has(row.id);
  const isPageSelected = rows.every(isSelected);
  const selectedCount = selection.isAllMatching
    ? MATCHING_TOTAL - selection.excluded.size
    : selection.picked.size;

  const setRows = (pageRows: User[], selected: boolean) => {
    setSelection(current => {
      const ids = pageRows.map(row => row.id);
      if (current.isAllMatching) {
        const excluded = new Set(current.excluded);
        for (const id of ids) {
          if (selected) {
            excluded.delete(id);
          } else {
            excluded.add(id);
          }
        }
        return {...current, excluded};
      }
      const picked = new Set(current.picked);
      for (const id of ids) {
        if (selected) {
          picked.add(id);
        } else {
          picked.delete(id);
        }
      }
      return {...current, picked};
    });
  };

  const selectionPlugin = useTableSelection<User>({
    getIsItemSelected: isSelected,
    onSelectItem: ({item, isSelected: selected}) => setRows([item], selected),
    onSelectAll: ({isAllSelected}) => setRows(rows, isAllSelected),
    getIsAllSelected: () => isPageSelected,
    getIsIndeterminate: () => !isPageSelected && rows.some(isSelected),
    getRowLabel: row => row.name,
  });

  // The toolbar only shows the app's model. `selectedKeys` can hold only the
  // loaded rows; the count comes from the app.
  const toolbarSelection: TableSelectionState = {
    selectedKeys: new Set(rows.filter(isSelected).map(row => row.id)),
    selectedCount,
    hasSelection: selectedCount > 0,
    clearSelection: () => setSelection(NO_SELECTION),
  };

  const renderSelectionLabel = (count: number) => {
    if (!selection.isAllMatching) {
      return `${count} selected`;
    }
    return selection.excluded.size === 0
      ? `All ${MATCHING_TOTAL} matching selected`
      : `${count} of ${MATCHING_TOTAL} matching selected`;
  };

  return (
    <div {...stylex.props(bulkActionsStyles.page)}>
      <TableSelectionToolbar
        selection={toolbarSelection}
        renderSelectionLabel={renderSelectionLabel}
        startContent={
          <>
            <Button label="Archive" variant="ghost" onClick={() => {}} />
            {/* Beside the action, not in its place. Once used, the offer
                stays as the command that undoes it, so focus stays on it
                and a second press can never run Archive. */}
            {selection.isAllMatching || isPageSelected ? (
              <Button
                label={
                  selection.isAllMatching
                    ? 'Select only this page'
                    : `Select all ${MATCHING_TOTAL} matching`
                }
                variant="ghost"
                onClick={() =>
                  setSelection(
                    selection.isAllMatching
                      ? {
                          isAllMatching: false,
                          // Every row on this page, so the label stays true
                          // and the focused button stays mounted.
                          picked: new Set(rows.map(row => row.id)),
                          excluded: new Set(),
                        }
                      : {
                          isAllMatching: true,
                          picked: new Set(),
                          excluded: new Set(),
                        },
                  )
                }
              />
            ) : null}
          </>
        }
      />
      <Table
        data={rows}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{selection: selectionPlugin}}
      />
      <Pagination
        page={page}
        onChange={setPage}
        totalItems={MATCHING_TOTAL}
        pageSize={MATCHING_PAGE_SIZE}
      />
    </div>
  );
}

/**
 * Recipe: select every row that matches a query across server pages, then
 * untick a few, with today's API. The app keeps "all matching minus
 * exclusions" and passes its own count and label to the toolbar. In this mode
 * the toolbar's `selectedKeys` holds only the loaded rows.
 */
export const SelectAllMatching: Story = {
  render: () => <SelectAllMatchingExample />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText('Select all rows'));
    await expect(canvas.getByText('5 selected')).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', {name: 'Select all 248 matching'}),
    );
    await expect(
      canvas.getByText('All 248 matching selected'),
    ).toBeInTheDocument();
    // The used offer stays as the command that undoes it and keeps focus,
    // so a second Enter returns to this page and never reaches Archive.
    const undo = canvas.getByRole('button', {name: 'Select only this page'});
    await expect(undo).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('5 selected')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', {name: 'Select all 248 matching'}),
    ).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(
      canvas.getByText('All 248 matching selected'),
    ).toBeInTheDocument();

    // With a row unticked, "Select only this page" selects the whole page
    // and keeps focus on the button.
    await userEvent.click(canvas.getByLabelText('Select Record 2'));
    await expect(
      canvas.getByText('247 of 248 matching selected'),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', {name: 'Select only this page'}),
    );
    await expect(canvas.getByText('5 selected')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', {name: 'Select all 248 matching'}),
    ).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await userEvent.click(canvas.getByLabelText('Select Record 2'));
    await expect(
      canvas.getByText('247 of 248 matching selected'),
    ).toBeInTheDocument();

    // Rows on a page never loaded before are already selected.
    await userEvent.click(
      canvas.getByRole('button', {name: 'Go to next page'}),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText('Select Record 6')).toBeChecked(),
    );

    await userEvent.click(canvas.getByRole('button', {name: 'Unselect All'}));
    await expect(
      canvas.queryByRole('toolbar', {name: 'Bulk actions'}),
    ).not.toBeInTheDocument();
  },
};
