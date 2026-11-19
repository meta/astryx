// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A body row carries the `table-row` target's `parity` visual prop
 * (`data-parity`) and, in a striped table, its `striped` state
 * (`data-striped`), so a theme can style either stripe.
 */
import {cleanup, render} from '@testing-library/react';
import {useState, type ReactNode} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableCell} from './TableCell';
import {TableHeader} from './TableHeader';
import {TableHeaderCell} from './TableHeaderCell';
import {TableFooter} from './TableFooter';
import {TableRow} from './TableRow';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
import {useTableRowExpansion} from './plugins/rowExpansion/useTableRowExpansion';
import {useTableStickyColumns} from './plugins/stickyColumns/useTableStickyColumns';
import {pixel} from './columnUtils';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

afterEach(cleanup);

interface Person extends Record<string, unknown> {
  id: string;
  name: string;
}

const people: Person[] = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'].map(name => ({
  id: name.toLowerCase(),
  name,
}));
const columns = [{key: 'name', header: 'Name'}];

function bodyRows(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'tbody tr:not([aria-hidden]):not([data-expansion-panel])',
    ),
  ];
}

function parities(rows: HTMLElement[]): (string | null)[] {
  return rows.map(row => row.getAttribute('data-parity'));
}

/** A body row element (a call, not a component: TableBody counts `TableRow`s). */
function row(name: string, key?: string) {
  return (
    <TableRow key={key}>
      <TableCell>{name}</TableCell>
    </TableRow>
  );
}

describe('table-row parity in a data-driven table', () => {
  it('marks body rows odd, even, odd… from the first body row', () => {
    const {container} = render(
      <Table data={people} columns={columns} idKey="id" />,
    );
    expect(parities(bodyRows(container))).toEqual([
      'odd',
      'even',
      'odd',
      'even',
      'odd',
    ]);
  });

  it('gives the header row no parity and no striped state', () => {
    const {container} = render(
      <Table data={people} columns={columns} idKey="id" isStriped />,
    );
    const header = container.querySelector('thead tr')!;
    expect(header).not.toHaveAttribute('data-parity');
    expect(header).not.toHaveAttribute('data-striped');
  });

  it('marks body rows striped only when the table is striped', () => {
    const {container, rerender} = render(
      <Table data={people} columns={columns} idKey="id" />,
    );
    for (const row of bodyRows(container)) {
      expect(row).not.toHaveAttribute('data-striped');
    }
    rerender(<Table data={people} columns={columns} idKey="id" isStriped />);
    for (const row of bodyRows(container)) {
      expect(row).toHaveAttribute('data-striped', 'striped');
    }
  });

  it('keeps each row on its display stripe after the data is reordered', () => {
    const {container, rerender} = render(
      <Table data={people} columns={columns} idKey="id" />,
    );
    const reversed = [...people].reverse();
    rerender(<Table data={reversed} columns={columns} idKey="id" />);
    const rows = bodyRows(container);
    expect(rows.map(row => row.textContent)).toEqual(
      reversed.map(person => person.name),
    );
    expect(parities(rows)).toEqual(['odd', 'even', 'odd', 'even', 'odd']);
  });

  it('does not count an open expansion panel as a row', () => {
    function Expanding() {
      const [open, setOpen] = useState(new Set<string>(['ada']));
      const expansion = useTableRowExpansion<Person>({
        expandedKeys: open,
        onToggle: key =>
          setOpen(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
              next.delete(key);
            } else {
              next.add(key);
            }
            return next;
          }),
        getRowKey: person => person.id,
        renderExpanded: person => <div>{`${person.name} details`}</div>,
      });
      return (
        <Table
          data={people}
          columns={columns}
          idKey="id"
          isStriped
          plugins={{expansion}}
        />
      );
    }
    const {container} = render(<Expanding />);
    const panel = container.querySelector('tr[data-expansion-panel]')!;
    expect(panel).not.toHaveAttribute('data-parity');
    expect(parities(bodyRows(container))).toEqual([
      'odd',
      'even',
      'odd',
      'even',
      'odd',
    ]);
  });

  it("reaches a pinned column: a theme's row fill also writes the --table-row-overlay a pinned cell replays", () => {
    function Pinned() {
      const sticky = useTableStickyColumns<Person>({startKeys: ['name']});
      return (
        <Table
          data={people}
          columns={[
            {key: 'name', header: 'Name', width: pixel(160)},
            {key: 'id', header: 'Id', width: pixel(160)},
          ]}
          idKey="id"
          isStriped
          plugins={{stickyColumns: sticky}}
        />
      );
    }
    const {container} = render(<Pinned />);
    const rows = bodyRows(container);
    // Every row says its stripe, the pinned cell in it included.
    expect(parities(rows)).toEqual(['odd', 'even', 'odd', 'even', 'odd']);
    for (const tr of rows) {
      expect(tr.querySelector<HTMLElement>('td')?.style.insetInlineStart).toBe(
        '0px',
      );
    }
    // A pinned cell paints an opaque base plus the row's
    // --table-row-overlay: a theme's row fill, at rest and in :hover, writes
    // that variable too.
    const css = generateThemeCSS(
      defineTheme({
        name: 'zebra',
        components: {
          'table-row': {
            base: {':hover': {backgroundColor: '#f5f5f5'}},
            'parity:odd+striped': {backgroundColor: '#f9f9f9'},
          },
        },
      }),
    ).component;
    const stripe =
      /\.astryx-table-row\[data-parity="odd"\]\[data-striped="striped"\] \{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(stripe).toMatch(/background-color:\s*#f9f9f9/);
    expect(stripe).toMatch(/--table-row-overlay:\s*#f9f9f9/);
    const hover = /\.astryx-table-row:hover[^{]*\{([^}]*)\}/.exec(css)?.[1];
    expect(hover).toMatch(/--table-row-overlay:\s*#f5f5f5/);
  });

  it('reads parity from the logical row in a windowed table', () => {
    const data = Array.from({length: 40}, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }));
    function Windowed() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 40,
        initialViewportHeight: 200,
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          isStriped
          virtualization={virtualization}
        />
      );
    }
    const {container} = render(<Windowed />);
    const rows = bodyRows(container);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(data.length);
    for (const row of rows) {
      const index = Number(row.getAttribute('data-table-logical-index'));
      expect(row).toHaveAttribute(
        'data-parity',
        index % 2 === 0 ? 'odd' : 'even',
      );
    }
  });
});

describe('table-row parity in a children-mode table', () => {
  function ChildrenTable({body}: {body: ReactNode}) {
    return (
      <Table isStriped>
        <TableHeader>
          <TableRow isHeaderRow>
            <TableHeaderCell>Name</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );
  }

  it("gives body rows the striped state but no parity: their position is the caller's", () => {
    const showBo = false;
    const {container} = render(
      <ChildrenTable
        body={
          <>
            {row('Ada')}
            {showBo && row('Bo')}
            {row('Cy')}
          </>
        }
      />,
    );
    const rows = bodyRows(container);
    expect(rows.map(tr => tr.textContent)).toEqual(['Ada', 'Cy']);
    expect(parities(rows)).toEqual([null, null]);
    for (const tr of rows) {
      expect(tr).toHaveAttribute('data-striped', 'striped');
    }
  });

  it('marks every footer row of a striped table striped, the rows Core may stripe, and gives none parity', () => {
    const {container} = render(
      <Table isStriped>
        <TableHeader>
          <TableRow isHeaderRow>
            <TableHeaderCell>Name</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>{row('Ada')}</TableBody>
        <TableFooter>
          {row('Subtotal')}
          {row('Total')}
        </TableFooter>
      </Table>,
    );
    const header = container.querySelector('thead tr')!;
    expect(header).not.toHaveAttribute('data-parity');
    expect(header).not.toHaveAttribute('data-striped');
    const footer = [...container.querySelectorAll('tfoot tr')];
    expect(footer).toHaveLength(2);
    for (const tr of footer) {
      expect(tr).toHaveAttribute('data-striped', 'striped');
      expect(tr).not.toHaveAttribute('data-parity');
    }
    // The footer row Core paints with its stripe is one a theme's striped
    // rule reaches.
    expect(
      footer.map(tr =>
        tr.matches(
          '[data-striped="striped"]:nth-child(even of :not([data-expansion-panel]))',
        ),
      ),
    ).toEqual([false, true]);
  });

  it('starts a table nested in a body cell outside any body', () => {
    // The outer table is data-driven, so its rows hand down a stripe; the
    // inner table's header and footer rows must not take it.
    const {container} = render(
      <Table
        data={[{id: 'a', name: 'Ada'}]}
        idKey="id"
        isStriped
        columns={[
          {
            key: 'name',
            header: 'Name',
            renderCell: () => (
              <Table>
                <TableHeader>
                  <TableRow isHeaderRow>
                    <TableHeaderCell>Inner</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableFooter>{row('Inner total')}</TableFooter>
              </Table>
            ),
          },
        ]}
      />,
    );
    const outer = container.querySelector('table tbody tr')!;
    expect(outer).toHaveAttribute('data-parity', 'odd');
    for (const tr of container.querySelectorAll('table table tr')) {
      expect(tr).not.toHaveAttribute('data-parity');
      // The inner table is not striped.
      expect(tr).not.toHaveAttribute('data-striped');
    }
  });

  it('adds nothing to a row outside a Table', () => {
    const {container} = render(
      <table>
        <TableBody>{row('Ada')}</TableBody>
      </table>,
    );
    const tr = container.querySelector('tr')!;
    expect(tr).not.toHaveAttribute('data-parity');
    expect(tr).not.toHaveAttribute('data-striped');
  });
});

describe('a theme styles a stripe', () => {
  it("matches a theme's parity:odd+striped rule on odd rows of a striped table only", () => {
    const css = generateThemeCSS(
      defineTheme({
        name: 'zebra',
        components: {
          'table-row': {'parity:odd+striped': {backgroundColor: '#f9f9f9'}},
        },
      }),
    ).component;
    const selector = /(\.astryx-table-row\[[^{]+\]) \{/.exec(css)?.[1];
    expect(selector).toBe(
      '.astryx-table-row[data-parity="odd"][data-striped="striped"]',
    );
    const {container} = render(
      <>
        <Table data={people} columns={columns} idKey="id" isStriped />
        <Table data={people} columns={columns} idKey="id" />
      </>,
    );
    const [striped, plain] = container.querySelectorAll<HTMLElement>('table');
    expect(bodyRows(striped).map(tr => tr.matches(selector as string))).toEqual(
      [true, false, true, false, true],
    );
    for (const tr of bodyRows(plain)) {
      expect(tr.matches(selector as string)).toBe(false);
    }
  });
});
