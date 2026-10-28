// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file glidingDivider.ts
 * @input Table rows a row glide moves (Web Animations on the `<tr>`), their
 *   computed borders, StyleX
 * @output Exports `glidingDividerStyles` (a row's stand-in divider while it
 *   glides), `markGlidingRows` (marks the moving rows for that glide and
 *   carries each row's own border onto the stand-in) and `rowEdge`
 * @position Table internals. With collapsed borders the table paints every
 *   border at its cell's static place, so a row that moves leaves its divider
 *   behind. For the glide only, the moving row's cells are marked: their
 *   borders go transparent (their width stays, so nothing reflows) and one of
 *   them draws the same divider across the whole row in its ::after, which
 *   moves with the row. A pinned cell draws its own over it
 *   (plugins/stickyColumns).
 *
 * SYNC: When modified, update TableCell.tsx, plugins/rowExpansion and
 *   plugins/stickyColumns.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {collapsedBottom, type BottomEdge} from './rowDivider';

export type {BottomEdge} from './rowDivider';

/** On a row while a glide moves it. */
export const GLIDING_ATTRIBUTE = 'data-astryx-row-gliding';
const GLIDING = '[data-astryx-row-gliding]';
/**
 * On each cell of a moving row; `line` on the one that draws the row's
 * divider. On the cells themselves, so a table nested in a moving row keeps
 * its own dividers.
 */
const CELL_ATTRIBUTE = 'data-astryx-cell-gliding';
const CELL_GLIDING = '[data-astryx-cell-gliding]';
const CELL_LINE = '[data-astryx-cell-gliding="line"]';

/** On a pinned (sticky) cell: plugins/stickyColumns. */
const PINNED_ATTRIBUTE = 'data-astryx-table-pinned';

/**
 * A row's divider, carried on the row for its glide. Names no cell sets, so
 * a pinned cell's own carry (plugins/stickyColumns) cannot shadow them.
 */
export const GLIDE_DIVIDER_WIDTH = '--_table-row-glide-width';
export const GLIDE_DIVIDER_STYLE = '--_table-row-glide-style';
export const GLIDE_DIVIDER_COLOR = '--_table-row-glide-color';

export const glidingDividerStyles = stylex.create({
  /**
   * On every cell with a row divider: it goes transparent while the row
   * moves, and the row's line cell draws the divider across the row's bottom
   * edge, where the collapsed border sits. The line is positioned against the
   * row (the cell is not positioned), so the cell's own overflow does not clip
   * it, and it is a box inside a cell, not a box in the row, so the table's
   * column widths do not change.
   */
  cell: {
    borderBottomColor: {
      default: colorVars['--color-border'],
      [CELL_GLIDING]: 'transparent',
    },
    // Every declaration only on the line cell: a pinned cell's own ::after
    // (its scroll shadow) stays untouched.
    '::after': {
      content: {default: null, [CELL_LINE]: '""'},
      position: {default: null, [CELL_LINE]: 'absolute'},
      insetInline: {default: null, [CELL_LINE]: 0},
      // Where the collapsed edge rests below the row's padding box (a wide
      // border, or the row's own): measured when the row is marked.
      bottom: {
        default: null,
        [CELL_LINE]: 'calc(-1 * var(--_table-row-glide-offset, 0px))',
      },
      height: {default: null, [CELL_LINE]: 0},
      borderBottomWidth: {
        default: null,
        [CELL_LINE]: `var(${GLIDE_DIVIDER_WIDTH}, 0px)`,
      },
      borderBottomStyle: {
        default: null,
        [CELL_LINE]: `var(${GLIDE_DIVIDER_STYLE}, solid)`,
      },
      borderBottomColor: {
        default: null,
        [CELL_LINE]: `var(${GLIDE_DIVIDER_COLOR}, ${colorVars['--color-border']})`,
      },
      pointerEvents: {default: null, [CELL_LINE]: 'none'},
    },
  },
  /**
   * After `cell` on a detail panel's cell: its divider color is the one its
   * row hands down (plugins/rowExpansion).
   */
  panelCell: {
    borderBottomColor: {
      default: `var(--_table-panel-divider-color, ${colorVars['--color-border']})`,
      [CELL_GLIDING]: 'transparent',
    },
  },
  /**
   * On every row: while it moves it is the line's containing block. Its
   * motion (a `translate`) makes it one; `position: relative` keeps it so
   * for a panel playing in, which does not move.
   */
  row: {
    position: {
      default: null,
      [GLIDING]: 'relative',
    },
  },
});

/** The batch that marked a row last: only that batch unmarks it. */
const markedBy = new WeakMap<Element, symbol>();
/**
 * A marked element's own inline border colors (bottom, or top for the row
 * below and its cells), given back when it is unmarked.
 */
const inlineTopOf = new WeakMap<HTMLElement, string>();
/** The edge sources a row hid when it was marked, given back at unmark. */
const sourcesOf = new WeakMap<
  Element,
  {bottoms: HTMLElement[]; tops: HTMLElement[]}
>();
/** A marked cell's own inline border color, given back when it is unmarked. */
const inlineColorOf = new WeakMap<HTMLElement, string>();

/**
 * A row's own bottom border, for its stand-in while it moves; null for a row
 * already carrying one. Read where the glide reads the layout (`animate`'s
 * `beforeMove`), before anything starts moving.
 */
/**
 * The elements whose borders the collapse can take a row's divider from
 * (`rowDivider.ts` collapsedBottom): the row's own bottom, the row below's
 * top and its cells' tops, and at a section edge the row groups' borders.
 */
function edgeSourcesOf(row: HTMLElement): {
  bottoms: HTMLElement[];
  tops: HTMLElement[];
} {
  const bottoms: HTMLElement[] = [row];
  const tops: HTMLElement[] = [];
  const group = row.parentElement;
  const next =
    row.nextElementSibling ??
    group?.nextElementSibling?.firstElementChild ??
    null;
  if (next instanceof HTMLElement) {
    tops.push(next);
    for (const cell of next.children) {
      if (cell instanceof HTMLElement) {
        tops.push(cell);
      }
    }
  }
  if (row.nextElementSibling == null && group instanceof HTMLElement) {
    bottoms.push(group);
    const nextGroup = group.nextElementSibling;
    if (nextGroup instanceof HTMLElement) {
      tops.push(nextGroup);
    }
  }
  return {bottoms, tops};
}

export function rowEdge(row: Element): BottomEdge | null {
  if (row.hasAttribute(GLIDING_ATTRIBUTE) || row.lastElementChild == null) {
    return null;
  }
  return collapsedBottom(row.lastElementChild as HTMLTableCellElement);
}

/**
 * Marks the rows a glide is moving around `changed`, and `entering` (a row
 * playing its entrance, with that entrance), so their cells draw a divider
 * that moves with them; unmarks them in one batch when that motion ends. A
 * glide moves a contiguous run of rows next to the change and stops near the
 * visible part, so this walks out from the changed row each way and stops at
 * still rows: it never visits the rest of a long table. It asks the motion
 * module which rows glide and takes the borders read before the glide
 * started (`edges`), so it reads nothing from the layout: it only writes.
 * Resolves when the motion has ended.
 */
export async function markGlidingRows(
  changed: HTMLElement,
  edges: ReadonlyMap<Element, BottomEdge>,
  entering: {row: HTMLElement; animation: Animation} | null,
  glideOf: (element: Element) => Animation | null,
): Promise<void> {
  const rows = new Map<HTMLElement, Animation | null>();
  const glide = glideOf(changed);
  if (glide != null) {
    rows.set(changed, glide);
  }
  for (const step of [
    'nextElementSibling',
    'previousElementSibling',
  ] as const) {
    let row = changed[step];
    // The changed row's own panel enters rather than glides: look past it.
    let stillInARow = 0;
    while (row instanceof HTMLElement && stillInARow < 2) {
      const animation = glideOf(row);
      if (animation != null) {
        rows.set(row, animation);
        stillInARow = 0;
      } else {
        stillInARow += 1;
      }
      row = row[step];
    }
  }
  if (entering != null) {
    rows.set(entering.row, entering.animation);
  }
  if (rows.size === 0) {
    return;
  }
  const batch = Symbol('glide');
  // Where each row's divider rests, read before any write. The line hangs
  // from the row's padding box (its containing block), which a row's own
  // border shortens; the collapsed edge starts at a cell's padding-box
  // bottom, which a wide border puts below it. The table paints that edge
  // from the whole pixel at or above it, so the line starts there too.
  const offsets = new Map<Element, number>();
  for (const row of rows.keys()) {
    const edge = edges.get(row);
    const cell = row.lastElementChild;
    if (edge == null || !(cell instanceof HTMLElement)) {
      continue;
    }
    const cellEdge =
      cell.getBoundingClientRect().top + cell.clientTop + cell.clientHeight;
    const rowPaddingEdge =
      row.getBoundingClientRect().top + row.clientTop + row.clientHeight;
    offsets.set(row, Math.floor(cellEdge) + edge.width - rowPaddingEdge);
  }
  for (const row of rows.keys()) {
    const edge = edges.get(row);
    if (edge != null && !row.hasAttribute(GLIDING_ATTRIBUTE)) {
      row.style.setProperty(GLIDE_DIVIDER_WIDTH, `${edge.width}px`);
      row.style.setProperty(GLIDE_DIVIDER_STYLE, edge.style);
      row.style.setProperty(GLIDE_DIVIDER_COLOR, edge.color);
      row.setAttribute(GLIDING_ATTRIBUTE, '');
      // Every edge the collapse could take the divider from is painted by the
      // table at the row's static place: the row's own border, the row
      // below's top and its cells' tops, and at a section edge the row
      // groups' borders. They go transparent too, and the line carries the
      // winner.
      const sources = edgeSourcesOf(row);
      sourcesOf.set(row, sources);
      for (const element of sources.bottoms) {
        if (!inlineColorOf.has(element)) {
          inlineColorOf.set(element, element.style.borderBottomColor);
          element.style.borderBottomColor = 'transparent';
        }
      }
      for (const element of sources.tops) {
        if (!inlineTopOf.has(element)) {
          inlineTopOf.set(element, element.style.borderTopColor);
          element.style.borderTopColor = 'transparent';
        }
      }
      row.style.setProperty(
        '--_table-row-glide-offset',
        `${offsets.get(row) ?? 0}px`,
      );
      // The table's last row can glide a pixel farther than the rows above
      // it (its border collapses differently), so mid-glide it overlaps the
      // row above. Each moving row is its own layer; the last one stays
      // under the others so it cannot cover the divider above it. Both stay
      // under a sticky header (z-index 3).
      row.style.zIndex = row.nextElementSibling == null ? '0' : '1';
      // The first cell that scrolls with the row draws the line; a pinned
      // cell is positioned (the line would be its width) and draws its own.
      let hasLine = false;
      for (const cell of row.children) {
        const isLine: boolean =
          !hasLine && !cell.hasAttribute(PINNED_ATTRIBUTE);
        cell.setAttribute(CELL_ATTRIBUTE, isLine ? 'line' : '');
        hasLine ||= isLine;
        // Inline, so a theme's `table-cell` color or an app's stylesheet on
        // the cells, which outrank the stylesheet's rule, cannot keep the
        // line at the row's static place.
        if (cell instanceof HTMLElement) {
          inlineColorOf.set(cell, cell.style.borderBottomColor);
          cell.style.borderBottomColor = 'transparent';
        }
      }
    }
    markedBy.set(row, batch);
  }
  await Promise.all(
    [...rows.values()].map(async animation => {
      await animation?.finished.catch(() => undefined);
    }),
  );
  // Writes only, and only for rows no later glide has taken over.
  for (const row of rows.keys()) {
    if (markedBy.get(row) !== batch) {
      continue;
    }
    markedBy.delete(row);
    row.removeAttribute(GLIDING_ATTRIBUTE);
    row.style.removeProperty('z-index');
    const {bottoms, tops} = sourcesOf.get(row) ?? {bottoms: [], tops: []};
    sourcesOf.delete(row);
    for (const element of bottoms) {
      if (inlineColorOf.has(element)) {
        element.style.borderBottomColor = inlineColorOf.get(element) ?? '';
        inlineColorOf.delete(element);
      }
    }
    for (const element of tops) {
      if (inlineTopOf.has(element)) {
        element.style.borderTopColor = inlineTopOf.get(element) ?? '';
        inlineTopOf.delete(element);
      }
    }
    row.style.removeProperty('--_table-row-glide-offset');
    for (const cell of row.children) {
      cell.removeAttribute(CELL_ATTRIBUTE);
      if (cell instanceof HTMLElement && inlineColorOf.has(cell)) {
        cell.style.borderBottomColor = inlineColorOf.get(cell) ?? '';
        inlineColorOf.delete(cell);
      }
    }
    row.style.removeProperty(GLIDE_DIVIDER_WIDTH);
    row.style.removeProperty(GLIDE_DIVIDER_STYLE);
    row.style.removeProperty(GLIDE_DIVIDER_COLOR);
  }
}
