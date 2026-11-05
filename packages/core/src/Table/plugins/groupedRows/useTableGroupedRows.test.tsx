// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableGroupedRows.test.tsx
 * @input Table, grouped-row plugin, React testing utilities
 * @output Behavioral, accessibility, composition, and layout regression coverage
 * @position Focused tests for useTableGroupedRows
 */

import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent, within} from '@testing-library/react';
import {useState, useCallback} from 'react';
import {Table} from '../../Table';
import type {TableColumn} from '../../types';
import type {TableRowStatus} from '../../index';
import {useTableRowStatus} from '../rowStatus';
import {useTableGroupedRows} from './useTableGroupedRows';

interface Person extends Record<string, unknown> {
  id: string;
  name: string;
  team: string;
}

const people: Person[] = [
  {id: 'a', name: 'Alice', team: 'Core'},
  {id: 'b', name: 'Bob', team: 'Core'},
  {id: 'c', name: 'Carol', team: 'Infra'},
];

const columns: TableColumn<Person>[] = [{key: 'name', header: 'Name'}];

const EMPTY = new Set<string>();

/** Read the StyleX declarations applied to an element under Vitest. */
function cssDeclarationsOf(element: Element): string[] {
  const classes = new Set(
    (element as HTMLElement).className.split(/\s+/).filter(Boolean),
  );
  const declarations: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      const text = rule.cssText;
      const brace = text.indexOf('{');
      if (brace === -1) {
        continue;
      }
      const selector = text.slice(0, brace).replaceAll(':not(#\\#)', '').trim();
      const match = /^\.([\w-]+)(.*)$/.exec(selector);
      if (!match || !classes.has(match[1])) {
        continue;
      }
      declarations.push(
        text
          .slice(brace + 1, text.lastIndexOf('}'))
          .trim()
          .replace(/;$/, ''),
      );
    }
  }

  return declarations;
}

function hasDeclaration(element: Element, declaration: string): boolean {
  return cssDeclarationsOf(element).some(value => value.includes(declaration));
}

function Harness({
  rows = people,
  initialCollapsed = EMPTY,
  renderGroupHeader,
}: {
  rows?: Person[];
  initialCollapsed?: Set<string>;
  renderGroupHeader?: (
    groupKey: string,
    count: number,
    collapsed: boolean,
  ) => React.ReactNode;
}) {
  const [collapsedGroups, setCollapsed] = useState(initialCollapsed);
  const onToggleGroup = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const grouped = useTableGroupedRows<Person>({
    data: rows,
    groupBy: p => p.team,
    collapsedGroups,
    onToggleGroup,
    getRowKey: p => p.id,
    renderGroupHeader,
  });
  return (
    <Table
      data={grouped.data}
      columns={columns}
      idKey={grouped.idKey}
      plugins={{grouped: grouped.plugin}}
    />
  );
}

describe('useTableGroupedRows', () => {
  it('renders a header row per group with label and count', () => {
    render(<Harness />);
    // Two groups: Core (2), Infra (1).
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText('Infra')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows group members when expanded', () => {
    render(<Harness />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('hides members of a collapsed group but keeps the header', () => {
    render(<Harness initialCollapsed={new Set(['Core'])} />);
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    // Other group unaffected.
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('toggles a group via its chevron and back again', () => {
    render(<Harness />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // The standalone chevron button toggles the group; its accessible name is
    // qualified with the group key.
    fireEvent.click(screen.getByRole('button', {name: 'Collapse group Core'}));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    // Toggle back: the Core chevron now says "Expand group Core".
    fireEvent.click(screen.getByRole('button', {name: 'Expand group Core'}));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('exposes each group toggle as a named, keyboard-operable button', () => {
    render(<Harness />);
    // Native <button>: focusable and operable without a custom key handler.
    const coreToggle = screen.getByRole('button', {
      name: 'Collapse group Core',
    });
    expect(coreToggle.tagName).toBe('BUTTON');
    expect(coreToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps disclosure state on the button, not the native header row', () => {
    render(<Harness initialCollapsed={new Set(['Core'])} />);
    const rows = screen.getAllByRole('row');
    // rows[1] = Core header (collapsed), rows[2] = Infra header (expanded).
    expect(rows[1]).not.toHaveAttribute('aria-expanded');
    expect(rows[2]).not.toHaveAttribute('aria-expanded');

    const coreToggle = screen.getByRole('button', {
      name: 'Expand group Core',
    });
    expect(coreToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(coreToggle);
    expect(
      screen.getByRole('button', {name: 'Collapse group Core'}),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('respects groupOrder in the flattened data', () => {
    function OrderedHarness() {
      const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
      const grouped = useTableGroupedRows<Person>({
        data: people,
        groupBy: p => p.team,
        collapsedGroups: collapsed,
        onToggleGroup: k => setCollapsed(new Set([k])),
        getRowKey: p => p.id,
        groupOrder: ['Infra', 'Core'],
      });
      expect(grouped.data.length).toBeGreaterThan(0);
      return (
        <Table
          data={grouped.data}
          columns={columns}
          idKey={grouped.idKey}
          plugins={{grouped: grouped.plugin}}
        />
      );
    }
    render(<OrderedHarness />);
    const rows = screen.getAllByRole('row');
    // rows[0] = column header; rows[1] = first group header (Infra).
    expect(within(rows[1]).getByText('Infra')).toBeInTheDocument();
  });

  it('renders custom group header content via renderGroupHeader', () => {
    render(
      <Harness
        renderGroupHeader={(key, count, collapsed) => (
          <span>{`${key}::${count}::${collapsed ? 'closed' : 'open'}`}</span>
        )}
      />,
    );
    expect(screen.getByText('Core::2::open')).toBeInTheDocument();
    expect(screen.getByText('Infra::1::open')).toBeInTheDocument();
  });

  it('keeps custom group headers full-width while pinning their chevron', () => {
    const builtIn = render(<Harness />);
    const builtInToggle = screen.getByRole('button', {
      name: 'Collapse group Core',
    });
    const builtInWrapper = builtInToggle.parentElement;
    expect(builtInWrapper).not.toBeNull();
    expect(hasDeclaration(builtInWrapper!, 'position: sticky')).toBe(true);
    expect(hasDeclaration(builtInWrapper!, 'width: fit-content')).toBe(true);
    builtIn.unmount();

    render(<Harness renderGroupHeader={key => <span>{key}</span>} />);
    const customToggle = screen.getByRole('button', {
      name: 'Collapse group Core',
    });
    const customWrapper = customToggle.parentElement;
    expect(customWrapper).not.toBeNull();

    // Preserve the custom renderer's full-row containing block. Only the
    // plugin-owned chevron is sticky, so it remains reachable on horizontal
    // scroll without constraining custom content to fit-content.
    expect(hasDeclaration(customWrapper!, 'position: sticky')).toBe(false);
    expect(hasDeclaration(customWrapper!, 'width: fit-content')).toBe(false);
    expect(hasDeclaration(customToggle, 'position: sticky')).toBe(true);
  });

  it('renders nothing (no group headers) for empty data', () => {
    render(<Harness rows={[]} />);
    // Column header row still renders; no group header rows.
    expect(screen.queryByText('Core')).not.toBeInTheDocument();
    expect(screen.queryByText('Infra')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: /group/i}),
    ).not.toBeInTheDocument();
  });

  it('never runs a column renderCell against a group header row', () => {
    // The renderer that breaks: it keys a lookup off a field rather than
    // printing it, so the header Proxy answering `''` is no better than
    // `undefined`.
    const TEAM_META: Record<string, {dot: string}> = {
      Core: {dot: 'green'},
      Infra: {dot: 'blue'},
    };
    const seen: Person[] = [];
    const lookupColumns: TableColumn<Person>[] = [
      {
        key: 'team',
        header: 'Team',
        renderCell: item => {
          seen.push(item);
          return <span>{TEAM_META[item.team].dot}</span>;
        },
      },
    ];

    function LookupHarness() {
      const [collapsed, setCollapsed] = useState<Set<string>>(EMPTY);
      const grouped = useTableGroupedRows<Person>({
        data: people,
        groupBy: p => p.team,
        collapsedGroups: collapsed,
        onToggleGroup: k => setCollapsed(new Set([k])),
        getRowKey: p => p.id,
      });
      return (
        <Table
          data={grouped.data}
          columns={lookupColumns}
          idKey={grouped.idKey}
          plugins={{grouped: grouped.plugin}}
        />
      );
    }

    expect(() => render(<LookupHarness />)).not.toThrow();
    expect(seen.map(p => p.name)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Infra')).toBeInTheDocument();
  });

  describe.each([
    ['grouped first', true],
    ['rowStatus first', false],
  ])(
    'with a column contributed by another plugin (%s)',
    (_label, groupedFirst) => {
      // `grouped` and `rowStatus` are both absent from PLUGIN_ORDER, so the
      // record's insertion order is the pipeline order. Whichever way round
      // the consumer types it, the status column's renderCell must not see a
      // header row.
      const STATUS_BY_TEAM: Record<string, TableRowStatus> = {
        Core: {color: 'success', label: 'Healthy'},
        Infra: {color: 'error', label: 'Paging'},
      };

      function StatusHarness() {
        const [collapsed, setCollapsed] = useState<Set<string>>(EMPTY);
        const grouped = useTableGroupedRows<Person>({
          data: people,
          groupBy: p => p.team,
          collapsedGroups: collapsed,
          onToggleGroup: k => setCollapsed(new Set([k])),
          getRowKey: p => p.id,
        });
        const rowStatus = useTableRowStatus<Person>({
          getStatus: useCallback((item: Person) => {
            const {color, label} = STATUS_BY_TEAM[item.team];
            return {color, label};
          }, []),
        });
        return (
          <Table
            data={grouped.data}
            columns={columns}
            idKey={grouped.idKey}
            plugins={
              groupedFirst
                ? {grouped: grouped.plugin, rowStatus}
                : {rowStatus, grouped: grouped.plugin}
            }
          />
        );
      }

      it('renders the group headers without throwing', () => {
        expect(() => render(<StatusHarness />)).not.toThrow();
        expect(screen.getByText('Core')).toBeInTheDocument();
        expect(screen.getByText('Infra')).toBeInTheDocument();
        // One indicator per real row, none on the two headers.
        expect(screen.getAllByRole('img')).toHaveLength(3);
      });
    },
  );

  it('keeps a group collapsed across a data change (state keyed by group)', () => {
    function ChangingHarness() {
      const [collapsed, setCollapsed] = useState<Set<string>>(
        new Set(['Core']),
      );
      const [rows, setRows] = useState(people);
      const onToggleGroup = useCallback((key: string) => {
        setCollapsed(prev => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }, []);
      const grouped = useTableGroupedRows<Person>({
        data: rows,
        groupBy: p => p.team,
        collapsedGroups: collapsed,
        onToggleGroup,
        getRowKey: p => p.id,
      });
      return (
        <>
          <button
            type="button"
            onClick={() =>
              setRows([...people, {id: 'd', name: 'Dave', team: 'Core'}])
            }>
            add
          </button>
          <Table
            data={grouped.data}
            columns={columns}
            idKey={grouped.idKey}
            plugins={{grouped: grouped.plugin}}
          />
        </>
      );
    }
    render(<ChangingHarness />);
    // Core collapsed initially: Alice hidden.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    // Add a new Core member; Core must stay collapsed (keyed by group value).
    fireEvent.click(screen.getByText('add'));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Dave')).not.toBeInTheDocument();
    // Count reflects the new member (3), header still present.
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });
});
