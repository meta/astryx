// Copyright (c) Meta Platforms, Inc. and affiliates.

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableStickyColumns,
  useTableColumnResize,
  pixel,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {stoneTheme} from '@astryxdesign/theme-stone';

// =============================================================================
// Sample Data — wide enough to require horizontal scroll
// =============================================================================

interface Employee extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
  location: string;
  startDate: string;
  manager: string;
  status: string;
}

const employees: Employee[] = [
  {
    id: '1',
    name: 'Alice Nguyen',
    email: 'alice@example.com',
    team: 'Design Systems',
    role: 'Staff Engineer',
    location: 'San Francisco',
    startDate: '2019-03-12',
    manager: 'Priya Patel',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Bob Martinez',
    email: 'bob@example.com',
    team: 'Design Systems',
    role: 'Senior Designer',
    location: 'New York',
    startDate: '2020-07-01',
    manager: 'Priya Patel',
    status: 'Active',
  },
  {
    id: '3',
    name: 'Charlie Okafor',
    email: 'charlie@example.com',
    team: 'Platform',
    role: 'Engineering Manager',
    location: 'London',
    startDate: '2017-11-20',
    manager: 'Sam Lee',
    status: 'On leave',
  },
  {
    id: '4',
    name: 'Diana Rossi',
    email: 'diana@example.com',
    team: 'Platform',
    role: 'Staff Engineer',
    location: 'Remote',
    startDate: '2021-01-15',
    manager: 'Sam Lee',
    status: 'Active',
  },
  {
    id: '5',
    name: 'Ehsan Karimi',
    email: 'ehsan@example.com',
    team: 'Growth',
    role: 'Product Engineer',
    location: 'Berlin',
    startDate: '2022-05-30',
    manager: 'Mei Chen',
    status: 'Active',
  },
];

// Wide columns so the table overflows its container and scrolls horizontally.
const columns: TableColumn<Employee>[] = [
  {key: 'name', header: 'Name', width: pixel(180)},
  {key: 'email', header: 'Email', width: pixel(220)},
  {key: 'team', header: 'Team', width: pixel(180)},
  {key: 'role', header: 'Role', width: pixel(200)},
  {key: 'location', header: 'Location', width: pixel(160)},
  {key: 'startDate', header: 'Start date', width: pixel(140)},
  {key: 'manager', header: 'Manager', width: pixel(180)},
  {key: 'status', header: 'Status', width: pixel(140)},
];

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TableStickyColumns',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

const note = {
  marginBottom: 8,
  fontSize: 14,
  color: 'var(--color-text-secondary)',
} as const;

/**
 * Pin the leading `Name` column to the start edge. Scroll horizontally — the
 * name stays put and a drop shadow appears over the scrolling content.
 */
export const PinStart: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({startKeys: ['name']});
    return (
      <div style={{maxWidth: 720}}>
        <p style={note}>
          <code>startKeys: ['name']</code> — scroll right to see the Name column
          stay pinned with a drop shadow.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      </div>
    );
  },
};

/**
 * A pinned column draws each row's divider itself, so the line under it moves
 * with the column. A theme's border color (`--color-border`, set on the
 * wrapper here) and an app's own `border-bottom` on a row (the second row)
 * both carry over to the pinned cells.
 */
export const PinnedDividers: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({startKeys: ['name']});
    return (
      <div
        data-testid="pinned-dividers"
        style={
          {
            maxWidth: 720,
            '--color-border': 'rgb(37, 99, 235)',
          } as React.CSSProperties
        }>
        <style>{`[data-testid="pinned-dividers"] tbody tr:nth-child(2) { border-bottom: 2px solid rgb(220, 38, 38); }`}</style>
        <p style={note}>
          A blue theme border color on every row and an app&apos;s red 2 px
          border on the second row, both on the pinned Name column as you
          scroll.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      </div>
    );
  },
};

/**
 * A `system`-mode Theme on its own surface, with a control that switches it
 * to dark: its state lives here, so switching it re-renders only this and the
 * table, not the story that calls the table's hooks.
 */
function ThemeAroundTable({children}: {children: React.ReactNode}) {
  const [isDark, setIsDark] = useState(false);
  const [isStone, setIsStone] = useState(false);
  return (
    <Theme
      theme={isStone ? stoneTheme : neutralTheme}
      mode={isDark ? 'dark' : 'system'}>
      <div style={{backgroundColor: 'var(--color-background-surface)'}}>
        <button type="button" onClick={() => setIsDark(on => !on)}>
          Theme dark
        </button>
        <button type="button" onClick={() => setIsStone(on => !on)}>
          Theme stone
        </button>
        {children}
      </div>
    </Theme>
  );
}

/**
 * A border that changes after mount reaches the pinned cells, and the edge
 * shadows follow columns added without a resize. Hovering a row turns its
 * line purple (an app's `:hover` rule on the cells); "Highlight" sets the
 * third row's border through React state; "Thick top" gives the fourth row a
 * 3 px top border, which wins the collapse over the third row's bottom; "Row
 * borders" draws an app's 2 px blue border on the rows that turns red on
 * hover (`tr:hover`); "First row top" gives the first body row a 3 px top
 * border, which wins over the header's bottom; "Token top border" gives the
 * third row a 3 px top border in the theme's border token, which the pinned
 * cells above it carry as values and which follows a light/dark switch (the
 * table sits in a `system`-mode Theme); "Add columns" widens the table inside
 * the same wrapper.
 */
export const PinnedDividersLive: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({
      startKeys: ['name'],
      endKeys: ['status'],
    });
    const [isHighlighted, setIsHighlighted] = useState(false);
    const [hasMoreColumns, setHasMoreColumns] = useState(false);
    const [hasThickTop, setHasThickTop] = useState(false);
    const [hasRowBorders, setHasRowBorders] = useState(false);
    const [hasFirstRowTop, setHasFirstRowTop] = useState(false);
    const [hasTokenTop, setHasTokenTop] = useState(false);
    const shown = hasMoreColumns
      ? columns
      : columns.filter(column => ['name', 'status'].includes(column.key));
    return (
      <div data-testid="pinned-dividers-live" style={{maxWidth: 720}}>
        <style>{`[data-testid="pinned-dividers-live"] tbody tr:hover td { border-bottom-color: rgb(147, 51, 234); }`}</style>
        {isHighlighted && (
          <style>{`[data-testid="pinned-dividers-live"] tbody tr:nth-child(3) td { border-bottom: 2px solid rgb(22, 163, 74); }`}</style>
        )}
        {hasRowBorders && (
          <style>{`[data-testid="pinned-dividers-live"] tbody tr { border-bottom: 2px solid rgb(37, 99, 235); } [data-testid="pinned-dividers-live"] tbody tr:hover { border-bottom-color: rgb(220, 38, 38); }`}</style>
        )}
        {hasTokenTop && (
          <style>{`[data-testid="pinned-dividers-live"] tbody tr:nth-child(3) td { border-top: 3px solid var(--color-border); }`}</style>
        )}
        {hasFirstRowTop && (
          <style>{`[data-testid="pinned-dividers-live"] tbody tr:first-child td { border-top: 3px solid rgb(234, 88, 12); }`}</style>
        )}
        {hasThickTop && (
          <style>{`[data-testid="pinned-dividers-live"] tbody tr:nth-child(4) td { border-top: 3px solid rgb(234, 88, 12); }`}</style>
        )}
        <p style={note}>
          <button type="button" onClick={() => setIsHighlighted(on => !on)}>
            Highlight
          </button>{' '}
          <button type="button" onClick={() => setHasThickTop(on => !on)}>
            Thick top
          </button>{' '}
          <button type="button" onClick={() => setHasRowBorders(on => !on)}>
            Row borders
          </button>{' '}
          <button type="button" onClick={() => setHasFirstRowTop(on => !on)}>
            First row top
          </button>{' '}
          <button type="button" onClick={() => setHasTokenTop(on => !on)}>
            Token top border
          </button>{' '}
          <button type="button" onClick={() => setHasMoreColumns(on => !on)}>
            Add columns
          </button>
        </p>
        {/* The table sits in its own Theme (`system` by default, so it
            follows the operating system), switched by a control inside it, so
            the switch does not re-render the component that calls the hooks. */}
        <ThemeAroundTable>
          <Table
            data={employees}
            columns={shown}
            idKey="id"
            plugins={{stickyColumns: sticky}}
          />
        </ThemeAroundTable>
      </div>
    );
  },
};

/**
 * The table appears from state below the component that calls the hooks
 * ("Show table"), the way a tab or a disclosure shows one: the pinned cells
 * still carry the app's red 2 px border on the second row, and follow it when
 * "Recolour row" turns it green from that same component; "Border on cells"
 * moves that border from the row onto its cells.
 */
function RevealBelowOwner({children}: {children: React.ReactNode}) {
  const [isShown, setIsShown] = useState(false);
  const [isGreen, setIsGreen] = useState(false);
  const [isOnCells, setIsOnCells] = useState(false);
  return (
    <div
      data-row-color={isGreen ? 'green' : 'red'}
      data-border-on={isOnCells ? 'cells' : 'row'}>
      <button type="button" onClick={() => setIsShown(on => !on)}>
        Show table
      </button>
      <button type="button" onClick={() => setIsGreen(on => !on)}>
        Recolour row
      </button>
      <button type="button" onClick={() => setIsOnCells(on => !on)}>
        Border on cells
      </button>
      {isShown && children}
    </div>
  );
}

export const PinnedDividersRevealed: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({startKeys: ['name']});
    return (
      <div data-testid="pinned-dividers-revealed" style={{maxWidth: 720}}>
        <style>{`[data-testid="pinned-dividers-revealed"] tbody tr:nth-child(2) { border-bottom: 2px solid rgb(220, 38, 38); } [data-testid="pinned-dividers-revealed"] [data-row-color="green"] tbody tr:nth-child(2) { border-bottom-color: rgb(22, 163, 74); } [data-testid="pinned-dividers-revealed"] [data-border-on="cells"] tbody tr:nth-child(2) { border-bottom: 0; } [data-testid="pinned-dividers-revealed"] [data-border-on="cells"] tbody tr:nth-child(2) > td { border-bottom: 2px solid rgb(220, 38, 38); } [data-testid="pinned-dividers-revealed"] [data-border-on="cells"][data-row-color="green"] tbody tr:nth-child(2) > td { border-bottom-color: rgb(22, 163, 74); }`}</style>
        <RevealBelowOwner>
          <Table
            data={employees}
            columns={columns}
            idKey="id"
            plugins={{stickyColumns: sticky}}
          />
        </RevealBelowOwner>
      </div>
    );
  },
};

/**
 * Pin the trailing `Status` column to the end edge.
 */
export const PinEnd: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({endKeys: ['status']});
    return (
      <div style={{maxWidth: 720}}>
        <p style={note}>
          <code>endKeys: ['status']</code> — the Status column stays pinned to
          the right edge while the rest scrolls.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      </div>
    );
  },
};

/**
 * Pin both edges at once. `startKeys`/`endKeys` each define a contiguous run
 * from their edge inward; columns get cumulative offsets so multiple pinned
 * columns stack correctly.
 */
export const PinBothEdges: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({
      startKeys: ['name', 'email'],
      endKeys: ['status'],
    });
    return (
      <div style={{maxWidth: 720}}>
        <p style={note}>
          <code>startKeys: ['name', 'email']</code> +{' '}
          <code>endKeys: ['status']</code> — two columns pinned left with
          cumulative offsets, one pinned right.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      </div>
    );
  },
};

/**
 * Sticky columns composed with column resize. Resizing a pinned column keeps it
 * pinned; the plugin order (sticky after resize) ensures the sticky inline
 * offset wins over the resize handle's inline width.
 */
export const WithColumnResize: Story = {
  render: () => {
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
      {},
    );
    const resize = useTableColumnResize<Employee>({
      columnWidths,
      columns: columns as TableColumn<Record<string, unknown>>[],
      onColumnResizeEnd: updates =>
        setColumnWidths(prev => ({...prev, ...updates})),
    });
    const sticky = useTableStickyColumns<Employee>({startKeys: ['name']});
    return (
      <div style={{maxWidth: 720}}>
        <p style={note}>
          Resize columns by dragging header edges; the pinned Name column stays
          sticky. Plugins compose:{' '}
          <code>{'{ columnResize, stickyColumns }'}</code>.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{columnResize: resize, stickyColumns: sticky}}
        />
      </div>
    );
  },
};

/**
 * Empty config is a valid no-op — nothing is pinned, every cell passes through
 * untouched. Lets callers compute keys conditionally without branching on
 * whether to install the plugin.
 */
export const NoOpEmptyConfig: Story = {
  render: () => {
    const sticky = useTableStickyColumns<Employee>({});
    return (
      <div style={{maxWidth: 720}}>
        <p style={note}>
          <code>useTableStickyColumns({'{}'})</code> — no pinned columns; the
          table behaves as if the plugin weren't installed.
        </p>
        <Table
          data={employees}
          columns={columns}
          idKey="id"
          plugins={{stickyColumns: sticky}}
        />
      </div>
    );
  },
};
