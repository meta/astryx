// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useState} from 'react';
import {Table} from '../../Table';
import type {TableColumn} from '../../types';
import {useTableRowExpansion} from './useTableRowExpansion';
import {InternationalizationProvider} from '../../../i18n';

// popover mock for context-menu tests
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

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  bio: string;
}

const rows: Row[] = [
  {id: 'a', name: 'Ada', bio: 'Ada bio'},
  {id: 'b', name: 'Bo', bio: 'Bo bio'},
  {id: 'c', name: 'Cy', bio: 'Cy bio'},
];

const columns: TableColumn<Row>[] = [{key: 'name', header: 'Name'}];

const EMPTY_KEYS = new Set<string>();

const defaultRenderExpanded = (item: Row) => (
  <div data-testid="panel">{`${item.name}: ${item.bio}`}</div>
);

function Harness({
  initialExpanded = EMPTY_KEYS,
  isItemExpandable,
  renderExpanded = defaultRenderExpanded,
  density,
  hasRowClickExpansion,
  columnsOverride,
  panelVariant,
  dividers,
  isStriped,
}: {
  initialExpanded?: Set<string>;
  isItemExpandable?: (item: Row) => boolean;
  renderExpanded?: (item: Row) => React.ReactNode;
  density?: 'compact' | 'balanced' | 'spacious';
  hasRowClickExpansion?: boolean;
  columnsOverride?: TableColumn<Row>[];
  panelVariant?: 'muted' | 'transparent';
  dividers?: 'rows' | 'columns' | 'grid' | 'none';
  isStriped?: boolean;
}) {
  const [expandedKeys, setExpandedKeys] = useState(initialExpanded);
  const expansion = useTableRowExpansion<Row>({
    expandedKeys,
    onToggle: key =>
      setExpandedKeys(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      }),
    getRowKey: item => item.id,
    renderExpanded,
    getIsItemExpandable: isItemExpandable,
    hasRowClickExpansion,
    panelVariant,
  });
  return (
    <Table
      data={rows}
      columns={columnsOverride ?? columns}
      idKey="id"
      density={density}
      dividers={dividers}
      isStriped={isStriped}
      plugins={{expansion}}
    />
  );
}

describe('useTableRowExpansion (detail panel)', () => {
  it('renders an "Expand row" chevron button for every expandable row', () => {
    render(<Harness />);
    expect(screen.getAllByRole('button', {name: /expand row/i})).toHaveLength(
      3,
    );
  });

  it('does not render the detail panel while collapsed', () => {
    render(<Harness />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('renders the detail panel below the row when expanded', () => {
    render(<Harness initialExpanded={new Set(['a'])} />);
    const panel = screen.getByTestId('panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Ada: Ada bio');
  });

  it('renders renderExpanded content with the row item', () => {
    render(
      <Harness
        initialExpanded={new Set(['b'])}
        renderExpanded={item => <span data-testid="panel">bio={item.bio}</span>}
      />,
    );
    expect(screen.getByTestId('panel')).toHaveTextContent('bio=Bo bio');
  });

  it('toggles the panel open on chevron click', () => {
    render(<Harness />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', {name: /expand row/i})[0]);
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('relabels the chevron "Collapse row" and sets aria-expanded when open', () => {
    render(<Harness initialExpanded={new Set(['a'])} />);
    const collapse = screen.getByRole('button', {name: /collapse row/i});
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the chevron aria-expanded=false when collapsed', () => {
    render(<Harness />);
    expect(
      screen.getAllByRole('button', {name: /expand row/i})[0],
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders one detail panel per expanded row', () => {
    render(<Harness initialExpanded={new Set(['a', 'c'])} />);
    expect(screen.getAllByTestId('panel')).toHaveLength(2);
  });

  it('renders the expanded panel as a full-width cell spanning all columns', () => {
    const multiCol: TableColumn<Row>[] = [
      {key: 'name', header: 'Name'},
      {key: 'bio', header: 'Bio'},
    ];
    function H() {
      const [keys, setKeys] = useState(new Set(['a']));
      const expansion = useTableRowExpansion<Row>({
        expandedKeys: keys,
        onToggle: () => setKeys(keys),
        getRowKey: item => item.id,
        renderExpanded: item => <div data-testid="panel">{item.bio}</div>,
      });
      return (
        <Table
          data={rows}
          columns={multiCol}
          idKey="id"
          plugins={{expansion}}
        />
      );
    }
    render(<H />);
    const panelCell = screen.getByTestId('panel').closest('td');
    expect(panelCell).not.toBeNull();
    // 2 user columns + 1 injected chevron column = colSpan 3
    expect(panelCell).toHaveAttribute('colspan', '3');
  });

  it('hides the chevron for non-expandable rows and never shows their panel', () => {
    render(<Harness isItemExpandable={item => item.id !== 'b'} />);
    // Only a and c are expandable
    expect(screen.getAllByRole('button', {name: /expand row/i})).toHaveLength(
      2,
    );
  });

  it('does not render a panel for a non-expandable row even if its key is in expandedKeys', () => {
    render(
      <Harness
        initialExpanded={new Set(['b'])}
        isItemExpandable={item => item.id !== 'b'}
      />,
    );
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('contributes a context-menu action on expandable rows', () => {
    render(<Harness />);
    fireEvent.contextMenu(screen.getByText('Ada'));
    expect(
      screen.getAllByRole('menuitem', {name: /expand row/i, hidden: true})
        .length,
    ).toBeGreaterThan(0);
  });

  it('turns the glyph without turning the button beneath it', () => {
    // The button is the hit target and carries the hover chip. Rotating it
    // swings that rounded rectangle around with the arrow, so the transform
    // has to sit on the glyph instead.
    render(<Harness initialExpanded={new Set(['a'])} />);
    const button = screen.getAllByRole('button', {name: /collapse row/i})[0];
    const glyph = button.querySelector('svg')?.parentElement;
    expect(glyph).toHaveStyle({transform: 'rotate(90deg)'});
    expect(button).not.toHaveStyle({transform: 'rotate(90deg)'});
  });

  it('starts the panel at the first column, not at the row edge', () => {
    // Left to itself the panel begins under the chevron, a column to the left
    // of every label it describes. It should start where the first column's
    // content does: the chevron column's width plus a cell's own padding.
    render(<Harness initialExpanded={new Set(['a'])} />);
    expect(screen.getByTestId('panel').closest('td')).toHaveStyle({
      paddingInlineStart: 'calc(40px + var(--spacing-3))',
    });
  });

  it('tracks the table density it is rendered at', () => {
    render(<Harness initialExpanded={new Set(['a'])} density="spacious" />);
    expect(screen.getByTestId('panel').closest('td')).toHaveStyle({
      paddingInlineStart: 'calc(40px + var(--spacing-4))',
    });
  });

  it("indents the panel by the chevron column's own width", () => {
    // The column width is a number the layout does arithmetic on, so it stays
    // in pixels at every root font size. The panel's indent has to line up
    // with the first column, so it spells the same pixels, not a rem spacing
    // token. Pin the two together so neither can move without the other.
    render(<Harness initialExpanded={new Set(['a'])} />);
    const chevronHeader = screen.getAllByRole('columnheader')[0];
    const columnWidth = getComputedStyle(chevronHeader).width;
    const panelCell = screen
      .getByTestId('panel')
      .closest('td') as HTMLTableCellElement;
    expect(columnWidth).toBe('40px');
    expect(getComputedStyle(panelCell).paddingInlineStart).toMatch(
      new RegExp(`^calc\\(${columnWidth} \\+ `),
    );
  });

  it('keeps the chevron column free of the cell insets', () => {
    // The column is fixed pixels while a cell's insets follow the spacing
    // scale; laid out after them, the button ran past the column's edge. The
    // body cell drops its own inline-start inset (the button then centers
    // itself; the browser spec measures that), and the header cell drops both.
    render(<Harness initialExpanded={new Set(['a'])} />);
    const button = screen.getAllByRole('button', {name: /collapse row/i})[0];
    expect(
      getComputedStyle(button.closest('td') as HTMLTableCellElement)
        .paddingInlineStart,
    ).toMatch(/^0(px)?$/);
    // The header cell holds only a hidden label; its insets alone would
    // outgrow the 40px column at a large root font size.
    const header = getComputedStyle(screen.getAllByRole('columnheader')[0]);
    expect(header.paddingInlineStart).toMatch(/^0(px)?$/);
    expect(header.paddingInlineEnd).toMatch(/^0(px)?$/);
  });

  describe('row divider placement', () => {
    const panelCell = () =>
      screen.getByTestId('panel').closest('td') as HTMLTableCellElement;
    const cellsOf = (name: string) => [
      ...(screen.getByText(name).closest('tr') as HTMLTableRowElement).cells,
    ];

    it('closes the pair below the panel rather than splitting it', () => {
      // The row and its panel are one unit. A divider between them cuts the
      // row off from the detail it opened, and leaves the panel running flush
      // into the next row — the wrong way round on both counts.
      render(<Harness initialExpanded={new Set(['a'])} />);
      for (const cell of cellsOf('Ada')) {
        expect(cell).toHaveStyle({borderBottomWidth: '0'});
      }
      // The token width, unless the row hands down its own.
      expect(getComputedStyle(panelCell()).borderBottomWidth).toMatch(
        /var\(--_table-panel-divider-width,\s*var\(--border-width\)\)/,
      );
    });

    it('leaves collapsed rows keeping their own divider', () => {
      render(<Harness initialExpanded={new Set(['a'])} />);
      for (const cell of cellsOf('Bo')) {
        expect(cell).not.toHaveStyle({borderBottomWidth: '0'});
      }
    });

    it('draws no panel divider on a table without row dividers', () => {
      render(<Harness initialExpanded={new Set(['a'])} dividers="none" />);
      expect(getComputedStyle(panelCell()).borderBottomWidth).not.toMatch(
        /--border-width/,
      );
    });

    it('reads the colour mode once per table, however many panels are open', () => {
      const original = window.matchMedia;
      const listeners = (open: Set<string>) => {
        let count = 0;
        window.matchMedia = (query: string) => {
          const list = original
            ? original(query)
            : ({matches: false, media: query} as MediaQueryList);
          return {
            ...list,
            matches: list.matches,
            media: query,
            addEventListener: () => {
              count += 1;
            },
            removeEventListener: () => {},
            addListener: () => {
              count += 1;
            },
            removeListener: () => {},
          } as MediaQueryList;
        };
        const {unmount} = render(<Harness initialExpanded={open} />);
        unmount();
        return count;
      };
      try {
        expect(listeners(new Set(['a', 'b', 'c']))).toBe(
          listeners(new Set(['a'])),
        );
      } finally {
        window.matchMedia = original;
      }
    });

    it("carries the row's own divider onto the panel (Table FR14)", () => {
      render(<Harness />);
      const row = cellsOf('Ada')[0].parentElement as HTMLTableRowElement;
      // An app's (or a theme's) border on the row's cells.
      for (const cell of row.cells) {
        cell.style.borderBottomColor = 'rgb(255, 0, 0)';
        cell.style.borderBottomStyle = 'dashed';
      }
      fireEvent.click(screen.getAllByRole('button', {name: /expand/i})[0]);
      const cell = panelCell();
      expect(cell.style.getPropertyValue('--_table-panel-divider-color')).toBe(
        'rgb(255, 0, 0)',
      );
      expect(cell.style.getPropertyValue('--_table-panel-divider-style')).toBe(
        'dashed',
      );
      // The panel keeps its own width (a value, never inherited from a panel
      // around it) while the row's own border does not win.
      expect(cell.style.getPropertyValue('--_table-panel-divider-width')).toBe(
        'initial',
      );
      // A width set on the row's cells is the divider's too.
      for (const rowCell of row.cells) {
        rowCell.style.borderBottomWidth = '3px';
      }
      fireEvent.click(screen.getAllByRole('button', {name: /expand/i})[0]);
      expect(cell.style.getPropertyValue('--_table-panel-divider-width')).toBe(
        '3px',
      );
      fireEvent.click(screen.getAllByRole('button', {name: /collapse/i})[1]);
      for (const rowCell of row.cells) {
        rowCell.style.borderBottomWidth = '';
      }
      // An app's wider border on the row itself wins; the next commit
      // (opening another row) reads it.
      row.style.borderBottom = '3px solid rgb(0, 0, 255)';
      fireEvent.click(screen.getAllByRole('button', {name: /expand/i})[0]);
      expect(cell.style.getPropertyValue('--_table-panel-divider-width')).toBe(
        '3px',
      );
      expect(cell.style.getPropertyValue('--_table-panel-divider-color')).toBe(
        'rgb(0, 0, 255)',
      );
    });

    it('draws the panel divider under grid dividers too', () => {
      render(<Harness initialExpanded={new Set(['a'])} dividers="grid" />);
      // The token width, unless the row hands down its own.
      expect(getComputedStyle(panelCell()).borderBottomWidth).toMatch(
        /var\(--_table-panel-divider-width,\s*var\(--border-width\)\)/,
      );
    });
  });

  describe('panel variant', () => {
    const panelRow = () =>
      screen.getByTestId('panel').closest('tr') as HTMLTableRowElement;

    it('leaves the panel on the surface behind the table by default', () => {
      // The panel is the row's continuation, not a surface of its own: it
      // takes whatever the table sits on, the way the row does.
      render(<Harness initialExpanded={new Set(['a'])} />);
      expect(panelRow()).not.toHaveStyle({
        backgroundColor: 'var(--color-background-muted)',
      });
    });

    it('washes the panel when muted is asked for', () => {
      render(<Harness initialExpanded={new Set(['a'])} panelVariant="muted" />);
      expect(panelRow()).toHaveStyle({
        backgroundColor: 'var(--color-background-muted)',
      });
    });
  });

  describe('zebra striping', () => {
    /**
     * jsdom's selector engine does not implement `:nth-child(… of S)` — it
     * matches nothing and reports no error — so the paint itself cannot be
     * asserted here; the browser-side check is the visual regression suite.
     * What this can pin is the two halves of the contract: the panel is a
     * sibling row in the same tbody (which is what makes an exclusion
     * necessary at all), and every stripe rule counts only rows that are not
     * panels.
     */
    const stripeRules = () => {
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule.cssText.includes(':nth-child(even')) {
              out.push(rule.cssText);
            }
          }
        } catch {
          // cross-origin sheet; nothing of ours lives there
        }
      }
      return out;
    };

    it('counts stripes over data rows only, so an open panel cannot flip them', () => {
      render(<Harness isStriped initialExpanded={new Set(['a'])} />);

      // The panel really is a row among the rows — left in the count, it takes
      // the stripe meant for the row below it and inverts everything after.
      const bodyRows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>('tbody > tr'),
      );
      expect(bodyRows).toHaveLength(4);
      expect(bodyRows[1]).toHaveAttribute('data-expansion-panel');

      const rules = stripeRules();
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule).toContain('of :not([data-expansion-panel])');
      }
    });

    it('marks the panel row so the stripe rule can skip it', () => {
      // The attribute is what the selector keys off, so it is contract, not
      // decoration — losing it silently restores the parity shift above.
      render(<Harness initialExpanded={new Set(['a'])} isStriped />);
      const panels = Array.from(
        document.querySelectorAll<HTMLTableRowElement>('tbody tr'),
      ).filter(r => r.hasAttribute('data-expansion-panel'));
      expect(panels).toHaveLength(1);
      expect(panels[0]).toHaveTextContent('Ada: Ada bio');
    });
  });

  describe('whole-row-click expansion', () => {
    const rowFor = (name: string) =>
      screen.getByText(name).closest('tr') as HTMLTableRowElement;

    it('leaves the row body inert by default', () => {
      render(<Harness />);
      fireEvent.click(screen.getByText('Ada'));
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('expands a collapsed row when its body is clicked', () => {
      // The collapsed row is the one that has to respond: the early return
      // that skips panel rendering must not skip the click handler with it.
      render(<Harness hasRowClickExpansion />);
      fireEvent.click(screen.getByText('Ada'));
      expect(screen.getByTestId('panel')).toHaveTextContent('Ada: Ada bio');
    });

    it('collapses an expanded row when its body is clicked', () => {
      render(<Harness hasRowClickExpansion initialExpanded={new Set(['a'])} />);
      fireEvent.click(screen.getByText('Ada'));
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('does not double-toggle when the chevron itself is clicked', () => {
      // The chevron stops propagation, so the row handler must not also fire —
      // two toggles would land back where they started.
      render(<Harness hasRowClickExpansion />);
      fireEvent.click(screen.getAllByRole('button', {name: /expand row/i})[0]);
      expect(screen.getByTestId('panel')).toBeInTheDocument();
    });

    it('yields to interactive cell content', () => {
      // A composed link or action button does not stop propagation the way the
      // chevron does, so the row handler has to check what was hit.
      const onAction = vi.fn();
      render(
        <Harness
          hasRowClickExpansion
          columnsOverride={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <button type="button" onClick={onAction}>
                  {`Act on ${item.name}`}
                </button>
              ),
            },
          ]}
        />,
      );
      fireEvent.click(screen.getByText('Act on Ada'));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('yields to a contenteditable cell', () => {
      render(
        <Harness
          hasRowClickExpansion
          columnsOverride={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div contentEditable data-testid={`editable-${item.id}`}>
                  {item.name}
                </div>
              ),
            },
          ]}
        />,
      );
      fireEvent.click(screen.getByTestId('editable-a'));
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('yields to a nested element inside a contenteditable cell', () => {
      render(
        <Harness
          hasRowClickExpansion
          columnsOverride={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div contentEditable>
                  <span data-testid={`inner-${item.id}`}>{item.name}</span>
                </div>
              ),
            },
          ]}
        />,
      );
      fireEvent.click(screen.getByTestId('inner-a'));
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('does not yield to contenteditable="false"', () => {
      render(
        <Harness
          hasRowClickExpansion
          columnsOverride={[
            {
              key: 'name',
              header: 'Name',
              renderCell: item => (
                <div
                  contentEditable="false"
                  data-testid={`readonly-${item.id}`}>
                  {item.name}
                </div>
              ),
            },
          ]}
        />,
      );
      fireEvent.click(screen.getByTestId('readonly-a'));
      expect(screen.getByTestId('panel')).toHaveTextContent('Ada: Ada bio');
    });

    it('yields to a text selection', () => {
      // Dragging across a cell to copy it ends in a click. Toggling then would
      // shift the row out from under the text the reader just selected. The
      // selection has to be anchored inside the row: one somewhere else on the
      // page is not this row's business, which is why the shared guard scopes
      // it to the node rather than asking the document for any selection.
      render(<Harness hasRowClickExpansion />);
      const cell = screen.getByText('Ada');
      const selection = {
        isCollapsed: false,
        anchorNode: cell.firstChild ?? cell,
        toString: () => 'Ada',
      } as unknown as Selection;
      const spy = vi.spyOn(document, 'getSelection').mockReturnValue(selection);
      fireEvent.click(cell);
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
      spy.mockRestore();
    });

    it('toggles despite a text selection somewhere else on the page', () => {
      // The old guard asked the document for any selection at all, so text
      // selected in a sidebar made every row in the table inert.
      render(<Harness hasRowClickExpansion />);
      const outside = document.createElement('p');
      outside.textContent = 'elsewhere';
      document.body.appendChild(outside);
      const selection = {
        isCollapsed: false,
        anchorNode: outside.firstChild,
        toString: () => 'elsewhere',
      } as unknown as Selection;
      const spy = vi.spyOn(document, 'getSelection').mockReturnValue(selection);
      fireEvent.click(screen.getByText('Ada'));
      expect(screen.getByTestId('panel')).toBeInTheDocument();
      spy.mockRestore();
      outside.remove();
    });

    it('leaves non-expandable rows inert', () => {
      render(
        <Harness
          hasRowClickExpansion
          isItemExpandable={item => item.id !== 'a'}
        />,
      );
      fireEvent.click(screen.getByText('Ada'));
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Bo'));
      expect(screen.getByTestId('panel')).toHaveTextContent('Bo: Bo bio');
    });

    it('marks the row as interactive only when the click is wired up', () => {
      const {unmount} = render(<Harness hasRowClickExpansion />);
      expect(rowFor('Ada')).toHaveStyle({cursor: 'pointer'});
      unmount();
      render(<Harness />);
      expect(rowFor('Ada')).not.toHaveStyle({cursor: 'pointer'});
    });
  });

  it('localizes the chevron aria-label through the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {'@astryx.tableRowExpansion.expandRow': 'Développer la ligne'},
        }}>
        <Harness />
      </InternationalizationProvider>,
    );
    expect(
      screen.getAllByRole('button', {name: 'Développer la ligne'}).length,
    ).toBeGreaterThan(0);
  });
});
