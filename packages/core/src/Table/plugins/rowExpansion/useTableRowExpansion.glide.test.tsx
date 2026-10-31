// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableRowExpansion.glide.test.tsx
 * @input useTableRowExpansion with and without an `animatedLayout` handle, a
 *   stubbed layout, recorded Web Animations
 * @output Verifies that opening a row's panel glides the rows after it with
 *   a handle (the chevron on the same motion), changes nothing without one,
 *   and that a gliding row is marked for its moving divider only while it
 *   moves (`spec:AST-105` FR1, FR2)
 * @position Table row-expansion adoption of the size-change module
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useRef, useState} from 'react';
import {Table} from '../../Table';
import {pixel} from '../../columnUtils';
import type {TableColumn} from '../../types';
import {useTableRowExpansion} from './useTableRowExpansion';
import {useAnimatedLayout} from '../../../hooks/useAnimatedLayout';
import {markGlidingRows, rowEdge} from '../../glidingDivider';

type Row = {id: string; name: string};
const rows: Row[] = [
  {id: 'a', name: 'Alpha'},
  {id: 'b', name: 'Bravo'},
  {id: 'c', name: 'Charlie'},
];
const columns: TableColumn<Row>[] = [
  {key: 'name', header: 'Name', width: pixel(200)},
];

let animated: Element[] = [];
const originalAnimate = Element.prototype.animate;

beforeEach(() => {
  animated = [];
  Element.prototype.animate = function animate(this: Element) {
    animated.push(this);
    return {
      cancel() {},
      addEventListener() {},
      finished: Promise.resolve(),
    } as unknown as Animation;
  };
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  vi.restoreAllMocks();
});

function ExpandableTable({
  withHandle,
  dividers,
}: {
  withHandle: boolean;
  dividers?: 'rows' | 'columns' | 'grid';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const [expandedKeys, setExpandedKeys] = useState(() => new Set<string>());
  const expansion = useTableRowExpansion<Row>({
    expandedKeys,
    onToggle: key =>
      setExpandedKeys(previous => {
        const next = new Set(previous);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      }),
    getRowKey: row => row.id,
    renderExpanded: row => <p>Details for {row.name}</p>,
    animatedLayout: withHandle ? animatedLayout : undefined,
  });
  return (
    <div ref={containerRef} data-testid="area">
      <Table
        data={rows}
        columns={columns}
        idKey="id"
        dividers={dividers}
        plugins={{rowExpansion: expansion}}
      />
    </div>
  );
}

/** The area, and the row after the first, report a layout; it moves down. */
function stubGeometry() {
  vi.spyOn(screen.getByTestId('area'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 600),
  );
  const next = document.querySelector('tr[data-expansion-key="b"]')!;
  let reads = 0;
  vi.spyOn(next, 'getBoundingClientRect').mockImplementation(() => {
    reads += 1;
    // The first read is the measurement before the panel opens.
    return new DOMRect(0, reads === 1 ? 40 : 120, 400, 40);
  });
  return next;
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useTableRowExpansion adopts animatedLayout (spec:AST-105 FR1, FR2)', () => {
  it('glides the rows after an opening panel, with a handle', async () => {
    const user = userEvent.setup();
    render(<ExpandableTable withHandle />);
    const next = stubGeometry();
    await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
    await flush();
    expect(animated).toContain(next);
    // The chevron turns on the glide's motion.
    expect(
      document
        .querySelector<HTMLElement>('[data-expansion-toggle] > *')
        ?.style.getPropertyValue('transition-timing-function'),
    ).toMatch(/^linear\(/);
  });

  it.each(['columns', 'grid'] as const)(
    'changes everything at once with %s dividers, even with a handle (Table FR15)',
    async dividers => {
      const user = userEvent.setup();
      render(<ExpandableTable withHandle dividers={dividers} />);
      stubGeometry();
      await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
      await flush();
      // No glide, no panel entrance, and the chevron keeps the theme's turn.
      expect(animated).toEqual([]);
      expect(
        document
          .querySelector<HTMLElement>('[data-expansion-toggle] > *')
          ?.style.getPropertyValue('transition-timing-function'),
      ).toBe('');
    },
  );

  it.each(['columns', 'grid'] as const)(
    'takes the spring off a chevron when the table turns to %s dividers',
    async dividers => {
      const user = userEvent.setup();
      const {rerender} = render(<ExpandableTable withHandle dividers="rows" />);
      stubGeometry();
      await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
      await flush();
      const glyph = document.querySelector<HTMLElement>(
        '[data-expansion-toggle] > *',
      );
      expect(
        glyph?.style.getPropertyValue('transition-timing-function'),
      ).toMatch(/^linear\(/);
      rerender(<ExpandableTable withHandle dividers={dividers} />);
      expect(glyph?.style.getPropertyValue('transition-timing-function')).toBe(
        '',
      );
    },
  );

  it('changes nothing without a handle', async () => {
    const user = userEvent.setup();
    render(<ExpandableTable withHandle={false} />);
    stubGeometry();
    await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
    await flush();
    expect(animated).toEqual([]);
  });
});

describe('an open panel carries its row divider (Table FR14)', () => {
  it("takes the row's own cell border, a theme's or an app's, and the row's own border where it wins", async () => {
    const user = userEvent.setup();
    render(<ExpandableTable withHandle={false} />);
    const row = document.querySelector<HTMLElement>(
      'tr[data-expansion-key="a"]',
    )!;
    // An app's (or a theme's) border on the row's cells.
    for (const cell of row.querySelectorAll('td')) {
      cell.style.borderBottomColor = 'rgb(255, 0, 0)';
      cell.style.borderBottomStyle = 'dashed';
    }
    await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
    const panel = document.querySelector<HTMLElement>(
      'tr[data-expansion-panel] > td',
    )!;
    // The panel keeps its own width (a value, not inherited from any panel
    // around it) while the row's own border does not win.
    expect(panel.style.getPropertyValue('--_table-panel-divider-width')).toBe(
      'initial',
    );
    expect(panel.style.getPropertyValue('--_table-panel-divider-color')).toBe(
      'rgb(255, 0, 0)',
    );
    expect(panel.style.getPropertyValue('--_table-panel-divider-style')).toBe(
      'dashed',
    );
    // An app's own border on the row wins the collapse when it is wider;
    // the next commit (opening another row) reads it.
    row.style.borderBottom = '3px solid rgb(0, 0, 255)';
    await user.click(screen.getAllByRole('button', {name: /expand/i})[0]);
    expect(panel.style.getPropertyValue('--_table-panel-divider-width')).toBe(
      '3px',
    );
    expect(panel.style.getPropertyValue('--_table-panel-divider-color')).toBe(
      'rgb(0, 0, 255)',
    );
  });
});

describe('markGlidingRows', () => {
  it('marks the moving rows and carries their divider while they move, and clears both after', async () => {
    const body = document.createElement('tbody');
    // Each row: a pinned cell, then two that scroll with it.
    const rows = [0, 1, 2, 3, 4].map(() => {
      const row = document.createElement('tr');
      const pinned = document.createElement('td');
      pinned.setAttribute('data-astryx-table-pinned', '');
      row.append(
        pinned,
        document.createElement('td'),
        document.createElement('td'),
      );
      body.append(row);
      return row;
    });
    // A table nested in a moving row keeps its own dividers.
    const nested = document.createElement('table');
    nested.innerHTML = '<tbody><tr><td></td></tr></tbody>';
    rows[2].cells[1].append(nested);
    const cellMarks = (row: HTMLTableRowElement) =>
      [...row.cells].map(cell => cell.getAttribute('data-astryx-cell-gliding'));
    document.body.append(body);
    let finish = () => {};
    const glide = {
      finished: new Promise<void>(resolve => {
        finish = resolve;
      }),
    } as unknown as Animation;
    // The change is row 1; rows 2 and 3 glide, row 4 is still.
    const moving = new Set([rows[2], rows[3]]);
    const glideOf = (element: Element) =>
      moving.has(element as HTMLTableRowElement) ? glide : null;

    const edges = new Map(rows.map(row => [row, rowEdge(row)!] as const));
    const done = markGlidingRows(rows[1], edges, null, glideOf);
    expect(
      rows.map(row => row.hasAttribute('data-astryx-row-gliding')),
    ).toEqual([false, false, true, true, false]);
    expect(
      rows[2].style.getPropertyValue('--_table-row-glide-width'),
    ).toBe('0px');
    // The first cell that scrolls draws the line; the pinned one draws its
    // own; the nested table's cell is not marked.
    expect(cellMarks(rows[2])).toEqual(['', 'line', '']);
    expect(cellMarks(rows[4])).toEqual([null, null, null]);
    expect(
      nested.querySelector('td')?.hasAttribute('data-astryx-cell-gliding'),
    ).toBe(false);

    finish();
    await done;
    expect(rows.some(row => row.hasAttribute('data-astryx-row-gliding'))).toBe(
      false,
    );
    expect(
      rows[2].style.getPropertyValue('--_table-row-glide-width'),
    ).toBe('');
    expect(cellMarks(rows[2])).toEqual([null, null, null]);
    body.remove();
  });
});
