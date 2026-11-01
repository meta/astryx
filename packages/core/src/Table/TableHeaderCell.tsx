// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableHeaderCell.tsx
 * @input React, StyleX, TableContext, theme tokens, useTableCellStyles
 * @output Exports TableHeaderCell component, TableHeaderCellProps
 * @position Sub-component; used inside Table for header cells
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
  colorVars,
  spacingVars,
  fontWeightVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import type {StyleXStyles} from '../theme/types';
import type {TableContextActions} from './types';
import {overflowStyles, containerEdgeStyles} from './table.stylex';
import {useTableContext, mergeXStyle} from './useTableCellStyles';
import {wrapInTableContextMenu} from './tableContextMenu';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

/** Props for TableHeaderCell — `<th>` wrapper with context-aware styling */
export interface TableHeaderCellProps extends BaseProps<HTMLTableCellElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLTableCellElement>;
  /** Specifies which cells this header relates to. */
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup';
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
    fontSize: typeScaleVars['--text-label-size'],
    boxSizing: 'border-box',
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    fontSize: typeScaleVars['--text-label-size'],
    boxSizing: 'border-box',
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    fontSize: typeScaleVars['--text-label-size'],
    boxSizing: 'border-box',
  },
});

const headerStyles = stylex.create({
  cell: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-secondary'],
    textAlign: 'start',
  },
});

const headerDividerStyles = stylex.create({
  cell: {
    // For a pinned header cell's own divider to match (plugins/stickyColumns).
    '--_table-row-divider-width': borderVars['--border-width'],
    borderBottomWidth: borderVars['--border-width'],
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

/**
 * TableHeaderCell — a `<th>` wrapper for header cells.
 *
 * When used inside `<Table>`, inherits styling from the table context
 * (density padding, header font weight/color, divider borders).
 * When used standalone, renders a plain `<th>`.
 *
 * Accepts `xstyle` for plugin-provided styles that merge on top.
 *
 * @example
 * ```
 * <thead>
 *   <tr>
 *     <TableHeaderCell>Name</TableHeaderCell>
 *     <TableHeaderCell>Age</TableHeaderCell>
 *   </tr>
 * </thead>
 * ```
 */
export function TableHeaderCell({
  children,
  xstyle,
  ref,
  className: incomingClassName,
  style: incomingStyle,
  contextMenuActions,
  ...props
}: TableHeaderCellProps) {
  const ctx = useTableContext();

  // Header cells always get the bottom divider (separates header from body).
  // When used standalone (no table context) the cell renders plain, with no
  // density/divider styles.
  const cellStyles: StyleXStyles[] = [];
  if (ctx) {
    cellStyles.push(
      headerStyles.cell,
      densityStyles[ctx.density],
      headerDividerStyles.cell,
      overflowStyles.cell,
      containerEdgeStyles[ctx.density],
    );
    // Column dividers come from the shared builder (column axis only).
    if (ctx.dividers === 'columns' || ctx.dividers === 'grid') {
      cellStyles.push(dividerColumnStyles.cell);
    }
  }

  // The cell owns the context-menu wrapper so it controls how the menu
  // interacts with its padding / content. No-op when no actions.
  const content = wrapInTableContextMenu(children, contextMenuActions);

  return (
    <th
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('table-header-cell', {density: ctx?.density}),
        stylex.props(...mergeXStyle(cellStyles, xstyle)),
        incomingClassName,
        incomingStyle,
      )}>
      {content}
    </th>
  );
}

TableHeaderCell.displayName = 'TableHeaderCell';
