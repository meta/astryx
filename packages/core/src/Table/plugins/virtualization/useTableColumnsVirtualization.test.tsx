// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableColumnsVirtualization.test.tsx
 * @input Public column capability and actual Table
 * @output Seed range, spacer structure, column positions, pinned runs and fallback tests
 * @position Colocated Table column virtualization runtime coverage
 */
import {afterEach, describe, it, expect, vi} from 'vitest';
import {act, cleanup, render, renderHook, screen} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as TableApi from '@astryxdesign/core/Table';
import {Table} from '../../Table';
import {pixel} from '../../columnUtils';
import type {TableColumn, TablePlugin} from '../../types';
import {useTableStickyColumns} from '../stickyColumns/useTableStickyColumns';
import {
  getTableColumnsVirtualizationConfig,
  useTableColumnsVirtualization,
} from './useTableColumnsVirtualization';
import {
  getTableVirtualizationConfig,
  useTableRowsVirtualization,
  type TableVirtualizationCapability,
} from './useTableRowsVirtualization';

type Item = Record<string, unknown> & {id: string};
const COLUMN_COUNT = 40;
const ROW_COUNT = 20;
const columns: TableColumn<Item>[] = Array.from(
  {length: COLUMN_COUNT},
  (_, i) => ({key: `c${i}`, header: `Column ${i}`, width: pixel(100)}),
);
const data: Item[] = Array.from({length: ROW_COUNT}, (_, row) => {
  const item: Item = {id: `row-${row}`};
  for (let i = 0; i < COLUMN_COUNT; i++) {
    item[`c${i}`] = `${row}:${i}`;
  }
  return item;
});

interface FixtureProps {
  items?: Item[];
  tableColumns?: TableColumn<Item>[];
  initialViewportWidth?: number;
  startKeys?: string[];
  endKeys?: string[];
  extraPlugins?: Record<string, TablePlugin<Item>>;
  hasRows?: boolean;
  textOverflow?: 'wrap' | 'truncate';
  style?: React.CSSProperties;
}
function Fixture({
  items = data,
  tableColumns = columns,
  initialViewportWidth = 500,
  startKeys,
  endKeys,
  extraPlugins,
  hasRows = false,
  textOverflow,
  style,
}: FixtureProps) {
  const cols = useTableColumnsVirtualization({initialViewportWidth});
  const rows = useTableRowsVirtualization({
    rowHeight: 48,
    initialViewportHeight: 240,
  });
  const sticky = useTableStickyColumns<Item>({startKeys, endKeys});
  return (
    <Table
      aria-label="Wide"
      data={items}
      columns={tableColumns}
      idKey="id"
      textOverflow={textOverflow}
      style={style}
      plugins={{sticky, ...extraPlugins}}
      virtualization={hasRows ? [rows, cols] : cols}
    />
  );
}

function headerCells(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('thead > tr > *'));
}
function firstBodyCells(root: ParentNode): Element[] {
  const row = Array.from(root.querySelectorAll('tbody > tr')).find(
    candidate => candidate.getAttribute('aria-hidden') !== 'true',
  );
  return row == null ? [] : Array.from(row.children);
}
function isSpacer(cell: Element): boolean {
  return cell.getAttribute('aria-hidden') === 'true';
}
function mountedKeys(root: ParentNode): string[] {
  return headerCells(root)
    .filter(cell => !isSpacer(cell))
    .map(cell => cell.getAttribute('data-column-key') ?? '');
}
function keys(...indices: number[]): string[] {
  return indices.map(index => `c${index}`);
}
function range(start: number, end: number): number[] {
  return Array.from({length: end - start}, (_, i) => start + i);
}

/** jsdom has no layout: give the Table's scroll area measured sizes. */
function measureViewport({
  width,
  scrollLeft = 0,
}: {
  width: number;
  scrollLeft?: number;
}): () => void {
  const isArea = (el: Element) => el.matches('[role="group"]');
  const spies = [
    vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return isArea(this) ? 300 : 0;
      }),
    vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return isArea(this) ? width : 0;
      }),
    vi
      .spyOn(Element.prototype, 'scrollLeft', 'get')
      .mockImplementation(function (this: Element) {
        return isArea(this) ? scrollLeft : 0;
      }),
  ];
  return () => spies.forEach(spy => spy.mockRestore());
}
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Table columns virtualization capability', () => {
  it('exports the hook from the Table subpath beside the rows hook', () => {
    expect(typeof Reflect.get(TableApi, 'useTableColumnsVirtualization')).toBe(
      'function',
    );
  });
  it('is an opaque, frozen capability with stable identity that the rows reader does not accept', () => {
    const {result, rerender} = renderHook(
      ({initialViewportWidth}) =>
        useTableColumnsVirtualization({initialViewportWidth}),
      {initialProps: {initialViewportWidth: 800}},
    );
    const original = result.current;
    expect(Object.keys(original)).toEqual([]);
    expect(Object.isFrozen(original)).toBe(true);
    expect(getTableColumnsVirtualizationConfig(original)).toEqual({
      initialViewportWidth: 800,
    });
    expect(getTableVirtualizationConfig(original)).toBeUndefined();
    expect(
      getTableColumnsVirtualizationConfig({initialViewportWidth: 800}),
    ).toBeUndefined();
    rerender({initialViewportWidth: 800});
    expect(result.current).toBe(original);
    rerender({initialViewportWidth: 900});
    expect(result.current).not.toBe(original);
  });
});

describe('actual Table column windowing', () => {
  it('seeds the server and first client with the columns that start inside initialViewportWidth, plus two of overscan', () => {
    const html = renderToStaticMarkup(<Fixture />);
    const server = document.createElement('div');
    server.innerHTML = html;
    // Columns start at 0..400px inside a 500px seed: five, plus two.
    expect(mountedKeys(server)).toEqual(keys(...range(0, 7)));
    const {container} = render(<Fixture />);
    expect(mountedKeys(container)).toEqual(mountedKeys(server));
  });

  it('constructs only mounted cells', () => {
    const reads = new Set<string>();
    const items = data.map(item => {
      const watched: Item = {id: item.id};
      for (let i = 0; i < COLUMN_COUNT; i++) {
        Object.defineProperty(watched, `c${i}`, {
          enumerable: true,
          get() {
            reads.add(`c${i}`);
            return String(item[`c${i}`]);
          },
        });
      }
      return watched;
    });
    render(<Fixture items={items} />);
    expect([...reads].sort()).toEqual(keys(...range(0, 7)).sort());
  });

  it('renders the same inaccessible spacer structure in the header and every body row', () => {
    const {container} = render(<Fixture />);
    const header = headerCells(container);
    // Seven mounted cells, then one spacer for the 33 columns after them.
    expect(header).toHaveLength(8);
    const spacer = header[7];
    expect(isSpacer(spacer)).toBe(true);
    expect(spacer.tagName).toBe('TD');
    expect(spacer.textContent).toBe('');
    expect(spacer.children).toHaveLength(0);
    expect(spacer).not.toHaveAttribute('tabindex');
    expect(spacer.getAttribute('style') ?? '').toContain('3300px');
    const bodyRows = Array.from(container.querySelectorAll('tbody > tr'));
    expect(bodyRows).toHaveLength(ROW_COUNT);
    for (const row of bodyRows) {
      const cells = Array.from(row.children);
      expect(cells.map(isSpacer)).toEqual(header.map(isSpacer));
      expect(cells[7].getAttribute('style')).toBe(spacer.getAttribute('style'));
      expect(cells[7].textContent).toBe('');
    }
  });

  it('exposes aria-colcount and full-table aria-colindex only while columns window', () => {
    const {container} = render(<Fixture />);
    const table = container.querySelector('table');
    expect(table).toHaveAttribute('aria-colcount', String(COLUMN_COUNT));
    const header = headerCells(container).filter(cell => !isSpacer(cell));
    expect(header.map(cell => cell.getAttribute('aria-colindex'))).toEqual(
      range(1, 8).map(String),
    );
    const body = firstBodyCells(container).filter(cell => !isSpacer(cell));
    expect(body.map(cell => cell.getAttribute('aria-colindex'))).toEqual(
      range(1, 8).map(String),
    );
    for (const spacer of headerCells(container).filter(isSpacer)) {
      expect(spacer).not.toHaveAttribute('aria-colindex');
    }
  });

  it('keeps the pinned start and end runs mounted and windows only the columns between them', () => {
    const {container} = render(
      <Fixture startKeys={['c0']} endKeys={['c39']} />,
    );
    // Both 100px pinned runs leave 300px of seed: three columns, plus two.
    expect(mountedKeys(container)).toEqual(keys(0, ...range(1, 6), 39));
    const header = headerCells(container);
    expect(header.map(isSpacer)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(header[7]).toHaveAttribute('aria-colindex', '40');
    expect(header[0]).toHaveAttribute('aria-colindex', '1');
    // The pinned offsets are unchanged.
    expect((header[0] as HTMLElement).style.insetInlineStart).toBe('0px');
    expect((header[7] as HTMLElement).style.insetInlineEnd).toBe('0px');
  });

  it('subtracts an end-pinned run from the seed, the same on the server and the first client', () => {
    const html = renderToStaticMarkup(<Fixture endKeys={['c38', 'c39']} />);
    const server = document.createElement('div');
    server.innerHTML = html;
    // The 200px pinned end run leaves 300px of seed: three columns, plus two.
    expect(mountedKeys(server)).toEqual(keys(...range(0, 5), 38, 39));
    const {container} = render(<Fixture endKeys={['c38', 'c39']} />);
    expect(mountedKeys(container)).toEqual(mountedKeys(server));
    expect(
      headerCells(container).map(cell => cell.getAttribute('aria-colindex')),
    ).toEqual(
      headerCells(server).map(cell => cell.getAttribute('aria-colindex')),
    );
  });

  it('windows the middle of the run from the measured inline viewport and scroll position', async () => {
    measureViewport({width: 500, scrollLeft: 2000});
    const {container} = render(<Fixture startKeys={['c0']} />);
    await settle();
    // 400px of unpinned viewport from 2000px into the run: run columns 20..23
    // are visible, so 18..25 mount with overscan. The run starts at c1.
    expect(mountedKeys(container)).toEqual(keys(0, ...range(19, 27)));
    const header = headerCells(container);
    expect(header.map(isSpacer)).toEqual([
      false,
      true,
      ...range(19, 27).map(() => false),
      true,
    ]);
    expect(header[1].getAttribute('style') ?? '').toContain('1800px');
    expect(header[10].getAttribute('style') ?? '').toContain('1300px');
    expect(header[2]).toHaveAttribute('aria-colindex', '20');
    const body = firstBodyCells(container);
    expect(body.map(isSpacer)).toEqual(header.map(isSpacer));
    expect(body[2]).toHaveAttribute('aria-colindex', '20');
  });

  it('reads the logical scroll position in a right-to-left table', async () => {
    measureViewport({width: 500, scrollLeft: -2000});
    const {container} = render(
      <div dir="rtl">
        <Fixture startKeys={['c0']} />
      </div>,
    );
    await settle();
    expect(mountedKeys(container)).toEqual(keys(0, ...range(19, 27)));
  });

  it('mounts every column, with no spacer or column positions, when the viewport is at least the table minimum width', async () => {
    measureViewport({width: 4000});
    const {container} = render(<Fixture startKeys={['c0']} />);
    await settle();
    expect(mountedKeys(container)).toEqual(keys(...range(0, COLUMN_COUNT)));
    expect(headerCells(container).some(isSpacer)).toBe(false);
    expect(container.querySelector('table')).not.toHaveAttribute(
      'aria-colcount',
    );
    expect(container.querySelector('[aria-colindex]')).toBeNull();
  });

  it('mounts every column from a seed at least the table minimum width', () => {
    const {container} = render(<Fixture initialViewportWidth={4000} />);
    expect(mountedKeys(container)).toHaveLength(COLUMN_COUNT);
    expect(container.querySelector('table')).not.toHaveAttribute(
      'aria-colcount',
    );
  });

  it('leaves a Table without the columns capability unchanged', () => {
    const {container} = render(
      <Table data={data} columns={columns} idKey="id" />,
    );
    expect(mountedKeys(container)).toHaveLength(COLUMN_COUNT);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('[aria-colindex]')).toBeNull();
    expect(container.querySelector('table')).not.toHaveAttribute(
      'aria-colcount',
    );
  });
});

describe('column windowing admission', () => {
  function expectEveryColumn(container: HTMLElement) {
    expect(mountedKeys(container)).toHaveLength(COLUMN_COUNT);
    expect(headerCells(container).some(isSpacer)).toBe(false);
    expect(container.querySelector('[aria-colindex]')).toBeNull();
  }
  function warnings(warn: {mock: {calls: unknown[][]}}): string[] {
    return warn.mock.calls.map(call => call.join(' '));
  }

  it('renders every column and warns for a seed that is not a positive finite width', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(<Fixture initialViewportWidth={0} />);
    expectEveryColumn(container);
    expect(warnings(warn).join('\n')).toContain('Column windowing disabled');
  });

  it('renders every column and warns for wrapped or custom-rendered content', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapped = render(<Fixture textOverflow="wrap" />);
    expectEveryColumn(wrapped.container);
    cleanup();
    const renderCell = vi.fn((item: Item) => <span>{String(item.c1)}</span>);
    const custom = render(
      <Fixture
        tableColumns={columns.map(column =>
          column.key === 'c1' ? {...column, renderCell} : column,
        )}
      />,
    );
    expectEveryColumn(custom.container);
    expect(renderCell).toHaveBeenCalledTimes(ROW_COUNT);
    const text = warnings(warn).join('\n');
    expect(text).toContain('explicit wrapped content is not fixed-height');
    expect(text).toContain('a custom cell renderer');
  });

  it('renders every column and warns for rows that are not flat', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree: TablePlugin<Item> = {
      rowModel: 'tree',
      transformBodyRow: props => props,
    };
    const {container} = render(<Fixture extraPlugins={{tree}} />);
    expectEveryColumn(container);
    expect(warnings(warn).join('\n')).toContain("rowModel: 'flat'");
  });

  it('renders every column and warns for duplicate row identity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <Fixture items={data.map(item => ({...item, id: 'same'}))} />,
    );
    expectEveryColumn(container);
    expect(warnings(warn).join('\n')).toContain(
      'explicit unique valid row identity',
    );
  });

  it('renders every column and warns for a cell that spans columns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spanning: TablePlugin<Item> = {
      rowModel: 'flat',
      transformBodyCell: (props, column) =>
        column.key === 'c2'
          ? {...props, htmlProps: {...props.htmlProps, colSpan: 2}}
          : props,
    };
    const {container} = render(<Fixture extraPlugins={{spanning}} />);
    await settle();
    expectEveryColumn(container);
    expect(warnings(warn).join('\n')).toContain('spans columns');
  });

  it('renders every column and warns for a table min-width wider than its column floors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(<Fixture style={{minWidth: 8000}} />);
    expectEveryColumn(container);
    expect(warnings(warn).join('\n')).toContain('min-width');
  });

  it('keeps row windowing, renders every column and names the later release when both capabilities are present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(<Fixture hasRows />);
    expectEveryColumn(container);
    // Rows still window: ceil(240 / 48) plus four of overscan.
    const rows = Array.from(container.querySelectorAll('tbody > tr')).filter(
      row => row.getAttribute('aria-hidden') !== 'true',
    );
    expect(rows).toHaveLength(9);
    expect(warnings(warn).join('\n')).toContain(
      'windowing rows and columns together',
    );
  });

  it('accepts a list with one rows capability alone', () => {
    function RowsList() {
      const rows = useTableRowsVirtualization({
        rowHeight: 48,
        initialViewportHeight: 240,
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={[rows]}
        />
      );
    }
    const {container} = render(<RowsList />);
    expect(container.querySelector('table')).toHaveAttribute(
      'aria-rowcount',
      String(ROW_COUNT + 1),
    );
  });

  it('renders without any windowing and warns once for an invalid list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    type Kind = 'two-columns' | 'two-rows' | 'foreign';
    function ListTable({kind}: {kind: Kind}) {
      const rows = useTableRowsVirtualization({
        rowHeight: 48,
        initialViewportHeight: 240,
      });
      const cols = useTableColumnsVirtualization({initialViewportWidth: 500});
      const other = useTableColumnsVirtualization({initialViewportWidth: 600});
      const foreign = {
        initialViewportWidth: 500,
      } as unknown as TableVirtualizationCapability;
      const list =
        kind === 'two-columns'
          ? [cols, other]
          : kind === 'two-rows'
            ? [rows, rows]
            : [rows, foreign];
      return (
        <Table data={data} columns={columns} idKey="id" virtualization={list} />
      );
    }
    for (const kind of ['two-columns', 'two-rows', 'foreign'] as const) {
      const {container, rerender} = render(<ListTable kind={kind} />);
      rerender(<ListTable kind={kind} />);
      expectEveryColumn(container);
      expect(container.querySelectorAll('tbody > tr')).toHaveLength(ROW_COUNT);
      expect(container.querySelector('table')).not.toHaveAttribute(
        'aria-rowcount',
      );
      cleanup();
    }
    const listWarnings = warnings(warn).filter(text =>
      text.includes('virtualization list'),
    );
    expect(listWarnings).toHaveLength(3);
  });
});

/**
 * A measured scroll area whose inline position the test moves. A write to
 * scrollLeft records the anchor's request and lands, as a browser scroll does.
 */
function controlledViewport(width = 500) {
  let left = 0;
  const writes: number[] = [];
  const isArea = (el: Element) => el.matches('[role="group"]');
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isArea(this) ? 300 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isArea(this) ? width : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isArea(this) ? 4000 : 0;
    },
  );
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function (
    this: Element,
  ) {
    return isArea(this) ? left : 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (
    this: Element,
    value: number,
  ) {
    if (isArea(this)) {
      writes.push(value);
      left = value;
    }
  });
  async function scrollTo(next: number) {
    left = next;
    await act(async () => {
      document
        .querySelector('[role="group"]')
        ?.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  }
  async function landWrites() {
    await act(async () => {
      document
        .querySelector('[role="group"]')
        ?.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  }
  return {scrollTo, landWrites, writes, getLeft: () => left};
}

/** Body cells take focus, as a cell control would. */
const focusableCells: TablePlugin<Item> = {
  rowModel: 'flat',
  transformBodyCell: props => ({
    ...props,
    htmlProps: {...props.htmlProps, tabIndex: 0},
  }),
};
function bodyCell(container: HTMLElement, row: number, column: number) {
  return container.querySelector<HTMLElement>(
    `tbody > tr:nth-child(${row + 1}) > td[aria-colindex="${column + 1}"]`,
  );
}

describe('retained focused column', () => {
  it('keeps the focused cell, with its original element, mounted while its column scrolls out and back', async () => {
    const viewport = controlledViewport();
    const {container} = render(<Fixture extraPlugins={{focusableCells}} />);
    await settle();
    const cell = bodyCell(container, 0, 1);
    expect(cell).not.toBeNull();
    act(() => cell?.focus());
    expect(document.activeElement).toBe(cell);
    await viewport.scrollTo(2000);
    // The range is c18..c26; c1 stays as the one discontiguous column.
    expect(mountedKeys(container)).toEqual(keys(1, ...range(18, 27)));
    expect(document.activeElement).toBe(cell);
    // Three spacers: before c1, between c1 and the range, after the range.
    const header = headerCells(container);
    expect(header.filter(isSpacer)).toHaveLength(3);
    expect(header.map(isSpacer)).toEqual([
      true,
      false,
      true,
      ...range(18, 27).map(() => false),
      true,
    ]);
    expect(header[0].getAttribute('style') ?? '').toContain('100px');
    expect(header[2].getAttribute('style') ?? '').toContain('1600px');
    for (const row of Array.from(container.querySelectorAll('tbody > tr'))) {
      expect(Array.from(row.children).map(isSpacer)).toEqual(
        header.map(isSpacer),
      );
    }
    expect(bodyCell(container, 0, 1)).toBe(cell);
    await viewport.scrollTo(0);
    expect(document.activeElement).toBe(cell);
    expect(mountedKeys(container)).toEqual(keys(...range(0, 7)));
  });

  it('releases the column when focus leaves the table', async () => {
    const viewport = controlledViewport();
    const {container} = render(
      <>
        <Fixture extraPlugins={{focusableCells}} />
        <button type="button">Outside</button>
      </>,
    );
    await settle();
    act(() => bodyCell(container, 0, 1)?.focus());
    await viewport.scrollTo(2000);
    expect(mountedKeys(container)).toContain('c1');
    act(() => screen.getByRole('button', {name: 'Outside'}).focus());
    expect(mountedKeys(container)).toEqual(keys(...range(18, 27)));
  });

  it('transfers retention to the newly focused column', async () => {
    const viewport = controlledViewport();
    const {container} = render(<Fixture extraPlugins={{focusableCells}} />);
    await settle();
    act(() => bodyCell(container, 0, 1)?.focus());
    await viewport.scrollTo(2000);
    const next = bodyCell(container, 2, 20);
    act(() => next?.focus());
    expect(mountedKeys(container)).toEqual(keys(...range(18, 27)));
    await viewport.scrollTo(0);
    expect(mountedKeys(container)).toEqual(keys(...range(0, 7), 20));
    expect(document.activeElement).toBe(next);
  });

  it('returns focus to the scroll area when the focused column is removed', async () => {
    const viewport = controlledViewport();
    const {container, rerender} = render(
      <Fixture extraPlugins={{focusableCells}} />,
    );
    await settle();
    act(() => bodyCell(container, 0, 1)?.focus());
    await viewport.scrollTo(2000);
    rerender(
      <Fixture
        extraPlugins={{focusableCells}}
        tableColumns={columns.filter(column => column.key !== 'c1')}
      />,
    );
    await settle();
    expect(document.activeElement).toBe(
      container.querySelector('[role="group"]'),
    );
  });
});

describe('first-visible-column anchor', () => {
  // 2050px into a run of 100px columns: c20 is first visible, half shown.
  async function mountAt(
    viewport: ReturnType<typeof controlledViewport>,
    props: FixtureProps = {},
  ) {
    const result = render(<Fixture {...props} />);
    await settle();
    await viewport.scrollTo(2050);
    return result;
  }

  it('keeps the first visible column and its offset when an earlier column moves to the end', async () => {
    const viewport = controlledViewport();
    const {rerender, container} = await mountAt(viewport);
    rerender(<Fixture tableColumns={[...columns.slice(1), columns[0]]} />);
    await viewport.landWrites();
    // c20 now starts at 1900px; half of it stays hidden.
    expect(viewport.getLeft()).toBe(1950);
    expect(mountedKeys(container)[2]).toBe('c20');
  });

  it('keeps the first visible column and its offset when earlier columns widen', async () => {
    const viewport = controlledViewport();
    const {rerender} = await mountAt(viewport);
    rerender(
      <Fixture
        tableColumns={columns.map((column, index) =>
          index < 10 ? {...column, width: pixel(150)} : column,
        )}
      />,
    );
    await viewport.landWrites();
    expect(viewport.getLeft()).toBe(2550);
  });

  it('keeps the fractional offset when the anchor column itself widens', async () => {
    const viewport = controlledViewport();
    const {rerender} = await mountAt(viewport);
    rerender(
      <Fixture
        tableColumns={columns.map(column =>
          column.key === 'c20' ? {...column, width: pixel(200)} : column,
        )}
      />,
    );
    await viewport.landWrites();
    // Half of a 200px column.
    expect(viewport.getLeft()).toBe(2100);
  });

  it('keeps the anchor when an earlier column is hidden, and moves to the next column when the anchor is hidden', async () => {
    const viewport = controlledViewport();
    const {rerender} = await mountAt(viewport);
    const withoutC5 = columns.filter(column => column.key !== 'c5');
    rerender(<Fixture tableColumns={withoutC5} />);
    await viewport.landWrites();
    expect(viewport.getLeft()).toBe(1950);
    rerender(
      <Fixture
        tableColumns={withoutC5.filter(column => column.key !== 'c20')}
      />,
    );
    await viewport.landWrites();
    // c21 takes c20's place at 1900px, with the same fraction.
    expect(viewport.getLeft()).toBe(1950);
  });

  it('keeps the first visible column when an earlier column is pinned', async () => {
    const viewport = controlledViewport();
    const {rerender, container} = await mountAt(viewport);
    rerender(<Fixture startKeys={['c0']} />);
    await viewport.landWrites();
    // The run now starts at c1, behind the pinned 100px c0: c20 starts
    // 1900px into the run, half hidden.
    expect(viewport.getLeft()).toBe(1950);
    expect(mountedKeys(container)).toEqual(keys(0, ...range(18, 27)));
  });
});
