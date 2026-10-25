// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableSortable.test.tsx
 * @input Uses vitest, @testing-library/react, Table components
 * @output Unit tests for useTableSortable plugin
 * @position Testing; validates sortable plugin implementation
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {Table} from '../../Table';
import {InternationalizationProvider} from '../../../i18n';
import type {TableColumn} from '../../types';
import {useTableSortable, type TableSortState} from './useTableSortable';

// =============================================================================
// Test Data
// =============================================================================

interface User extends Record<string, unknown> {
  name: string;
  age: number;
  email: string;
}

const users: User[] = [
  {name: 'Alice', age: 30, email: 'alice@example.com'},
  {name: 'Bob', age: 25, email: 'bob@example.com'},
];

const sortableColumns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', sortable: true},
  {key: 'age', header: 'Age', sortable: true},
  {key: 'email', header: 'Email'},
];

// =============================================================================
// Test Helpers
// =============================================================================

const EMPTY_SORT: TableSortState = [];

function SortableTable({
  columns = sortableColumns,
  data = users,
  initialSort = EMPTY_SORT,
  allowUnsortedState = false,
  isMultiSortEnabled = false,
  onSortChange: externalOnSortChange,
}: {
  columns?: TableColumn<User>[];
  data?: User[];
  initialSort?: TableSortState;
  allowUnsortedState?: boolean;
  isMultiSortEnabled?: boolean;
  onSortChange?: (sort: TableSortState) => void;
}) {
  const [sort, setSort] = useState<TableSortState>(initialSort);
  const handleSortChange = (newSort: TableSortState) => {
    setSort(newSort);
    externalOnSortChange?.(newSort);
  };

  const sortPlugin = useTableSortable<User>({
    sort,
    onSortChange: handleSortChange,
    allowUnsortedState,
    isMultiSortEnabled,
  });

  return <Table data={data} columns={columns} plugins={{sort: sortPlugin}} />;
}

// =============================================================================
// Rendering Tests
// =============================================================================

describe('useTableSortable', () => {
  describe('rendering', () => {
    it('renders sort icon for sortable columns', () => {
      render(<SortableTable />);

      // Sortable columns should have sort buttons
      expect(
        screen.getByRole('button', {name: /sort by name/i}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: /sort by age/i}),
      ).toBeInTheDocument();

      // Non-sortable column should not have a sort button
      expect(
        screen.queryByRole('button', {name: /sort by email/i}),
      ).not.toBeInTheDocument();
    });

    it('renders ascending icon when sort state is ascending', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button).toBeInTheDocument();
      expect(button.getAttribute('aria-label')).toContain('sorted ascending');
    });

    it('renders descending icon when sort state is descending', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'descending'}]}
        />,
      );

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button.getAttribute('aria-label')).toContain('sorted descending');
    });

    it('renders unsorted icon when column is sortable but not in sort state', () => {
      render(<SortableTable />);

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button.getAttribute('aria-label')).toBe('Sort by Name');
    });

    it('renders no sort UI for columns without sortable config', () => {
      render(<SortableTable />);

      // Email column is not sortable
      expect(
        screen.queryByRole('button', {name: /sort by email/i}),
      ).not.toBeInTheDocument();
    });

    it('renders sort button wrapping header content', () => {
      render(<SortableTable />);

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');
      expect(button.textContent).toContain('Name');
    });

    it('renders rank badge in multi-sort mode', () => {
      render(
        <SortableTable
          isMultiSortEnabled
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
        />,
      );

      const nameButton = screen.getByRole('button', {name: /sort by name/i});
      const ageButton = screen.getByRole('button', {name: /sort by age/i});

      // Rank badges should be present
      expect(nameButton.textContent).toContain('1');
      expect(ageButton.textContent).toContain('2');
    });

    it('does not render rank badge in single-sort mode', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const nameButton = screen.getByRole('button', {name: /sort by name/i});
      // Should not contain a rank badge — just "Name" text + icon
      expect(nameButton.getAttribute('aria-label')).toBe(
        'Sort by Name, sorted ascending',
      );
    });

    it('renders sort indicators when data is empty', () => {
      render(<SortableTable data={[]} />);

      expect(
        screen.getByRole('button', {name: /sort by name/i}),
      ).toBeInTheDocument();
    });

    it('uses custom sortKey from column config', () => {
      const columns: TableColumn<User>[] = [
        {key: 'name', header: 'Full Name', sortable: {sortKey: 'lastName'}},
      ];

      render(
        <SortableTable
          columns={columns}
          initialSort={[{sortKey: 'lastName', direction: 'ascending'}]}
        />,
      );

      const button = screen.getByRole('button', {
        name: /sort by full name/i,
      });
      expect(button.getAttribute('aria-label')).toContain('sorted ascending');
    });

    it('uses column key as default sortKey', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button.getAttribute('aria-label')).toContain('sorted ascending');
    });
  });

  // =============================================================================
  // Interaction Tests
  // =============================================================================

  describe('interactions', () => {
    it('clicking unsorted column calls onSortChange with ascending', async () => {
      const onSortChange = vi.fn();
      render(<SortableTable onSortChange={onSortChange} />);

      await userEvent.click(
        screen.getByRole('button', {name: /sort by name/i}),
      );

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });

    it('clicking ascending column toggles to descending', async () => {
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
          onSortChange={onSortChange}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', {name: /sort by name/i}),
      );

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'descending'},
      ]);
    });

    it('clicking descending column toggles to ascending (allowUnsortedState=false)', async () => {
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'descending'}]}
          onSortChange={onSortChange}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', {name: /sort by name/i}),
      );

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });

    it('clicking descending column clears sort (allowUnsortedState=true)', async () => {
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'descending'}]}
          allowUnsortedState
          onSortChange={onSortChange}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', {name: /sort by name/i}),
      );

      expect(onSortChange).toHaveBeenCalledWith([]);
    });

    it('clicking different column replaces sort in single-sort mode', async () => {
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
          onSortChange={onSortChange}
        />,
      );

      await userEvent.click(screen.getByRole('button', {name: /sort by age/i}));

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'age', direction: 'ascending'},
      ]);
    });

    it('shift+click adds column to multi-sort', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
          isMultiSortEnabled
          onSortChange={onSortChange}
        />,
      );

      await user.keyboard('{Shift>}');
      await user.click(screen.getByRole('button', {name: /sort by age/i}));
      await user.keyboard('{/Shift}');

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
        {sortKey: 'age', direction: 'ascending'},
      ]);
    });

    it('shift+click toggles existing column in multi-sort', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'ascending'},
          ]}
          isMultiSortEnabled
          onSortChange={onSortChange}
        />,
      );

      await user.keyboard('{Shift>}');
      await user.click(screen.getByRole('button', {name: /sort by age/i}));
      await user.keyboard('{/Shift}');

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
        {sortKey: 'age', direction: 'descending'},
      ]);
    });

    it('shift+click removes descending column in multi-sort (allowUnsortedState=true)', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
          isMultiSortEnabled
          allowUnsortedState
          onSortChange={onSortChange}
        />,
      );

      await user.keyboard('{Shift>}');
      await user.click(screen.getByRole('button', {name: /sort by age/i}));
      await user.keyboard('{/Shift}');

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });

    it('regular click in multi-sort mode replaces entire sort', async () => {
      const onSortChange = vi.fn();
      render(
        <SortableTable
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
          isMultiSortEnabled
          onSortChange={onSortChange}
        />,
      );

      await userEvent.click(screen.getByRole('button', {name: /sort by age/i}));

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'age', direction: 'ascending'},
      ]);
    });

    it('clicking non-sortable column header does nothing', () => {
      const onSortChange = vi.fn();
      render(<SortableTable onSortChange={onSortChange} />);

      // Email column header text should exist but not as a button
      expect(
        screen.queryByRole('button', {name: /sort by email/i}),
      ).not.toBeInTheDocument();
      expect(onSortChange).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Accessibility Tests
  // =============================================================================

  describe('accessibility', () => {
    it('sets aria-sort="ascending" on sorted ascending th', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const headers = screen.getAllByRole('columnheader');
      const nameHeader = headers.find(h => h.textContent?.includes('Name'));
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('does not set aria-sort on unsorted columns', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const headers = screen.getAllByRole('columnheader');
      const ageHeader = headers.find(h => h.textContent?.includes('Age'));
      expect(ageHeader).not.toHaveAttribute('aria-sort');
    });

    it('does not set aria-sort on non-sortable columns', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      const headers = screen.getAllByRole('columnheader');
      const emailHeader = headers.find(h => h.textContent?.includes('Email'));
      expect(emailHeader).not.toHaveAttribute('aria-sort');
    });

    it('sort button has accessible aria-label', () => {
      render(
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'Sort by Name, sorted ascending',
        }),
      ).toBeInTheDocument();
    });

    it('sort button is keyboard accessible (Enter)', async () => {
      const onSortChange = vi.fn();
      render(<SortableTable onSortChange={onSortChange} />);

      const button = screen.getByRole('button', {name: /sort by name/i});
      button.focus();
      await userEvent.keyboard('{Enter}');

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });

    it('sort button is keyboard accessible (Space)', async () => {
      const onSortChange = vi.fn();
      render(<SortableTable onSortChange={onSortChange} />);

      const button = screen.getByRole('button', {name: /sort by name/i});
      button.focus();
      await userEvent.keyboard(' ');

      expect(onSortChange).toHaveBeenCalledWith([
        {sortKey: 'name', direction: 'ascending'},
      ]);
    });

    it('multi-sort aria-label includes priority', () => {
      render(
        <SortableTable
          isMultiSortEnabled
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'Sort by Name, sorted ascending, priority 1 of 2',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Sort by Age, sorted descending, priority 2 of 2',
        }),
      ).toBeInTheDocument();
    });
  });

  // =============================================================================
  // Edge Case Tests
  // =============================================================================

  describe('edge cases', () => {
    it('handles sort state with key not matching any column', () => {
      expect(() =>
        render(
          <SortableTable
            initialSort={[{sortKey: 'nonexistent', direction: 'ascending'}]}
          />,
        ),
      ).not.toThrow();
    });

    it('handles empty sort array', () => {
      render(<SortableTable initialSort={[]} />);

      // All sortable columns should show unsorted state
      const nameButton = screen.getByRole('button', {name: 'Sort by Name'});
      const ageButton = screen.getByRole('button', {name: 'Sort by Age'});
      expect(nameButton).toBeInTheDocument();
      expect(ageButton).toBeInTheDocument();
    });

    it('plugin object is referentially stable across renders', () => {
      const plugins: ReturnType<typeof useTableSortable<User>>[] = [];

      function Capture() {
        const plugin = useTableSortable<User>({
          sort: [],
          onSortChange: () => {},
        });
        plugins.push(plugin);
        return null;
      }

      const {rerender} = render(<Capture />);
      rerender(<Capture />);

      expect(plugins[0]).toBe(plugins[1]);
    });

    it('works with no sortable columns', () => {
      const columns: TableColumn<User>[] = [
        {key: 'name', header: 'Name'},
        {key: 'age', header: 'Age'},
      ];

      expect(() => render(<SortableTable columns={columns} />)).not.toThrow();

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('works with ReactNode header content', () => {
      const columns: TableColumn<User>[] = [
        {
          key: 'name',
          header: <span data-testid="custom-header">Custom Name</span>,
          sortable: true,
        },
      ];

      render(<SortableTable columns={columns} />);

      const button = screen.getByRole('button', {name: /sort by name/i});
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    });

    it('sort state with multiple entries but isMultiSortEnabled=false', () => {
      // State is source of truth — renders all entries even in single-sort mode
      // but click behavior is single-sort
      render(
        <SortableTable
          isMultiSortEnabled={false}
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
        />,
      );

      // Both columns should show their sort state
      const nameButton = screen.getByRole('button', {name: /sort by name/i});
      const ageButton = screen.getByRole('button', {name: /sort by age/i});
      expect(nameButton.getAttribute('aria-label')).toContain(
        'sorted ascending',
      );
      expect(ageButton.getAttribute('aria-label')).toContain(
        'sorted descending',
      );
    });
  });
});

// =============================================================================
// Context-menu actions (colocated with the sortable plugin)
// =============================================================================

describe('useTableSortable — context menu actions', () => {
  // jsdom doesn't implement the Popover API; mock it so the menu can "open"
  // and its items become queryable (as hidden).
  beforeEach(() => {
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('popover-open', '');
      const event = new Event('toggle', {bubbles: false});
      Object.defineProperty(event, 'newState', {value: 'open'});
      this.dispatchEvent(event);
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('popover-open');
      const event = new Event('toggle', {bubbles: false});
      Object.defineProperty(event, 'newState', {value: 'closed'});
      this.dispatchEvent(event);
    });
    const originalMatches = HTMLElement.prototype.matches;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).matches = function (
      selector: string,
    ): boolean {
      if (selector === ':popover-open') {
        return this.hasAttribute('popover-open');
      }
      return originalMatches.call(this, selector);
    };
  });

  it('offers Sort ascending/descending on a sortable header, and Clear sort once sorted', () => {
    render(<SortableTable allowUnsortedState />);

    // Unsorted: asc + desc, no "Clear sort".
    fireEvent.contextMenu(screen.getByText('Name'));
    expect(
      screen.getAllByRole('menuitem', {name: 'Sort ascending', hidden: true})
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('menuitem', {name: 'Sort descending', hidden: true})
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('menuitem', {name: 'Clear sort', hidden: true}),
    ).not.toBeInTheDocument();

    // Apply ascending → "Clear sort" now appears.
    fireEvent.click(
      screen.getAllByRole('menuitem', {
        name: 'Sort ascending',
        hidden: true,
      })[0],
    );
    fireEvent.contextMenu(screen.getByText('Name'));
    expect(
      screen.getAllByRole('menuitem', {name: 'Clear sort', hidden: true})
        .length,
    ).toBeGreaterThan(0);
  });

  it('resolves fresh actions on each open as sort state changes (lazy getter)', () => {
    const onSortChange = vi.fn();
    render(<SortableTable allowUnsortedState onSortChange={onSortChange} />);

    // Open (unsorted) and pick descending.
    fireEvent.contextMenu(screen.getByText('Name'));
    fireEvent.click(
      screen.getAllByRole('menuitem', {
        name: 'Sort descending',
        hidden: true,
      })[0],
    );
    expect(onSortChange).toHaveBeenLastCalledWith([
      {sortKey: 'name', direction: 'descending'},
    ]);

    // Re-open: the getter recomputes against the now-descending state, so
    // "Clear sort" is present and clicking it clears — proving the actions are
    // freshly derived on each open, not memoized from the first render.
    fireEvent.contextMenu(screen.getByText('Name'));
    const clear = screen.getAllByRole('menuitem', {
      name: 'Clear sort',
      hidden: true,
    });
    expect(clear.length).toBeGreaterThan(0);
    fireEvent.click(clear[0]);
    expect(onSortChange).toHaveBeenLastCalledWith([]);
  });
});

// =============================================================================
// i18n (header-button aria-labels route through the catalog)
// =============================================================================

describe('useTableSortable — i18n', () => {
  it('localizes the unsorted sort-by aria-label via @astryx.table.sort.sortBy', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {'@astryx.table.sort.sortBy': 'Trier par {label}'},
        }}>
        <SortableTable />
      </InternationalizationProvider>,
    );

    expect(
      screen.getByRole('button', {name: 'Trier par Name'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Trier par Age'}),
    ).toBeInTheDocument();
  });

  it('localizes the multi-sort priority aria-label with ICU number args', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.table.sort.sortedByWithPriority':
              'Trier par {label}, tri {direction}, priorité {rank, number} sur {total, number}',
            '@astryx.table.sort.direction.ascending': 'croissant',
            '@astryx.table.sort.direction.descending': 'décroissant',
          },
        }}>
        <SortableTable
          isMultiSortEnabled
          initialSort={[
            {sortKey: 'name', direction: 'ascending'},
            {sortKey: 'age', direction: 'descending'},
          ]}
        />
      </InternationalizationProvider>,
    );

    // The overridden direction words deliberately differ from the raw enum
    // values ('ascending'/'descending'), so an implementation interpolating
    // the enum without translating it cannot pass — for either direction.
    expect(
      screen.getByRole('button', {
        name: 'Trier par Name, tri croissant, priorité 1 sur 2',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Trier par Age, tri décroissant, priorité 2 sur 2',
      }),
    ).toBeInTheDocument();
  });

  it('localizes the sorted aria-label and direction word via their own keys', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.table.sort.sortedBy': 'Trié par {label}, {direction}',
            '@astryx.table.sort.direction.ascending': 'croissant',
          },
        }}>
        <SortableTable
          initialSort={[{sortKey: 'name', direction: 'ascending'}]}
        />
      </InternationalizationProvider>,
    );

    // Both the composed template and the direction word resolve through
    // their own catalog keys; 'croissant' differs from the raw enum value,
    // so neither a hardcoded English frame nor raw-enum interpolation passes.
    expect(
      screen.getByRole('button', {name: 'Trié par Name, croissant'}),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// Header Alignment
// =============================================================================

describe('useTableSortable — header alignment', () => {
  // A column's `align` lands as `textAlign` on the <th>, which cannot position
  // the contents of the full-width flex button the plugin renders inside it.
  // The plugin has to mirror the alignment onto the button's main axis, or a
  // numeric column gets a left-hugging header over right-aligned figures.
  const buttonFor = (name: RegExp) => screen.getByRole('button', {name});

  it('gives an end-aligned column a different button style than a default one', () => {
    render(
      <SortableTable
        columns={[
          {key: 'name', header: 'Name', sortable: true},
          {key: 'age', header: 'Age', sortable: true, align: 'end'},
        ]}
      />,
    );

    expect(buttonFor(/sort by age/i).className).not.toBe(
      buttonFor(/sort by name/i).className,
    );
  });

  it('gives a center-aligned column a different button style than a default one', () => {
    render(
      <SortableTable
        columns={[
          {key: 'name', header: 'Name', sortable: true},
          {key: 'age', header: 'Age', sortable: true, align: 'center'},
        ]}
      />,
    );

    expect(buttonFor(/sort by age/i).className).not.toBe(
      buttonFor(/sort by name/i).className,
    );
  });

  it('distinguishes end from center', () => {
    render(
      <SortableTable
        columns={[
          {key: 'name', header: 'Name', sortable: true, align: 'end'},
          {key: 'age', header: 'Age', sortable: true, align: 'center'},
        ]}
      />,
    );

    expect(buttonFor(/sort by name/i).className).not.toBe(
      buttonFor(/sort by age/i).className,
    );
  });

  it('leaves a start-aligned column styled like an unaligned one', () => {
    render(
      <SortableTable
        columns={[
          {key: 'name', header: 'Name', sortable: true},
          {key: 'age', header: 'Age', sortable: true, align: 'start'},
        ]}
      />,
    );

    expect(buttonFor(/sort by age/i).className).toBe(
      buttonFor(/sort by name/i).className,
    );
  });
});
