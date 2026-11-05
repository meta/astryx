// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Table.test.tsx
 * @input Uses vitest, @testing-library/react, Table components
 * @output Unit tests for BaseTable and Table
 * @position Testing; validates Table implementation
 *
 * SYNC: When BaseTable.tsx or Table.tsx change, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {BaseTable} from './BaseTable';
import {Table} from './Table';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import {TableHeader} from './TableHeader';
import {TableBody} from './TableBody';
import {TableFooter} from './TableFooter';
import {
  proportional,
  pixel,
  generateColumns,
  resolveColumnWidths,
  resolveTableMinWidth,
  capitalize,
  DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
} from './columnUtils';
import type {TablePlugin, TableColumn, ProportionalWidth} from './types';

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
  {name: 'Charlie', age: 35, email: 'charlie@example.com'},
];

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name'},
  {key: 'age', header: 'Age', width: pixel(80)},
  {key: 'email', header: 'Email', width: proportional(2)},
];

// =============================================================================
// columnUtils Tests
// =============================================================================

describe('columnUtils', () => {
  describe('proportional', () => {
    it('creates a proportional width with default value 1 and default minWidth', () => {
      const w = proportional();
      expect(w).toEqual({
        type: 'proportional',
        value: 1,
        minWidth: DEFAULT_MIN_COLUMN_WIDTH,
      });
    });

    it('creates a proportional width with custom value and default minWidth', () => {
      const w = proportional(3);
      expect(w).toEqual({
        type: 'proportional',
        value: 3,
        minWidth: DEFAULT_MIN_COLUMN_WIDTH,
      });
    });
  });

  describe('pixel', () => {
    it('creates a pixel width', () => {
      const w = pixel(200);
      expect(w).toEqual({type: 'pixel', value: 200});
    });
  });

  describe('capitalize', () => {
    it('capitalizes first letter', () => {
      expect(capitalize('name')).toBe('Name');
    });

    it('handles empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('handles single character', () => {
      expect(capitalize('a')).toBe('A');
    });

    it('uppercases an astral-plane letter without splitting it (#4759)', () => {
      // Deseret 𐐨 (U+10428) uppercases to 𐐀 (U+10400); charAt(0) would grab
      // half the surrogate pair and leave the string unchanged.
      expect(capitalize('\u{10428}pple')).toBe('\u{10400}pple');
    });
  });

  describe('generateColumns', () => {
    it('generates columns from data keys', () => {
      const cols = generateColumns(users);
      expect(cols).toHaveLength(3);
      expect(cols[0].key).toBe('name');
      expect(cols[0].header).toBe('Name');
      expect(cols[1].key).toBe('age');
      expect(cols[1].header).toBe('Age');
      expect(cols[2].key).toBe('email');
      expect(cols[2].header).toBe('Email');
    });

    it('returns empty array for empty data', () => {
      expect(generateColumns([])).toEqual([]);
    });

    it('assigns content-proportional widths based on data analysis', () => {
      const cols = generateColumns(users);
      // All columns should have proportional type
      for (const col of cols) {
        expect(col.width?.type).toBe('proportional');
      }
      // Columns with longer content should get higher proportion
      const emailCol = cols.find(c => c.key === 'email')!;
      const ageCol = cols.find(c => c.key === 'age')!;
      expect(emailCol.width!.value).toBeGreaterThan(ageCol.width!.value);
    });

    it('derives min-width from header or longest word', () => {
      const cols = generateColumns(users);
      for (const col of cols) {
        // Min-width should be at least the floor
        expect(
          (col.width as ProportionalWidth).minWidth,
        ).toBeGreaterThanOrEqual(60);
      }
    });

    it('produces stable width values for known data', () => {
      const cols = generateColumns(users);
      // Snapshot: these values should remain stable over time.
      // name: "Charlie" (7 chars) → medium → proportion 2
      // age: "35" (2 chars) → short → proportion 1
      // email: "charlie@example.com" (19 chars) → long → proportion 3
      const nameCol = cols.find(c => c.key === 'name')!;
      const ageCol = cols.find(c => c.key === 'age')!;
      const emailCol = cols.find(c => c.key === 'email')!;

      expect(nameCol.width).toEqual({
        type: 'proportional',
        value: 2,
        minWidth: 60, // max("Name"=4, "Charlie"=7) * 8 = 56 → floor 60
      });
      expect(ageCol.width).toEqual({
        type: 'proportional',
        value: 1,
        minWidth: 60, // max("Age"=3, "35"=2) * 8 = 24 → floor 60
      });
      expect(emailCol.width).toEqual({
        type: 'proportional',
        value: 3,
        minWidth: 152, // max("Email"=5, "charlie@example.com"=19) * 8 = 152
      });
    });

    it('does not analyze non-string/number values', () => {
      const data = [
        {id: 1, meta: {nested: 'object'}, tags: ['a', 'b']},
        {id: 2, meta: {nested: 'thing'}, tags: ['c']},
      ];
      const cols = generateColumns(data);
      // meta and tags are objects/arrays — should get 0 content length
      // so their proportion comes only from header length
      const metaCol = cols.find(c => c.key === 'meta')!;
      const tagsCol = cols.find(c => c.key === 'tags')!;
      // Header "Meta" = 4, "Tags" = 4 — both should have same proportion
      expect((metaCol.width as ProportionalWidth).value).toBe(
        (tagsCol.width as ProportionalWidth).value,
      );
    });

    it('never overrides explicit column widths', () => {
      // generateColumns is only called when no columns prop is provided.
      // This test verifies the contract: explicit widths pass through unchanged.
      const explicit: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: pixel(200)},
        {
          key: 'email',
          header: 'Email',
          width: proportional(3, {minWidth: 300}),
        },
      ];
      // resolveColumnWidths should use the explicit values, not re-derive
      const resolved = resolveColumnWidths(explicit);
      expect(resolved.columns.get('name')?.style.width).toBe('200px');
      expect(resolved.columns.get('email')?.style.minWidth).toBe('300px');
    });
  });

  describe('proportional with minWidth', () => {
    it('creates a proportional width with explicit minWidth', () => {
      const w = proportional(1, {minWidth: 200});
      expect(w).toEqual({type: 'proportional', value: 1, minWidth: 200});
    });

    it('uses DEFAULT_MIN_COLUMN_WIDTH when no minWidth provided', () => {
      const w = proportional(2);
      expect(w).toEqual({
        type: 'proportional',
        value: 2,
        minWidth: DEFAULT_MIN_COLUMN_WIDTH,
      });
      expect(w.minWidth).toBe(DEFAULT_MIN_COLUMN_WIDTH);
    });
  });
});

// =============================================================================
// BaseTable Tests
// =============================================================================

describe('BaseTable', () => {
  it('renders a table element', () => {
    render(<BaseTable data={users} columns={columns} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders column headers as th elements', () => {
    render(<BaseTable data={users} columns={columns} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent('Name');
    expect(headers[1]).toHaveTextContent('Age');
    expect(headers[2]).toHaveTextContent('Email');
  });

  it('renders every column header with scope="col"', () => {
    render(<BaseTable data={users} columns={columns} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
    }
  });

  it('lets a consumer override scope via header html props', () => {
    // A `<th scope="row">` maps to the `rowheader` role, so query the DOM
    // directly to assert the attribute regardless of the resolved ARIA role.
    const plugin: TablePlugin<User> = {
      transformHeaderCell: (props, column) =>
        column.key === 'name'
          ? {...props, htmlProps: {...props.htmlProps, scope: 'row'}}
          : props,
    };
    const {container} = render(
      <BaseTable data={users} columns={columns} plugins={[plugin]} />,
    );
    const headerCells = container.querySelectorAll('thead th');
    // columns fixture order: name, age, email — plugin overrides name → 'row'
    expect(headerCells[0]).toHaveAttribute('scope', 'row');
    expect(headerCells[1]).toHaveAttribute('scope', 'col');
    expect(headerCells[2]).toHaveAttribute('scope', 'col');
  });

  it('renders data cells', () => {
    render(<BaseTable data={users} columns={columns} />);
    const cells = screen.getAllByRole('cell');
    // 3 rows * 3 columns = 9 cells
    expect(cells).toHaveLength(9);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders correct number of rows', () => {
    render(<BaseTable data={users} columns={columns} />);
    // 1 header row + 3 data rows
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('does not apply hover styling to the header row when hasHover is set', () => {
    // Use the public Table (provides TableContext); BaseTable alone has no
    // context, so rows wouldn't pick up hover styling at all.
    const {container} = render(
      <Table data={users} columns={columns} hasHover />,
    );
    const headerRow = container.querySelector('thead tr');
    const bodyRow = container.querySelector('tbody tr');
    expect(headerRow).not.toBeNull();
    expect(bodyRow).not.toBeNull();

    const headerClasses = new Set(
      (headerRow?.className ?? '').split(/\s+/).filter(Boolean),
    );
    // The body row carries hover-styling class(es) that the header row does not.
    const bodyOnlyClasses = (bodyRow?.className ?? '')
      .split(/\s+/)
      .filter(c => c && !headerClasses.has(c));
    expect(bodyOnlyClasses.length).toBeGreaterThan(0);
  });

  it('auto-generates columns from data keys when columns omitted', () => {
    render(<BaseTable data={users} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent('Name');
    expect(headers[1]).toHaveTextContent('Age');
    expect(headers[2]).toHaveTextContent('Email');
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('uses raw key as header when header prop is not provided', () => {
    const cols: TableColumn<User>[] = [{key: 'name'}];
    render(<BaseTable data={users} columns={cols} />);
    expect(screen.getByRole('columnheader')).toHaveTextContent('name');
  });

  it('renders custom header as ReactNode', () => {
    const cols: TableColumn<User>[] = [
      {key: 'name', header: <span data-testid="custom-header">Full Name</span>},
    ];
    render(<BaseTable data={users} columns={cols} />);
    expect(screen.getByTestId('custom-header')).toHaveTextContent('Full Name');
  });

  it('uses idKey string to key rows', () => {
    render(<BaseTable data={users} columns={columns} idKey="email" />);
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('uses idKey function to key rows', () => {
    render(
      <BaseTable data={users} columns={columns} idKey={item => item.email} />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('renders custom cell renderer', () => {
    const customColumns: TableColumn<User>[] = [
      {
        key: 'name',
        header: 'Name',
        renderCell: (item: User) => (
          <strong data-testid="bold-name">{item.name}</strong>
        ),
      },
    ];
    render(<BaseTable data={users} columns={customColumns} />);
    const boldNames = screen.getAllByTestId('bold-name');
    expect(boldNames).toHaveLength(3);
    expect(boldNames[0]).toHaveTextContent('Alice');
  });

  it('renders null/undefined values as empty string', () => {
    const data = [{name: null as unknown as string, age: 0, email: ''}];
    render(<BaseTable data={data} columns={columns} />);
    const cells = screen.getAllByRole('cell');
    // null renders as empty, 0 renders as '0', empty string renders as empty
    expect(cells[0]).toHaveTextContent('');
    expect(cells[1]).toHaveTextContent('0');
    expect(cells[2]).toHaveTextContent('');
  });

  it('renders children mode instead of data', () => {
    render(
      <BaseTable>
        <tbody>
          <tr>
            <td>Manual cell</td>
          </tr>
        </tbody>
      </BaseTable>,
    );
    expect(screen.getByText('Manual cell')).toBeInTheDocument();
  });

  it('does not render thead in children mode without columns', () => {
    const {container} = render(
      <BaseTable>
        <tbody>
          <tr>
            <td>Content</td>
          </tr>
        </tbody>
      </BaseTable>,
    );
    expect(container.querySelector('thead')).toBeNull();
  });

  it('renders empty table when data is empty array', () => {
    render(<BaseTable data={[]} columns={columns} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Header row + empty state row
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('does not render colgroup', () => {
    const {container} = render(<BaseTable data={users} columns={columns} />);
    expect(container.querySelector('colgroup')).toBeNull();
  });

  it('forwards ref to the table element', () => {
    const ref = vi.fn();
    render(<BaseTable data={users} columns={columns} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTableElement));
  });

  describe('root element styling props (#3679)', () => {
    it('applies className to the table element', () => {
      render(<Table data={users} columns={columns} className="custom-table" />);
      expect(screen.getByRole('table').className).toContain('custom-table');
    });

    it('applies style to the table element', () => {
      render(<Table data={users} columns={columns} style={{opacity: 0.9}} />);
      expect(screen.getByRole('table').style.opacity).toBe('0.9');
    });

    it('accepts xstyle without error', () => {
      render(<Table data={users} columns={columns} xstyle={undefined} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('spreads id and aria attributes onto the table element', () => {
      render(
        <Table
          data={users}
          columns={columns}
          id="users-table"
          aria-label="Users"
          data-analytics="tables"
        />,
      );
      const table = screen.getByRole('table', {name: 'Users'});
      expect(table.id).toBe('users-table');
      expect(table).toHaveAttribute('data-analytics', 'tables');
    });

    it('keeps the computed column min-width over a consumer style.minWidth', () => {
      const {tableMinWidth} = resolveColumnWidths(columns);
      render(
        <Table data={users} columns={columns} style={{minWidth: '10px'}} />,
      );
      expect(screen.getByRole('table').style.minWidth).toBe(
        `${tableMinWidth}px`,
      );
    });

    it('lets a consumer style.minWidth survive when no columns are resolved', () => {
      render(
        <Table style={{minWidth: '10px'}}>
          <tbody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </tbody>
        </Table>,
      );
      expect(screen.getByRole('table').style.minWidth).toBe('10px');
    });

    it('keeps a larger consumer style.minWidth beside width-less column floors', () => {
      const plain: TableColumn<User>[] = [
        {key: 'name'},
        {key: 'age'},
        {key: 'email'},
        {key: 'role'},
      ];
      render(<Table data={users} columns={plain} style={{minWidth: 900}} />);
      expect(screen.getByRole('table').style.minWidth).toBe('900px');
    });

    it.each([
      [undefined, '240px'],
      [900, '900px'],
      [100, '240px'],
      [0, '240px'],
      ['900px', '900px'],
      ['10px', '240px'],
      ['0', '240px'],
      ['0rem', '240px'],
      ['', '240px'],
      ['60rem', 'max(60rem, 240px)'],
      ['50%', 'max(50%, 240px)'],
      ['calc(100% - 2rem)', 'max(calc(100% - 2rem), 240px)'],
      ['var(--table-min)', 'max(var(--table-min), 240px)'],
      ['auto', '240px'],
      ['max-content', '240px'],
      ['min-content', '240px'],
      ['fit-content', '240px'],
      ['inherit', '240px'],
      ['12', '240px'],
    ] as const)(
      'resolves a consumer minWidth of %j beside a 240px floor to %s',
      (consumer, expected) => {
        expect(resolveTableMinWidth(consumer, 240)).toBe(expected);
      },
    );

    it('raises a smaller consumer style.minWidth to the column floors', () => {
      const plain: TableColumn<User>[] = [{key: 'name'}, {key: 'age'}];
      render(<Table data={users} columns={plain} style={{minWidth: '10px'}} />);
      expect(screen.getByRole('table').style.minWidth).toBe(
        `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH * 2}px`,
      );
    });

    it('keeps the canonical theme class alongside a consumer className', () => {
      render(<Table data={users} columns={columns} className="custom-table" />);
      const table = screen.getByRole('table');
      expect(table.className).toContain('astryx-table');
      expect(table.className).not.toContain('astryx-base-table');
      expect(table.className).toContain('custom-table');
    });

    it('passes event handlers through to the table element', async () => {
      const onClick = vi.fn();
      render(<Table data={users} columns={columns} onClick={onClick} />);
      screen
        .getByRole('table')
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('applies dynamic xstyle values to the table element', () => {
      const dynamic = stylex.create({
        opacity: (value: number) => ({opacity: value}),
      });
      render(
        <Table data={users} columns={columns} xstyle={dynamic.opacity(0.42)} />,
      );
      expect(screen.getByRole('table').getAttribute('style')).toContain('0.42');
    });

    it('honors className in children mode', () => {
      render(
        <Table className="custom-table">
          <tbody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </tbody>
        </Table>,
      );
      expect(screen.getByRole('table').className).toContain('custom-table');
    });

    it('honors className on an unwrapped BaseTable (no scrollWrapper)', () => {
      render(
        <BaseTable data={users} columns={columns} className="custom-table" />,
      );
      expect(screen.getByRole('table').className).toContain('custom-table');
    });
  });

  describe('TableRow styling props', () => {
    it('applies className and style to the row inside a Table', () => {
      render(
        <Table>
          <tbody>
            <TableRow className="custom-row" style={{opacity: 0.9}}>
              <TableCell>Cell</TableCell>
            </TableRow>
          </tbody>
        </Table>,
      );
      const row = screen.getByRole('row');
      expect(row.className).toContain('custom-row');
      expect(row.className).toContain('astryx-table-row');
      expect(row.style.opacity).toBe('0.9');
    });

    it('applies className to a standalone row (no table context)', () => {
      render(
        <table>
          <tbody>
            <TableRow className="custom-row">
              <td>Cell</td>
            </TableRow>
          </tbody>
        </table>,
      );
      expect(screen.getByRole('row').className).toContain('custom-row');
    });
  });

  describe('plugin pipeline', () => {
    it('applies transformTable plugin', () => {
      const plugin: TablePlugin<User> = {
        transformTable: props => ({
          ...props,
          htmlProps: {...props.htmlProps, 'data-testid': 'plugin-table'},
        }),
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      expect(screen.getByTestId('plugin-table')).toBeInTheDocument();
    });

    it('applies transformHeaderRow plugin', () => {
      const plugin: TablePlugin<User> = {
        transformHeaderRow: props => ({
          ...props,
          htmlProps: {...props.htmlProps, 'data-testid': 'plugin-header-row'},
        }),
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      expect(screen.getByTestId('plugin-header-row')).toBeInTheDocument();
    });

    it('applies transformHeaderCell plugin with column context', () => {
      const receivedKeys: string[] = [];
      const plugin: TablePlugin<User> = {
        transformHeaderCell: (props, column) => {
          receivedKeys.push(column.key);
          return {
            ...props,
            htmlProps: {...props.htmlProps, 'data-column': column.key},
          };
        },
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      expect(receivedKeys).toEqual(['name', 'age', 'email']);
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveAttribute('data-column', 'name');
    });

    it('applies transformBodyRow plugin with item and index', () => {
      const receivedItems: string[] = [];
      const plugin: TablePlugin<User> = {
        transformBodyRow: (props, item, index) => {
          receivedItems.push(item.name);
          return {
            ...props,
            htmlProps: {...props.htmlProps, 'data-row-index': String(index)},
          };
        },
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      expect(receivedItems).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('applies transformBodyCell plugin with column and item context', () => {
      const calls: {col: string; name: string}[] = [];
      const plugin: TablePlugin<User> = {
        transformBodyCell: (props, column, item) => {
          calls.push({col: column.key, name: item.name});
          return props;
        },
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      // 3 rows * 3 columns = 9 calls
      expect(calls).toHaveLength(9);
      expect(calls[0]).toEqual({col: 'name', name: 'Alice'});
    });

    it('isContentSuppressed renders an empty cell and never calls the column renderer', () => {
      const rendered: string[] = [];
      const withRenderer: TableColumn<User>[] = [
        {
          key: 'name',
          header: 'Name',
          renderCell: item => {
            rendered.push(item.name);
            return <b>{item.name}</b>;
          },
        },
      ];
      const plugin: TablePlugin<User> = {
        transformBodyCell: (props, _column, item) =>
          item.name === 'Bob' ? {...props, isContentSuppressed: true} : props,
      };
      render(
        <BaseTable data={users} columns={withRenderer} plugins={[plugin]} />,
      );
      expect(rendered).toEqual(['Alice', 'Charlie']);
      const cells = screen.getAllByRole('cell');
      expect(cells[1]).toBeEmptyDOMElement();
      expect(cells[0]).toHaveTextContent('Alice');
    });

    it('isContentSuppressed also suppresses the default renderer', () => {
      const plugin: TablePlugin<User> = {
        transformBodyCell: props => ({...props, isContentSuppressed: true}),
      };
      render(<BaseTable data={users} columns={columns} plugins={[plugin]} />);
      for (const cell of screen.getAllByRole('cell')) {
        expect(cell).toBeEmptyDOMElement();
      }
    });

    it('composes multiple plugins sequentially', () => {
      const plugin1: TablePlugin<User> = {
        transformTable: props => ({
          ...props,
          htmlProps: {...props.htmlProps, 'data-first': 'yes'},
        }),
      };
      const plugin2: TablePlugin<User> = {
        transformTable: props => ({
          ...props,
          htmlProps: {...props.htmlProps, 'data-second': 'yes'},
        }),
      };
      render(
        <BaseTable
          data={users}
          columns={columns}
          plugins={[plugin1, plugin2]}
        />,
      );
      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('data-first', 'yes');
      expect(table).toHaveAttribute('data-second', 'yes');
    });

    it('later plugin can read props set by earlier plugin', () => {
      const plugin1: TablePlugin<User> = {
        transformTable: props => ({
          ...props,
          htmlProps: {...props.htmlProps, 'data-step': '1'},
        }),
      };
      const plugin2: TablePlugin<User> = {
        transformTable: props => {
          const step = (props.htmlProps as Record<string, string>)['data-step'];
          return {
            ...props,
            htmlProps: {...props.htmlProps, 'data-step': step + ',2'},
          };
        },
      };
      render(
        <BaseTable
          data={users}
          columns={columns}
          plugins={[plugin1, plugin2]}
        />,
      );
      expect(screen.getByRole('table')).toHaveAttribute('data-step', '1,2');
    });
  });

  describe('column min-widths', () => {
    it('applies default minWidth on header cells for proportional columns', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: proportional(1)},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveStyle({
        minWidth: `${DEFAULT_MIN_COLUMN_WIDTH}px`,
      });
      expect(headers[1]).toHaveStyle({
        minWidth: `${DEFAULT_MIN_COLUMN_WIDTH}px`,
      });
    });

    it('applies explicit minWidth on proportional columns', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: proportional(1, {minWidth: 200})},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveStyle({minWidth: '200px'});
      expect(headers[1]).toHaveStyle({
        minWidth: `${DEFAULT_MIN_COLUMN_WIDTH}px`,
      });
    });

    it('sets minWidth on pixel columns to prevent shrinking', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: pixel(80)},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveStyle({width: '80px', minWidth: '80px'});
      expect(headers[1]).toHaveStyle({
        minWidth: `${DEFAULT_MIN_COLUMN_WIDTH}px`,
      });
    });

    it('applies content-derived minWidth on auto-generated columns', () => {
      render(<BaseTable data={users} />);
      const headers = screen.getAllByRole('columnheader');
      for (const header of headers) {
        // Each column should have a minWidth derived from content (at least 60px floor)
        const style = header.getAttribute('style') ?? '';
        expect(style).toContain('min-width');
      }
    });

    it('keeps width-less columns flexible with a compact readability floor', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name'},
        {key: 'age', header: 'Age'},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveStyle({
        width: '50%',
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH}px`,
      });
      expect(headers[1]).toHaveStyle({
        width: '50%',
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH}px`,
      });
      expect(screen.getByRole('table')).toHaveStyle({
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH * 2}px`,
      });
    });

    it('lets one column set its own floor with proportional minWidth', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: proportional(1, {minWidth: 96})},
        {key: 'age', header: 'Age', width: proportional(1, {minWidth: 40})},
        {key: 'email', header: 'Email'},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const headers = screen.getAllByRole('columnheader');
      // A larger and a smaller authored floor both replace the 60px default
      // for their own column; the width-less column keeps the compact floor.
      expect(headers[0]).toHaveStyle({minWidth: '96px'});
      expect(headers[1]).toHaveStyle({minWidth: '40px'});
      expect(headers[2]).toHaveStyle({
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH}px`,
      });
      expect(screen.getByRole('table')).toHaveStyle({
        minWidth: `${Math.max(96, 40, DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH) * 3}px`,
      });
    });

    it('keeps the width-less floor stable when row content changes', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name'},
        {key: 'age', header: 'Age'},
      ];
      const {rerender} = render(<BaseTable data={[]} columns={cols} />);
      const table = screen.getByRole('table');
      expect(table).toHaveStyle({
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH * 2}px`,
      });

      rerender(
        <BaseTable
          data={[
            {
              ...users[0],
              name: 'one-unbreakable-token-that-must-not-change-column-sizing',
            },
          ]}
          columns={cols}
        />,
      );
      expect(table).toHaveStyle({
        minWidth: `${DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH * 2}px`,
      });
    });

    it('sets table min-width to enforce proportional column minimums', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: proportional(1)},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const table = screen.getByRole('table');
      // 2 equal columns: 120 * 2 / 1 = 240px
      expect(table).toHaveStyle({
        minWidth: `${DEFAULT_MIN_COLUMN_WIDTH * 2}px`,
      });
    });

    it('sets table min-width based on most constrained proportional column', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: proportional(1, {minWidth: 200})},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const table = screen.getByRole('table');
      // name requires: 200 * 2 / 1 = 400px (most constrained)
      // age requires:  120 * 2 / 1 = 240px
      expect(table).toHaveStyle({minWidth: '400px'});
    });

    it('sets table min-width accounting for pixel and proportional columns', () => {
      const cols: TableColumn<User>[] = [
        {key: 'name', header: 'Name', width: pixel(80)},
        {key: 'age', header: 'Age', width: proportional(1)},
      ];
      render(<BaseTable data={users} columns={cols} />);
      const table = screen.getByRole('table');
      // pixel: 80px + proportional requires 120 * 1 / 1 = 120px
      // Table min-width = 80 + 120 = 200px
      expect(table).toHaveStyle({
        minWidth: `${80 + DEFAULT_MIN_COLUMN_WIDTH}px`,
      });
    });
  });
});

// =============================================================================
// Table Tests
// =============================================================================

describe('Table', () => {
  it('clears a cell when the field is removed from the row object (#3595)', () => {
    const cols: TableColumn<Record<string, unknown>>[] = [
      {key: 'name', header: 'Name'},
      {key: 'status', header: 'Status'},
    ];
    const {rerender} = render(
      <Table
        data={[{id: '1', name: 'Alice', status: 'active'}]}
        columns={cols}
        idKey="id"
      />,
    );
    expect(screen.getByText('active')).toBeInTheDocument();

    // Clearing a field by omitting it (optimistic update / server response)
    // must re-render the row — the memo previously only compared the keys of
    // the NEW item, so the deleted field's stale value kept rendering.
    rerender(
      <Table data={[{id: '1', name: 'Alice'}]} columns={cols} idKey="id" />,
    );
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('renders a table with correct structure', () => {
    render(<Table data={users} columns={columns} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getAllByRole('cell')).toHaveLength(9);
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('wraps the table in an observed scroll content box', () => {
    render(<Table data={users} columns={columns} />);
    const table = screen.getByRole('table');
    const content = table.parentElement;
    const wrapper = content?.parentElement;
    expect(content).toHaveAttribute('data-scroll-content');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.className).toContain('astryx-table-scroll-wrapper');
  });

  it('keeps a fitting scroll container out of the keyboard order', () => {
    render(<Table data={users} columns={columns} />);
    const wrapper = screen.getByRole('group', {name: 'Table'});
    expect(wrapper).not.toHaveAttribute('tabindex');
    expect(wrapper.style.overscrollBehaviorX).toBe('auto');
  });

  it('names the scroll region after its table, not a generic "Table" (AST-025)', () => {
    render(
      <>
        <Table aria-label="Orders" data={users} columns={columns} />
        <h2 id="refunds-title">Refunds</h2>
        <Table aria-labelledby="refunds-title" data={users} columns={columns} />
        <h2 id="returns-title">Returns</h2>
        <Table
          aria-label="Ignored label"
          aria-labelledby="returns-title"
          data={users}
          columns={columns}
        />
        <Table data={users} columns={columns} />
      </>,
    );
    expect(screen.getByRole('group', {name: 'Orders'})).toBeInTheDocument();
    expect(screen.getByRole('group', {name: 'Refunds'})).toHaveAttribute(
      'aria-labelledby',
      'refunds-title',
    );
    // With both, the region is named as the table is: by aria-labelledby.
    expect(screen.getByRole('table', {name: 'Returns'})).toBeInTheDocument();
    const returns = screen.getByRole('group', {name: 'Returns'});
    expect(returns).not.toHaveAttribute('aria-label');
    expect(
      screen.queryByRole('group', {name: 'Ignored label'}),
    ).not.toBeInTheDocument();
    // An unnamed table keeps the generic fallback.
    expect(screen.getAllByRole('group', {name: 'Table'})).toHaveLength(1);
  });

  it('preserves scroll-wrapper HTML attributes from plugins', () => {
    const plugin: TablePlugin<User> = {
      transformScrollWrapper: props => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          role: 'region',
          'aria-label': 'Orders',
          tabIndex: 2,
        },
      }),
    };
    render(<Table data={users} columns={columns} plugins={{custom: plugin}} />);
    const wrapper = screen.getByRole('region', {name: 'Orders'});
    expect(wrapper).toHaveAttribute('tabindex', '2');
  });

  it('contains overscroll only while the table scrolls', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    try {
      render(<Table data={users} columns={columns} />);
      const wrapper = screen.getByRole('group', {name: 'Table'});
      Object.assign(wrapper.style, {overflowX: 'auto'});
      for (const [key, value] of Object.entries({
        clientWidth: 100,
        clientHeight: 100,
        scrollWidth: 180,
        scrollHeight: 100,
        scrollLeft: 0,
        scrollTop: 0,
      })) {
        Object.defineProperty(wrapper, key, {
          configurable: true,
          value,
          writable: true,
        });
      }

      act(() => {
        wrapper.dispatchEvent(new Event('scroll'));
        frames.splice(0).forEach(callback => callback(performance.now()));
      });

      expect(wrapper).toHaveAttribute('tabindex', '0');
      expect(wrapper).toHaveAttribute('data-scrollable-inline', 'true');
      expect(wrapper.style.overscrollBehaviorX).toBe('contain');

      Object.defineProperty(wrapper, 'scrollWidth', {
        configurable: true,
        value: 100,
        writable: true,
      });
      act(() => {
        wrapper.dispatchEvent(new Event('scroll'));
        frames.splice(0).forEach(callback => callback(performance.now()));
      });

      expect(wrapper).not.toHaveAttribute('tabindex');
      expect(wrapper).not.toHaveAttribute('data-scrollable-inline');
      expect(wrapper.style.overscrollBehaviorX).toBe('auto');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses table-layout: auto in children mode', () => {
    const {container} = render(
      <Table dividers="rows">
        <tbody>
          <tr>
            <td>Content</td>
          </tr>
        </tbody>
      </Table>,
    );
    const table = container.querySelector('table');
    expect(table).toHaveStyle({tableLayout: 'auto'});
  });

  it('uses table-layout: fixed in data-driven mode', () => {
    const {container} = render(<Table data={users} columns={columns} />);
    const table = container.querySelector('table');
    expect(table).toHaveStyle({tableLayout: 'fixed'});
  });

  it('renders all data values', () => {
    render(<Table data={users} columns={columns} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('auto-generates columns from data', () => {
    render(<Table data={users} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent('Name');
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('forwards ref to the table element', () => {
    const ref = vi.fn();
    render(<Table data={users} columns={columns} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTableElement));
  });

  describe('density', () => {
    it('renders with compact density', () => {
      render(<Table data={users} columns={columns} density="compact" />);
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('renders with balanced density (default)', () => {
      render(<Table data={users} columns={columns} />);
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('renders with spacious density', () => {
      render(<Table data={users} columns={columns} density="spacious" />);
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('reflects density as data-density on cells and header cells (theme hook)', () => {
      // The density lives in internal StyleX classes, so cells expose it as a
      // data-density attribute on the stable astryx-table-cell /
      // astryx-table-header-cell targets. This lets a theme override padding
      // per density (e.g. hold the inline inset while varying the block) via
      // `defineTheme` — the padding split is otherwise unreachable.
      const {rerender} = render(
        <Table data={users} columns={columns} density="spacious" />,
      );
      const cell = screen.getAllByRole('cell')[0];
      const header = screen.getAllByRole('columnheader')[0];
      expect(cell.className).toContain('astryx-table-cell');
      expect(cell).toHaveAttribute('data-density', 'spacious');
      expect(header.className).toContain('astryx-table-header-cell');
      expect(header).toHaveAttribute('data-density', 'spacious');

      rerender(<Table data={users} columns={columns} density="compact" />);
      expect(screen.getAllByRole('cell')[0]).toHaveAttribute(
        'data-density',
        'compact',
      );
      expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute(
        'data-density',
        'compact',
      );
    });
  });

  describe('dividers', () => {
    it('renders with row dividers (default)', () => {
      render(<Table data={users} columns={columns} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with column dividers', () => {
      render(<Table data={users} columns={columns} dividers="columns" />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with grid dividers', () => {
      render(<Table data={users} columns={columns} dividers="grid" />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with no dividers', () => {
      render(<Table data={users} columns={columns} dividers="none" />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('striped', () => {
    it('renders with isStriped rows', () => {
      render(<Table data={users} columns={columns} isStriped />);
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });
  });

  describe('hover', () => {
    it('renders with hasHover enabled', () => {
      render(<Table data={users} columns={columns} hasHover />);
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });
  });

  it('renders with all appearance props combined', () => {
    render(
      <Table
        data={users}
        columns={columns}
        density="compact"
        dividers="grid"
        isStriped
        hasHover
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByRole('cell')).toHaveLength(9);
  });

  it('accepts user plugins alongside XDS styling', () => {
    const userPlugin: TablePlugin<User> = {
      transformTable: props => ({
        ...props,
        htmlProps: {...props.htmlProps, 'data-testid': 'custom-plugin'},
      }),
    };
    render(
      <Table data={users} columns={columns} plugins={{custom: userPlugin}} />,
    );
    expect(screen.getByTestId('custom-plugin')).toBeInTheDocument();
  });

  it('runs user plugins after XDS styling plugin', () => {
    const userPlugin: TablePlugin<User> = {
      transformTable: props => {
        // XDS plugin should have already added styles
        expect(props.xstyle.length).toBeGreaterThan(1);
        return {
          ...props,
          htmlProps: {...props.htmlProps, 'data-testid': 'after-xds'},
        };
      },
    };
    render(
      <Table data={users} columns={columns} plugins={{custom: userPlugin}} />,
    );
    expect(screen.getByTestId('after-xds')).toBeInTheDocument();
  });

  it('renders children mode with TableRow and TableCell', () => {
    render(
      <Table density="balanced" dividers="rows">
        <TableBody>
          <TableRow>
            <TableCell>Streamed A</TableCell>
            <TableCell>Streamed B</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Streamed C</TableCell>
            <TableCell>Streamed D</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText('Streamed A')).toBeInTheDocument();
    expect(screen.getByText('Streamed D')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });

  // Children mode hands the children straight to <table> — it does not wrap
  // them the way the data-driven path does. That is deliberate (it is what
  // makes the section components composable), but it was never written down,
  // and a caller who skipped the section shipped `<table><tr>` (#5277).
  it("children mode renders no tbody of its own — the section is the caller's", () => {
    const {container} = render(
      <Table density="balanced">
        {/* The unwrapped shape is the subject of this test, not a mistake. */}
        {/* eslint-disable-next-line @astryx/require-table-section */}
        <TableRow>
          <TableCell>Unwrapped</TableCell>
        </TableRow>
      </Table>,
    );
    const table = container.querySelector('table');
    expect(table?.querySelector('tbody')).toBeNull();
    expect(Array.from(table?.children ?? []).map(el => el.tagName)).toContain(
      'TR',
    );
  });

  // Columns do not bring a thead with them in children mode — BaseTable's
  // `children ? children : <>...</>` short-circuits the whole data-driven
  // branch, header included. The header is TableHeader's job here.
  it('children mode renders no thead even when columns are supplied', () => {
    const {container} = render(
      <Table columns={columns}>
        <TableBody>
          <TableRow>
            <TableCell>Only body</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelector('tbody > tr')).not.toBeNull();
  });

  it('children mode renders the thead TableHeader supplies', () => {
    const {container} = render(
      <Table columns={columns}>
        <TableHeader>
          <TableRow isHeaderRow>
            <TableCell>H</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>B</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = container.querySelector('table');
    expect(Array.from(table?.children ?? []).map(el => el.tagName)).toEqual([
      'THEAD',
      'TBODY',
    ]);
  });

  it('children mode puts the rows in the tbody TableBody renders', () => {
    const {container} = render(
      <Table density="balanced">
        <TableBody>
          <TableRow>
            <TableCell>Wrapped</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = container.querySelector('table');
    expect(
      Array.from(table?.children ?? []).map(el => el.tagName),
    ).not.toContain('TR');
    expect(table?.querySelector('tbody > tr')).not.toBeNull();
  });

  it('passes through idKey string to base table', () => {
    render(<Table data={users} columns={columns} idKey="email" />);
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('passes through idKey function to base table', () => {
    const idKey = vi.fn((item: User) => item.email);
    render(<Table data={users} columns={columns} idKey={idKey} />);
    expect(idKey).toHaveBeenCalledTimes(3);
    expect(idKey).toHaveBeenCalledWith(users[0]);
    expect(idKey).toHaveBeenCalledWith(users[1]);
    expect(idKey).toHaveBeenCalledWith(users[2]);
  });

  it('applies overflow truncation styles to body cells', () => {
    // text-overflow: ellipsis + overflow: hidden + white-space: nowrap are applied
    // via StyleX class names when textOverflow="truncate".
    const longData = [
      {
        name: 'a_very_long_string_without_spaces_that_would_overflow_a_fixed_width_column',
        value: '42',
      },
    ];
    render(<Table data={longData} textOverflow="truncate" />);
    const cell = screen.getAllByRole('cell')[0];
    // Cell should have at least one StyleX-generated class applied
    expect(cell.className.length).toBeGreaterThan(0);
    // Text content is present in the DOM (truncation is purely visual)
    expect(cell).toHaveTextContent(
      'a_very_long_string_without_spaces_that_would_overflow_a_fixed_width_column',
    );
  });

  it('wraps text by default (textOverflow="wrap")', () => {
    render(<Table data={users} columns={columns} />);
    const cells = screen.getAllByRole('cell');
    // In wrap mode, no Text wrapper — content renders directly
    expect(cells[0]).toHaveTextContent('Alice');
    expect(cells[0]).not.toHaveAttribute('title');
  });

  it('wraps text when textOverflow="wrap"', () => {
    render(<Table data={users} columns={columns} textOverflow="wrap" />);
    const cells = screen.getAllByRole('cell');
    // In wrap mode, no title attribute is added (text is visible, not hidden)
    expect(cells[0]).not.toHaveAttribute('title');
    // Content is present
    expect(cells[0]).toHaveTextContent('Alice');
  });

  it('wraps default-rendered cells in Text when textOverflow="truncate"', () => {
    render(<Table data={users} columns={columns} textOverflow="truncate" />);
    const cells = screen.getAllByRole('cell');
    // Default-rendered cells contain an Text child element (a <span>)
    const textEl = cells[0].querySelector('span');
    expect(textEl).toBeTruthy();
    expect(textEl).toHaveTextContent('Alice');
  });

  it('does not wrap renderCell content in Text when truncating', () => {
    const cols: TableColumn<User>[] = [
      {
        key: 'name',
        header: 'Name',
        renderCell: item => <span data-testid="custom">{item.name}</span>,
      },
      {key: 'email', header: 'Email'},
    ];
    render(<Table data={users} columns={cols} textOverflow="truncate" />);
    // Custom renderCell: consumer owns the content
    const customCells = screen.getAllByTestId('custom');
    expect(customCells[0]).toHaveTextContent('Alice');
  });

  it('sets title attribute on string header cells', () => {
    render(<Table data={users} columns={columns} />);
    const headers = screen.getAllByRole('columnheader');
    // columns fixture order: name, age, email
    expect(headers[0]).toHaveAttribute('title', 'Name');
    expect(headers[1]).toHaveAttribute('title', 'Age');
    expect(headers[2]).toHaveAttribute('title', 'Email');
  });
});

// =============================================================================
// TableRow Tests
// =============================================================================

describe('TableRow', () => {
  it('renders a tr element', () => {
    render(
      <table>
        <tbody>
          <TableRow data-testid="test-row">
            <td>Cell</td>
          </TableRow>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('test-row').tagName).toBe('TR');
  });

  it('renders children inside the tr', () => {
    render(
      <table>
        <tbody>
          <TableRow>
            <td>First</td>
            <td>Second</td>
          </TableRow>
        </tbody>
      </table>,
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('forwards ref to the tr element', () => {
    const ref = vi.fn();
    render(
      <table>
        <tbody>
          <TableRow ref={ref}>
            <td>Cell</td>
          </TableRow>
        </tbody>
      </table>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTableRowElement));
  });

  it('passes through HTML attributes (excluding className/style)', () => {
    render(
      <table>
        <tbody>
          <TableRow data-testid="row" aria-label="test row">
            <td>Cell</td>
          </TableRow>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('row')).toHaveAttribute('aria-label', 'test row');
  });
});

// =============================================================================
// TableCell Tests
// =============================================================================

describe('TableCell', () => {
  it('renders a td element', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell data-testid="test-cell">Content</TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('test-cell').tagName).toBe('TD');
  });

  it('renders children inside the td', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell>
              <span>Nested content</span>
            </TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByText('Nested content')).toBeInTheDocument();
  });

  it('renders empty when no children provided', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell data-testid="empty-cell" />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('empty-cell')).toHaveTextContent('');
  });

  it('forwards ref to the td element', () => {
    const ref = vi.fn();
    render(
      <table>
        <tbody>
          <tr>
            <TableCell ref={ref}>Cell</TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTableCellElement));
  });

  it('forwards colSpan attribute', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell colSpan={3} data-testid="span-cell">
              Spanning
            </TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('span-cell')).toHaveAttribute('colspan', '3');
  });

  it('forwards rowSpan attribute', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell rowSpan={2} data-testid="rowspan-cell">
              Spanning
            </TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('rowspan-cell')).toHaveAttribute('rowspan', '2');
  });
});

// =============================================================================
// Column Alignment Tests
// =============================================================================

describe('column alignment', () => {
  it('applies textAlign to header and body cells via inline style', () => {
    const {container} = render(
      <Table
        data={users}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age', align: 'end'},
          {key: 'email', header: 'Email', align: 'center'},
        ]}
      />,
    );

    const headerCells = container.querySelectorAll('th');
    // First column: no explicit align (default 'start' is handled by CSS default)
    expect(headerCells[0]).not.toHaveStyle({textAlign: 'end'});
    expect(headerCells[0]).not.toHaveStyle({textAlign: 'center'});
    // Second column: end aligned
    expect(headerCells[1]).toHaveStyle({textAlign: 'end'});
    // Third column: center aligned
    expect(headerCells[2]).toHaveStyle({textAlign: 'center'});

    const bodyRows = container.querySelectorAll('tbody tr');
    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells[1]).toHaveStyle({textAlign: 'end'});
    expect(firstRowCells[2]).toHaveStyle({textAlign: 'center'});
  });

  it('defaults to start alignment when align is not specified', () => {
    const {container} = render(
      <Table data={users} columns={[{key: 'name', header: 'Name'}]} />,
    );

    const headerCell = container.querySelector('th');
    // No textAlign inline style when default
    expect(headerCell?.style.textAlign).toBeFalsy();
  });

  it('applies align through the plugin pipeline on BaseTable', () => {
    const {container} = render(
      <BaseTable
        data={users}
        columns={[
          {key: 'name', header: 'Name', align: 'center'},
          {key: 'age', header: 'Age', align: 'end'},
        ]}
      />,
    );

    const headerCells = container.querySelectorAll('th');
    expect(headerCells[0]).toHaveStyle({textAlign: 'center'});
    expect(headerCells[1]).toHaveStyle({textAlign: 'end'});

    const bodyCells = container.querySelectorAll('tbody td');
    expect(bodyCells[0]).toHaveStyle({textAlign: 'center'});
    expect(bodyCells[1]).toHaveStyle({textAlign: 'end'});
  });
});

// =============================================================================
// Vertical Alignment Tests
// =============================================================================

describe('vertical alignment', () => {
  it('defaults to middle vertical alignment', () => {
    const {container} = render(
      <Table data={users} columns={[{key: 'name', header: 'Name'}]} />,
    );

    const bodyCell = container.querySelector('tbody td');
    expect(bodyCell).toHaveStyle({verticalAlign: 'middle'});
  });

  it('applies top vertical alignment', () => {
    const {container} = render(
      <Table
        data={users}
        columns={[{key: 'name', header: 'Name'}]}
        verticalAlign="top"
      />,
    );

    const bodyCell = container.querySelector('tbody td');
    expect(bodyCell).toHaveStyle({verticalAlign: 'top'});
  });

  it('applies bottom vertical alignment', () => {
    const {container} = render(
      <Table
        data={users}
        columns={[{key: 'name', header: 'Name'}]}
        verticalAlign="bottom"
      />,
    );

    const bodyCell = container.querySelector('tbody td');
    expect(bodyCell).toHaveStyle({verticalAlign: 'bottom'});
  });
});

describe('emptyState', () => {
  it('renders default empty state when data is empty', () => {
    render(
      <Table
        data={[]}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age'},
        ]}
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders custom empty state when provided', () => {
    render(
      <Table
        data={[]}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age'},
        ]}
        emptyState={<div data-testid="empty">No results found</div>}
      />,
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('does not render empty state when data has rows', () => {
    render(
      <Table
        data={[{name: 'Alice', age: 30}]}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age'},
        ]}
      />,
    );
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not render empty state when data is undefined', () => {
    render(<Table columns={[{key: 'name', header: 'Name'}]} />);
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('disables empty state with false', () => {
    render(
      <Table
        data={[]}
        columns={[{key: 'name', header: 'Name'}]}
        emptyState={false}
      />,
    );
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('empty state row spans all columns', () => {
    render(
      <Table
        data={[]}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age'},
          {key: 'role', header: 'Role'},
        ]}
        emptyState={<div data-testid="empty">Nothing here</div>}
      />,
    );
    const td = screen.getByTestId('empty').closest('td');
    expect(td).toHaveAttribute('colspan', '3');
  });

  it('still renders headers even when data is empty', () => {
    render(
      <Table
        data={[]}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'age', header: 'Age'},
        ]}
      />,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  describe('table section rest forwarding', () => {
    it('forwards data-testid and id to the tbody, thead, and tfoot', () => {
      const {container} = render(
        <table>
          <TableHeader data-testid="thead" id="head-1">
            <tr>
              <th>H</th>
            </tr>
          </TableHeader>
          <TableBody data-testid="tbody" id="body-1">
            <tr>
              <td>B</td>
            </tr>
          </TableBody>
          <TableFooter data-testid="tfoot" id="foot-1">
            <tr>
              <td>F</td>
            </tr>
          </TableFooter>
        </table>,
      );
      const thead = container.querySelector('thead')!;
      const tbody = container.querySelector('tbody')!;
      const tfoot = container.querySelector('tfoot')!;
      expect(thead).toHaveAttribute('data-testid', 'thead');
      expect(thead).toHaveAttribute('id', 'head-1');
      expect(tbody).toHaveAttribute('data-testid', 'tbody');
      expect(tbody).toHaveAttribute('id', 'body-1');
      expect(tfoot).toHaveAttribute('data-testid', 'tfoot');
      expect(tfoot).toHaveAttribute('id', 'foot-1');
    });
  });
});

describe('ARIA row indexing (#3939)', () => {
  const bodyRows = (container: HTMLElement): HTMLTableRowElement[] =>
    Array.from(container.querySelectorAll('tbody tr'));

  it('emits no aria-rowindex/aria-rowcount by default', () => {
    const {container} = render(<Table data={users} columns={columns} />);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-rowcount');
    for (const row of bodyRows(container)) {
      expect(row).not.toHaveAttribute('aria-rowindex');
    }
  });

  it('numbers rows from 1 when rowCount is provided', () => {
    const {container} = render(
      <Table data={users} columns={columns} rowCount={users.length} />,
    );
    expect(screen.getByRole('table')).toHaveAttribute(
      'aria-rowcount',
      String(users.length),
    );
    const indices = bodyRows(container).map(r =>
      r.getAttribute('aria-rowindex'),
    );
    expect(indices).toEqual(['1', '2', '3']);
  });

  it('offsets aria-rowindex by rowIndexStart for a paginated view', () => {
    // Page 3 of a 10-per-page dataset: first visible row is dataset row 21.
    const {container} = render(
      <Table
        data={users}
        columns={columns}
        rowIndexStart={21}
        rowCount={100}
      />,
    );
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '100');
    const indices = bodyRows(container).map(r =>
      r.getAttribute('aria-rowindex'),
    );
    expect(indices).toEqual(['21', '22', '23']);
  });

  it('sets aria-rowcount to -1 (unknown) when only rowIndexStart is given', () => {
    // Windowed/cursor pagination: offset known, total unknown.
    const {container} = render(
      <Table data={users} columns={columns} rowIndexStart={5} />,
    );
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '-1');
    const indices = bodyRows(container).map(r =>
      r.getAttribute('aria-rowindex'),
    );
    expect(indices).toEqual(['5', '6', '7']);
  });

  it('does not assign an ARIA row index to the header row', () => {
    render(<Table data={users} columns={columns} rowCount={users.length} />);
    const header = screen.getAllByRole('row')[0];
    expect(header).not.toHaveAttribute('aria-rowindex');
  });

  it('lets a plugin override the seeded aria-rowindex', () => {
    const plugin: TablePlugin<User> = {
      transformBodyRow(props, _item, index) {
        return {
          ...props,
          htmlProps: {...props.htmlProps, 'aria-rowindex': 100 + index},
        };
      },
    };
    const {container} = render(
      <Table
        data={users}
        columns={columns}
        rowCount={users.length}
        plugins={{custom: plugin}}
      />,
    );
    const indices = bodyRows(container).map(r =>
      r.getAttribute('aria-rowindex'),
    );
    expect(indices).toEqual(['100', '101', '102']);
  });
});
