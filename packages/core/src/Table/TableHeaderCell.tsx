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

import {useRef, type ReactNode} from 'react';
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
import {
  hasTableContextActions,
  wrapInTableContextMenu,
} from './tableContextMenu';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {useCutTextOnKeyboardFocus} from '../Text/TruncationTooltip';

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

// The end padding is also the room header content may grow into before its
// label truncates (BaseTable, sort plugin). The last column takes the
// container edge inset.
const densityStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
    '--_table-header-inline': spacingVars['--spacing-2'],
    paddingInline: 'var(--_table-header-inline)',
    '--_table-header-end-room':
      'var(--_table-edge-inline-end, var(--_table-header-inline))',
    fontSize: typeScaleVars['--text-label-size'],
    boxSizing: 'border-box',
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
    '--_table-header-inline': spacingVars['--spacing-3'],
    paddingInline: 'var(--_table-header-inline)',
    '--_table-header-end-room':
      'var(--_table-edge-inline-end, var(--_table-header-inline))',
    fontSize: typeScaleVars['--text-label-size'],
    boxSizing: 'border-box',
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    '--_table-header-inline': spacingVars['--spacing-4'],
    paddingInline: 'var(--_table-header-inline)',
    '--_table-header-end-room':
      'var(--_table-edge-inline-end, var(--_table-header-inline))',
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

const headerTriggerStyles = stylex.create({
  unpositioned: {
    position: 'static',
  },
});

// Holds the context menu's cursor anchor in place of its unpositioned
// trigger, so the menu still scrolls with the table. A plugin's own position,
// such as a sticky column, wins.
const headerMenuCellStyles = stylex.create({
  cell: {
    position: 'relative',
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

  // A heading cut short by its column shows in full in a tooltip when keyboard
  // focus reaches something inside the cell (a sortable header's sort
  // control). Only a cell inside a Table truncates.
  const cellRef = useRef<HTMLTableCellElement | null>(null);
  const mergedRef = useMergedRefs(ref, cellRef);
  const cutHeading = useCutTextOnKeyboardFocus({
    anchorRef: cellRef,
    isEnabled: ctx != null,
  });

  // Header cells always get the bottom divider (separates header from body).
  // When used standalone (no table context) the cell renders plain, with no
  // density/divider styles.
  const hasContextMenu = hasTableContextActions(contextMenuActions);
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
    if (hasContextMenu) {
      cellStyles.push(headerMenuCellStyles.cell);
    }
  }

  // The cell owns the context-menu wrapper so it controls how the menu
  // interacts with its padding / content. No-op when no actions. Inside a
  // Table the wrapper stays unpositioned, so a header plugin's overlay, such
  // as a resize boundary, positions against the cell and sits on its edge.
  const content = wrapInTableContextMenu(
    children,
    contextMenuActions,
    ctx && hasContextMenu ? headerTriggerStyles.unpositioned : undefined,
  );

  return (
    <th
      ref={mergedRef}
      {...props}
      {...mergeProps(
        themeProps('table-header-cell', {density: ctx?.density}),
        stylex.props(...mergeXStyle(cellStyles, xstyle)),
        incomingClassName,
        incomingStyle,
      )}
      onFocus={composeEventHandlers(props.onFocus, cutHeading.onFocus)}
      onBlur={composeEventHandlers(props.onBlur, cutHeading.onBlur)}
      onPointerDown={composeEventHandlers(
        props.onPointerDown,
        cutHeading.onPointerDown,
      )}>
      {content}
      {cutHeading.cutText != null && cutHeading.Tooltip ? (
        <cutHeading.Tooltip
          anchorRef={cellRef}
          content={cutHeading.cutText}
          onHide={cutHeading.hide}
        />
      ) : null}
    </th>
  );
}

TableHeaderCell.displayName = 'TableHeaderCell';
