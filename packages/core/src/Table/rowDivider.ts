// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowDivider.ts
 * @input Table cells and rows, their computed borders
 * @output Exports `collapsedBottom` (the border the table paints under a
 *   cell, by the collapsing rules) and `panelDividerFor` (the divider a
 *   detail panel takes from its row)
 * @position Table internals, shared by the sticky-columns and row-expansion
 *   plugins: a divider drawn somewhere else than the table paints it (a
 *   pinned cell's, a detail panel's) reads here which border the table would
 *   paint, so a theme's or an app's border carries over.
 *
 * SYNC: When modified, update plugins/stickyColumns and plugins/rowExpansion.
 */

/** Border styles by collapsed-border precedence, weakest first (CSS 2.1). */
const STYLE_RANK = [
  'inset',
  'groove',
  'outset',
  'ridge',
  'dotted',
  'dashed',
  'solid',
  'double',
];

export interface BottomEdge {
  width: number;
  style: string;
  color: string;
}

function edgeOf(element: Element | null, side: 'Bottom' | 'Top'): BottomEdge {
  if (element == null) {
    return {width: 0, style: 'none', color: ''};
  }
  const style = getComputedStyle(element);
  return {
    width:
      parseFloat(
        style.getPropertyValue(`border-${side.toLowerCase()}-width`),
      ) || 0,
    style: style.getPropertyValue(`border-${side.toLowerCase()}-style`),
    color: style.getPropertyValue(`border-${side.toLowerCase()}-color`),
  };
}

/** The row below `row`, across a section edge (thead to tbody) too. */
function rowBelow(row: Element | null): Element | null {
  if (row == null) {
    return null;
  }
  return (
    row.nextElementSibling ??
    row.parentElement?.nextElementSibling?.firstElementChild ??
    null
  );
}

/**
 * The border the table paints under a cell, by the collapsing rules (CSS 2.1
 * 17.6.2.1): of the cell's own bottom, the cell's below it (top), its row's
 * bottom, the next row's top, and at a section edge (thead to tbody) the two
 * row groups' borders, `hidden` wins, then the wider, then the stronger
 * style; a tie goes to a cell over a row over a row group, and to the upper
 * one. `isOwn` says the cell's own border won; `isRow` says a row's or a
 * row group's won, which the table paints along the whole row.
 */
export function collapsedBottom(cell: HTMLTableCellElement): BottomEdge & {
  isOwn: boolean;
  isRow: boolean;
} {
  const row = cell.parentElement;
  const nextRow = rowBelow(row);
  const nextCell = nextRow?.children[cell.cellIndex] ?? null;
  const isSectionEdge = row != null && row.nextElementSibling == null;
  // In tie order.
  const candidates = [
    edgeOf(cell, 'Bottom'),
    edgeOf(nextCell, 'Top'),
    edgeOf(row, 'Bottom'),
    edgeOf(nextRow, 'Top'),
    edgeOf(isSectionEdge ? (row?.parentElement ?? null) : null, 'Bottom'),
    edgeOf(isSectionEdge ? (nextRow?.parentElement ?? null) : null, 'Top'),
  ];
  const own = candidates[0];
  if (candidates.some(edge => edge.style === 'hidden')) {
    return {
      width: 0,
      style: 'none',
      color: own.color,
      isOwn: own.style === 'hidden',
      isRow: false,
    };
  }
  const strength = (edge: BottomEdge) =>
    edge.style === 'none' || edge.width === 0
      ? [-1, -1]
      : [edge.width, STYLE_RANK.indexOf(edge.style)];
  let winner = own;
  for (const edge of candidates.slice(1)) {
    const [width, rank] = strength(edge);
    const [bestWidth, bestRank] = strength(winner);
    if (width > bestWidth || (width === bestWidth && rank > bestRank)) {
      winner = edge;
    }
  }
  return {
    ...winner,
    isOwn: winner === own,
    isRow: candidates.indexOf(winner) >= 2,
  };
}

/**
 * The divider a detail panel takes from its row: the color and style of the
 * row's cells (a theme's `table-cell` styling or an app's own, which never
 * reach the panel's cell), with their width where they set one, at the
 * panel's own width otherwise, unless the row's own border wins the
 * collapse (an app styling the `<tr>`), as custom property
 * values for the panel's cell. Every value is written, `initial` where the
 * panel keeps its own, so a panel nested in another never inherits that
 * one's.
 */
export function panelDividerFor(row: Element): {
  width: string;
  style: string;
  color: string;
} | null {
  const rowCell = row.lastElementChild;
  if (rowCell == null) {
    return null;
  }
  const rowStyle = getComputedStyle(row);
  const rowWidth = parseFloat(rowStyle.borderBottomWidth) || 0;
  if (rowStyle.borderBottomStyle !== 'none' && rowWidth > 0) {
    return {
      width: `${rowWidth}px`,
      style: rowStyle.borderBottomStyle,
      color: rowStyle.borderBottomColor,
    };
  }
  const cellStyle = getComputedStyle(rowCell);
  // The row's cells hand their divider down (their own width is 0); a width
  // an app or a theme sets on them anyway is the divider's.
  const cellWidth = parseFloat(cellStyle.borderBottomWidth) || 0;
  return {
    width: cellWidth > 0 ? `${cellWidth}px` : 'initial',
    style: cellStyle.borderBottomStyle,
    color: cellStyle.borderBottomColor,
  };
}
