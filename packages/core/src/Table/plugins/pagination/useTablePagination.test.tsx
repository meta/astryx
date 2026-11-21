// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTablePagination.test.tsx
 * @input useTablePagination, Table, Pagination, React testing utilities
 * @output Functional tests for the pagination plugin
 * @position Test file; validates pagination hook behavior, data slicing, plugin rendering
 */

import {describe, it, expect, vi} from 'vitest';
import {useState} from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {renderHook} from '@testing-library/react';
import {Table} from '../../Table';
import {useTablePagination} from './useTablePagination';
import {paginateData} from './paginateData';
import {useTableSelection} from '../selection/useTableSelection';
import type {TableColumn} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface TestItem extends Record<string, unknown> {
  id: string;
  name: string;
  value: number;
}

function generateItems(count: number): TestItem[] {
  return Array.from({length: count}, (_, i) => ({
    id: String(i + 1),
    name: `Item ${i + 1}`,
    value: (i + 1) * 10,
  }));
}

const columns: TableColumn<TestItem>[] = [
  {key: 'name', header: 'Name'},
  {key: 'value', header: 'Value'},
];

// =============================================================================
// Helper Components
// =============================================================================

function PaginatedTable({
  data,
  pageSize = 10,
  position,
  align,
  variant,
  size,
  label,
  pageSizeOptions,
  totalPagesProp,
  hasMore,
}: {
  data: TestItem[];
  pageSize?: number;
  position?: 'below' | 'above' | 'both' | 'none';
  align?: 'start' | 'center' | 'end';
  variant?: 'pages' | 'count' | 'compact' | 'dots' | 'none';
  size?: 'sm' | 'md';
  label?: string;
  pageSizeOptions?: number[];
  totalPagesProp?: number;
  hasMore?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);

  const plugin = useTablePagination<TestItem>({
    page,
    onPageChange: setPage,
    // Allow overriding with totalPages/hasMore for specific test scenarios
    totalItems:
      totalPagesProp == null && hasMore == null ? data.length : undefined,
    totalPages: totalPagesProp,
    hasMore,
    pageSize: currentPageSize,
    position,
    align,
    variant,
    size,
    label,
    pageSizeOptions,
    onPageSizeChange: pageSizeOptions ? setCurrentPageSize : undefined,
  });

  return (
    <Table
      data={paginateData(data, page, currentPageSize)}
      columns={columns}
      idKey="id"
      plugins={{pagination: plugin}}
    />
  );
}

// =============================================================================
// paginateData Utility Tests
// =============================================================================

describe('paginateData', () => {
  it('slices data for page 1', () => {
    const data = generateItems(30);
    const sliced = paginateData(data, 1, 10);
    expect(sliced).toHaveLength(10);
    expect(sliced[0].id).toBe('1');
    expect(sliced[9].id).toBe('10');
  });

  it('slices data for page 2', () => {
    const data = generateItems(30);
    const sliced = paginateData(data, 2, 10);
    expect(sliced).toHaveLength(10);
    expect(sliced[0].id).toBe('11');
    expect(sliced[9].id).toBe('20');
  });

  it('slices data for last page with partial data', () => {
    const data = generateItems(23);
    const sliced = paginateData(data, 3, 10);
    expect(sliced).toHaveLength(3);
    expect(sliced[0].id).toBe('21');
    expect(sliced[2].id).toBe('23');
  });

  it('returns empty array for empty data', () => {
    expect(paginateData([], 1, 10)).toEqual([]);
  });

  it('clamps invalid page numbers to the first page (#3593)', () => {
    const data = generateItems(30);
    // Negative pages previously fed a negative index to Array.slice, which
    // counts from the END of the data — the tail dressed up as a page.
    expect(paginateData(data, -1, 10)[0].id).toBe('1');
    expect(paginateData(data, 0, 10)[0].id).toBe('1');
    expect(paginateData(data, NaN, 10)[0].id).toBe('1');
    // Fractional pages floor to the containing page instead of straddling two.
    expect(paginateData(data, 1.5, 10).map(i => i.id)).toEqual(
      paginateData(data, 1, 10).map(i => i.id),
    );
  });

  it('returns empty array when page exceeds data', () => {
    const data = generateItems(10);
    expect(paginateData(data, 5, 10)).toEqual([]);
  });

  it('handles data shorter than pageSize', () => {
    const data = generateItems(3);
    expect(paginateData(data, 1, 10)).toHaveLength(3);
  });
});

// =============================================================================
// Plugin Hook Tests
// =============================================================================

describe('useTablePagination', () => {
  describe('plugin hook', () => {
    it('returns a TablePlugin with transformTableContext', () => {
      const {result} = renderHook(() =>
        useTablePagination({page: 1, onPageChange: vi.fn(), totalItems: 50}),
      );
      expect(result.current).toBeDefined();
      expect(result.current.transformTableContext).toBeTypeOf('function');
    });

    it('plugin reference is stable across renders', () => {
      const {result, rerender} = renderHook(() =>
        useTablePagination({page: 1, onPageChange: vi.fn(), totalItems: 50}),
      );
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });
  });

  // ===========================================================================
  // Plugin Behavior
  // ===========================================================================

  describe('plugin behavior', () => {
    it('transformTableContext renders Pagination below table by default', () => {
      render(<PaginatedTable data={generateItems(30)} pageSize={10} />);
      const table = screen.getByRole('table');
      const nav = screen.getByRole('navigation', {name: 'Table pagination'});
      expect(table).toBeInTheDocument();
      expect(nav).toBeInTheDocument();
      // Nav should come after the table in DOM order
      expect(
        table.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('guards pageSize 0 against Infinity page counts', () => {
      render(<PaginatedTable data={generateItems(5)} pageSize={0} />);
      expect(
        screen.getByRole('navigation', {name: 'Table pagination'}),
      ).toBeInTheDocument();
      // pageSize is coerced to 1, so 5 items produce 5 pages, not Infinity,
      // and page 1 shows the first item instead of an empty slice
      expect(
        screen.queryByRole('button', {name: 'Go to page Infinity'}),
      ).toBeNull();
      expect(
        screen.getByRole('button', {name: 'Go to page 5'}),
      ).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    it('transformTableContext renders Pagination above table', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          position="above"
        />,
      );
      const table = screen.getByRole('table');
      const nav = screen.getByRole('navigation', {name: 'Table pagination'});
      // Nav should come before the table in DOM order
      expect(
        table.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    });

    it('transformTableContext renders distinctly named Pagination above and below', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          position="both"
        />,
      );
      const table = screen.getByRole('table');
      // Each nav landmark gets a unique accessible name (axe landmark-unique)
      const topNav = screen.getByRole('navigation', {
        name: 'Table pagination (top)',
      });
      const bottomNav = screen.getByRole('navigation', {
        name: 'Table pagination (bottom)',
      });
      // Top nav comes before the table, bottom nav after it in DOM order
      expect(
        table.compareDocumentPosition(topNav) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
      expect(
        table.compareDocumentPosition(bottomNav) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('position="both" interpolates a consumer label into distinct nav names', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          position="both"
          label="Users table"
        />,
      );
      expect(
        screen.getByRole('navigation', {name: 'Users table (top)'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', {name: 'Users table (bottom)'}),
      ).toBeInTheDocument();
    });

    it('transformTableContext does not render Pagination when position is none', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          position="none"
        />,
      );
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('does not render pagination when there is only one page', () => {
      // 5 items with pageSize 10 → 1 page total
      render(<PaginatedTable data={generateItems(5)} pageSize={10} />);
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('does not render pagination when totalPages is explicitly 1', () => {
      render(
        <PaginatedTable
          data={generateItems(5)}
          pageSize={10}
          totalPagesProp={1}
        />,
      );
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('renders pagination when hasMore is true even with one page of data', () => {
      render(
        <PaginatedTable data={generateItems(5)} pageSize={10} hasMore={true} />,
      );
      expect(
        screen.getByRole('navigation', {name: 'Table pagination'}),
      ).toBeInTheDocument();
    });

    it('renders pagination wrapper with center alignment', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          align="center"
        />,
      );
      const nav = screen.getByRole('navigation', {name: 'Table pagination'});
      expect(nav.parentElement).toBeInTheDocument();
    });

    it('renders pagination wrapper with end alignment', () => {
      render(
        <PaginatedTable data={generateItems(30)} pageSize={10} align="end" />,
      );
      const nav = screen.getByRole('navigation', {name: 'Table pagination'});
      expect(nav.parentElement).toBeInTheDocument();
    });

    it('paginationProps include pageSizeOptions when provided', () => {
      render(
        <PaginatedTable
          data={generateItems(50)}
          pageSize={10}
          pageSizeOptions={[10, 25, 50]}
        />,
      );
      expect(
        screen.getByRole('combobox', {name: 'Items per page'}),
      ).toBeInTheDocument();
    });

    it('paginationProps exclude pageSizeOptions when not provided', () => {
      render(<PaginatedTable data={generateItems(50)} pageSize={10} />);
      expect(
        screen.queryByRole('combobox', {name: 'Items per page'}),
      ).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Integration with Table
  // ===========================================================================

  describe('integration with Table', () => {
    it('renders table with paginated data', () => {
      render(<PaginatedTable data={generateItems(25)} pageSize={10} />);
      const rows = screen.getAllByRole('row');
      // 1 header row + 10 data rows
      expect(rows).toHaveLength(11);
    });

    it('page change re-renders table with new data', async () => {
      const user = userEvent.setup();
      render(<PaginatedTable data={generateItems(25)} pageSize={10} />);

      // Initially on page 1 — should show Item 1..10
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 10')).toBeInTheDocument();

      // Click page 2
      const page2Button = screen.getByRole('button', {
        name: 'Go to page 2',
      });
      await user.click(page2Button);

      // Now should show Item 11..20
      expect(screen.getByText('Item 11')).toBeInTheDocument();
      expect(screen.getByText('Item 20')).toBeInTheDocument();
      expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
    });

    it('empty data renders pagination as null', () => {
      render(<PaginatedTable data={[]} pageSize={10} />);
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('works alongside selection plugin', () => {
      function DualPluginTable() {
        const [page, setPage] = useState(1);
        const data = generateItems(20);
        const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

        const plugin = useTablePagination<TestItem>({
          page,
          onPageChange: setPage,
          totalItems: data.length,
          pageSize: 10,
        });

        const selection = useTableSelection<TestItem>({
          getIsItemSelected: item => selectedIds.has(item.id),
          onSelectItem: ({item, isSelected}) => {
            const next = new Set(selectedIds);
            if (isSelected) {
              next.add(item.id);
            } else {
              next.delete(item.id);
            }
            setSelectedIds(next);
          },
          onSelectAll: ({isAllSelected}) => {
            const pageData = paginateData(data, page, 10);
            setSelectedIds(
              isAllSelected ? new Set(pageData.map(d => d.id)) : new Set(),
            );
          },
          getIsAllSelected: () => {
            const pageData = paginateData(data, page, 10);
            return (
              pageData.length > 0 && pageData.every(d => selectedIds.has(d.id))
            );
          },
        });

        return (
          <Table
            data={paginateData(data, page, 10)}
            columns={columns}
            idKey="id"
            plugins={{selection, pagination: plugin}}
          />
        );
      }

      render(<DualPluginTable />);
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', {name: 'Table pagination'}),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Select all rows')).toBeInTheDocument();
    });

    it('plugin order does not break rendering', () => {
      function ReversedPluginTable() {
        const [page, setPage] = useState(1);
        const data = generateItems(20);

        const plugin = useTablePagination<TestItem>({
          page,
          onPageChange: setPage,
          totalItems: data.length,
          pageSize: 10,
        });

        const selection = useTableSelection<TestItem>({
          getIsItemSelected: () => false,
          onSelectItem: vi.fn(),
          onSelectAll: vi.fn(),
          getIsAllSelected: () => false,
        });

        return (
          <Table
            data={paginateData(data, page, 10)}
            columns={columns}
            idKey="id"
            plugins={{pagination: plugin, selection}}
          />
        );
      }

      render(<ReversedPluginTable />);
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', {name: 'Table pagination'}),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Props Passthrough to Pagination
  // ===========================================================================

  describe('props passthrough', () => {
    it('passes variant prop', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          variant="compact"
        />,
      );
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    it('passes size prop', () => {
      render(
        <PaginatedTable data={generateItems(30)} pageSize={10} size="sm" />,
      );
      const nav = screen.getByRole('navigation', {name: 'Table pagination'});
      expect(nav).toBeInTheDocument();
    });

    it('passes label prop', () => {
      render(
        <PaginatedTable
          data={generateItems(30)}
          pageSize={10}
          label="Custom navigation"
        />,
      );
      expect(
        screen.getByRole('navigation', {name: 'Custom navigation'}),
      ).toBeInTheDocument();
    });

    it('passes hasMore for cursor-based pagination', () => {
      function CursorTable() {
        const [page, setPage] = useState(1);
        const plugin = useTablePagination<TestItem>({
          page,
          onPageChange: setPage,
          hasMore: true,
          pageSize: 10,
        });
        return (
          <Table
            data={generateItems(10)}
            columns={columns}
            idKey="id"
            plugins={{pagination: plugin}}
          />
        );
      }
      render(<CursorTable />);
      const nextButton = screen.getByRole('button', {
        name: 'Go to next page',
      });
      expect(nextButton).not.toHaveAttribute('aria-disabled');
    });

    it('passes onPageSizeChange and pageSizeOptions', () => {
      render(
        <PaginatedTable
          data={generateItems(50)}
          pageSize={10}
          pageSizeOptions={[10, 25, 50]}
        />,
      );

      // Verify the page size selector is rendered with current value
      const selector = screen.getByRole('combobox', {name: 'Items per page'});
      expect(selector).toBeInTheDocument();
      expect(selector).toHaveTextContent('10');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles totalItems=0 \u2014 pagination is hidden', () => {
      render(<PaginatedTable data={[]} pageSize={10} />);
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('handles totalPages=1 — pagination is hidden', () => {
      // When there is only one page, the plugin should not render pagination at all.
      render(<PaginatedTable data={generateItems(5)} pageSize={10} />);
      expect(
        screen.queryByRole('navigation', {name: 'Table pagination'}),
      ).not.toBeInTheDocument();
    });

    it('handles page=1 with no totalItems or totalPages (cursor mode)', () => {
      function CursorTable() {
        const plugin = useTablePagination<TestItem>({
          page: 1,
          onPageChange: vi.fn(),
          hasMore: false,
        });
        return (
          <Table
            data={generateItems(5)}
            columns={columns}
            idKey="id"
            plugins={{pagination: plugin}}
          />
        );
      }
      render(<CursorTable />);
      const prevButton = screen.getByRole('button', {
        name: 'Go to previous page',
      });
      const nextButton = screen.getByRole('button', {
        name: 'Go to next page',
      });
      expect(prevButton).toHaveAttribute('aria-disabled', 'true');
      expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('handles rapid page changes', async () => {
      const user = userEvent.setup();
      render(<PaginatedTable data={generateItems(50)} pageSize={10} />);

      const page2 = screen.getByRole('button', {name: 'Go to page 2'});
      await user.click(page2);

      const page3 = screen.getByRole('button', {name: 'Go to page 3'});
      await user.click(page3);

      // Should be on page 3 showing Item 21..30
      expect(screen.getByText('Item 21')).toBeInTheDocument();
      expect(screen.getByText('Item 30')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('accessibility', () => {
    it('pagination nav has correct aria-label', () => {
      render(<PaginatedTable data={generateItems(30)} pageSize={10} />);
      expect(
        screen.getByRole('navigation', {name: 'Table pagination'}),
      ).toBeInTheDocument();
    });

    it('page buttons have aria-label "Go to page N"', () => {
      render(<PaginatedTable data={generateItems(30)} pageSize={10} />);
      expect(
        screen.getByRole('button', {name: 'Go to page 1'}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Go to page 2'}),
      ).toBeInTheDocument();
    });

    it('current page has aria-current="page"', () => {
      render(<PaginatedTable data={generateItems(30)} pageSize={10} />);
      const page1Button = screen.getByRole('button', {name: 'Go to page 1'});
      expect(page1Button).toHaveAttribute('aria-current', 'page');
    });

    it('disabled prev/next buttons have aria-disabled', () => {
      // Use multi-page data so pagination is rendered; on page 1, prev is disabled.
      render(<PaginatedTable data={generateItems(30)} pageSize={10} />);
      const prevButton = screen.getByRole('button', {
        name: 'Go to previous page',
      });
      expect(prevButton).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
