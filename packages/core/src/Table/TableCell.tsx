// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCell.tsx
 * @input React, StyleX, TableContext, theme tokens, useTableCellStyles
 * @output Exports TableCell component, TableCellProps
 * @position Sub-component; used inside Table children mode
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Table/Table.doc.mjs
 * - /packages/core/src/Table/index.ts
 * - /packages/cli/assets/templates/blocks/components/Table/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {StyleXStyles} from '../theme/types';
import type {TableContextActions} from './types';
import {wrapInTableContextMenu} from './tableContextMenu';
import {
  overflowStyles,
  wrapStyles,
  containerEdgeStyles,
  tableRowMarker,
} from './table.stylex';
import {
  useTableContext,
  buildDividerStyles,
  mergeXStyle,
} from './useTableCellStyles';
import {mergeProps} from '../utils';
import {glidingDividerStyles} from './glidingDivider';
import {themeProps} from '../utils/themeProps';

/** Props for TableCell — thin `<td>` wrapper */
export interface TableCellProps extends BaseProps<HTMLTableCellElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLTableCellElement>;
  /** Specifies which cells this cell relates to (used on `<td>` acting as a row header). */
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup';
  /** Space-separated list of header cell IDs this cell is described by. */
  headers?: string;
  /** Number of columns this cell spans. Standard HTML `<td>` attribute. */
  colSpan?: number;
  /** Number of rows this cell spans. Standard HTML `<td>` attribute. */
  rowSpan?: number;
  children?: ReactNode;
  /**
   * StyleX styles for layout customization (margins, positioning, sizing).
   * Must be a `stylex.create()` value — not an inline style object.
   */
  xstyle?: StyleXStyles | StyleXStyles[];
  /**
   * Right-click actions rendered as a context menu around the cell content.
   * The cell owns the wrapper so it controls how the menu interacts with its
   * padding / content. Empty or undefined renders no menu.
   */
  contextMenuActions?: TableContextActions;
}

const densityStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
});

// When a cell owns a context menu, its padding moves from the `<td>` onto the
// right-click trigger wrapper so the *entire* cell (padding included) opens the
// menu. Without this, right-clicking the padding ring near a cell edge falls
// through to the browser's native menu. Paired with `contextMenuCellStyles` on
// the `<td>` (font/box-sizing only — no padding).
const densityTextStyles = stylex.create({
  compact: {
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
  balanced: {
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
  spacious: {
    fontSize: typeScaleVars['--text-body-size'],
    boxSizing: 'border-box',
  },
});

const densityPaddingStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
  },
});

// The trigger wrapper fills the whole cell (a `<td>` child with height:100%
// stretches to the row height) so a right-click anywhere in the cell opens the
// menu. It carries the density padding relocated off the `<td>`.
const triggerFillStyles = stylex.create({
  fill: {
    display: 'block',
    boxSizing: 'border-box',
    blockSize: '100%',
    inlineSize: '100%',
  },
});

// `height:100%` on the `<td>` is the CSS trick that lets a block child resolve
// its own `height:100%` against the row height — so the trigger fills the cell
// vertically (top/bottom padding included) and is fully right-clickable.
const contextMenuCellStyles = stylex.create({
  cell: {
    blockSize: '100%',
  },
});

const dividerRowStyles = stylex.create({
  cell: {
    // The width this cell's divider draws, for a pinned cell's own divider
    // to match (plugins/stickyColumns). Private plumbing, not a theme API.
    '--_table-row-divider-width': {
      default: borderVars['--border-width'],
      [stylex.when.ancestor(':last-child', tableRowMarker)]: '0px',
    },
    borderBottomWidth: {
      default: borderVars['--border-width'],
      // Skip border on cells in the last body row to avoid a
      // redundant line at the bottom of the table.
      // Scoped to tableRowMarker so only the parent <tr> is checked —
      // without the scope, <tbody> (also a :last-child) would match
      // and suppress borders on every row.
      [stylex.when.ancestor(':last-child', tableRowMarker)]: '0',
    },
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
});

const dividerColumnStyles = stylex.create({
  cell: {
    borderInlineEndWidth: {
      default: borderVars['--border-width'],
      ':last-child': '0',
    },
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
});

const verticalAlignStyles = stylex.create({
  middle: {
    verticalAlign: 'middle',
  },
  top: {
    verticalAlign: 'top',
  },
  bottom: {
    verticalAlign: 'bottom',
  },
});

/**
 * TableCell — a `<td>` wrapper for children/streaming mode.
 *
 * When used inside `<Table>`, inherits styling from the table context
 * (density padding, divider borders). When used standalone, renders a plain `<td>`.
 *
 * @example
 * ```
 * <TableRow>
 *   <TableCell>Alice</TableCell>
 *   <TableCell>30</TableCell>
 * </TableRow>
 * ```
 */
export function TableCell({
  children,
  xstyle,
  ref,
  className: incomingClassName,
  style: incomingStyle,
  contextMenuActions,
  ...props
}: TableCellProps) {
  const ctx = useTableContext();

  const hasContextMenu =
    typeof contextMenuActions === 'function' ||
    (Array.isArray(contextMenuActions) && contextMenuActions.length > 0);

  // When the cell owns a context menu, its density padding is relocated onto
  // the right-click trigger wrapper (see `content` below) so the entire cell —
  // padding included — opens the menu. Otherwise padding lives on the `<td>`.
  const cellStyles: StyleXStyles[] = ctx
    ? [
        hasContextMenu
          ? densityTextStyles[ctx.density]
          : densityStyles[ctx.density],
        ctx.textOverflow === 'truncate' ? overflowStyles.cell : wrapStyles.cell,
        containerEdgeStyles[ctx.density],
        verticalAlignStyles[ctx.verticalAlign],
        ...buildDividerStyles(
          ctx,
          dividerRowStyles.cell,
          dividerColumnStyles.cell,
        ),
        ...(hasContextMenu ? [contextMenuCellStyles.cell] : []),
        // While a glide moves the row, its divider moves with it.
        glidingDividerStyles.cell,
      ]
    : [];

  // The cell owns the context-menu wrapper so it controls how the menu
  // interacts with its padding / content. No-op when no actions. When actions
  // exist we make the trigger fill the cell and carry the density padding so a
  // right-click anywhere in the cell (including the padding ring) opens it.
  const triggerXstyle =
    hasContextMenu && ctx
      ? [triggerFillStyles.fill, densityPaddingStyles[ctx.density]]
      : hasContextMenu
        ? triggerFillStyles.fill
        : undefined;
  const content = wrapInTableContextMenu(
    children,
    contextMenuActions,
    triggerXstyle,
  );

  return (
    <td
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('table-cell', {density: ctx?.density}),
        stylex.props(...mergeXStyle(cellStyles, xstyle)),
        incomingClassName,
        incomingStyle,
      )}>
      {content}
    </td>
  );
}

TableCell.displayName = 'TableCell';
