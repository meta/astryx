// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableRow.tsx
 * @input React, StyleX, TableContext, theme tokens
 * @output Exports TableRow component, TableRowProps
 * @position Sub-component; used inside a Table section (TableHeader /
 *   TableBody / TableFooter) in children mode
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Table/Table.doc.mjs
 * - /packages/core/src/Table/index.ts
 * - /packages/cli/assets/templates/blocks/components/Table/ (showcase blocks)
 */

import {use, type ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';
import type {StyleXStyles} from '../theme/types';
import {tableRowMarker} from './table.stylex';
import {glidingDividerStyles} from './glidingDivider';
import {TableContext} from './TableContext';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

/** Props for TableRow — thin `<tr>` wrapper */
export interface TableRowProps extends BaseProps<HTMLTableRowElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLTableRowElement>;
  children: ReactNode;
  /**
   * StyleX styles for layout customization (margins, positioning, sizing).
   * Must be a `stylex.create()` value — not an inline style object.
   */
  xstyle?: StyleXStyles[];
  /**
   * Whether this row is the header row. Header rows skip the striped/hover
   * row styling (which is only meant for body rows).
   */
  isHeaderRow?: boolean;
}

/**
 * Zebra striping counts body rows — and a row-expansion panel is not one.
 *
 * The panel is appended as a sibling `<tr>` (see BaseTable's `afterRow`), so a
 * plain `:nth-child(even)` counts it and every row below an open panel takes
 * the opposite stripe: expanding one row repaints half the table. Counting
 * `of :not([data-expansion-panel])` leaves the panel out of the sequence, so
 * the rows keep their parity whatever is open.
 */
const NOT_PANEL_ROW = ':nth-child(even of :not([data-expansion-panel]))';

const stripedRowStyles = stylex.create({
  row: {
    backgroundColor: {
      default: null,
      [NOT_PANEL_ROW]: colorVars['--color-background-muted'],
    },
    // Publish the row's current overlay color as an inheritable variable so
    // pinned/sticky cells (which paint an opaque background over the otherwise
    // transparent row) can replay the exact same striping. Unset on odd rows.
    '--table-row-overlay': {
      default: null,
      [NOT_PANEL_ROW]: colorVars['--color-background-muted'],
    },
  },
});

const hoverRowStyles = stylex.create({
  row: {
    backgroundColor: {
      default: null,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    '--table-row-overlay': {
      default: null,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
});

const stripedHoverRowStyles = stylex.create({
  row: {
    backgroundColor: {
      default: null,
      [NOT_PANEL_ROW]: colorVars['--color-background-muted'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    '--table-row-overlay': {
      default: null,
      [NOT_PANEL_ROW]: colorVars['--color-background-muted'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
});

/**
 * TableRow — a `<tr>` wrapper for children/streaming mode.
 *
 * When used inside `<Table>`, inherits styling from the table context
 * (striped, hover, divider overrides). When used standalone, renders a plain `<tr>`.
 *
 * Rows go inside a section — `<TableBody>`, `<TableHeader>`, or
 * `<TableFooter>`. `<table>` cannot contain a `<tr>` directly: the HTML parser
 * inserts an implied `<tbody>` when it parses server-rendered markup and React
 * does not when it renders on the client, so the two trees mismatch on
 * hydration. Children mode passes children straight through, so the section is
 * the caller's to supply — the data-driven `data={...}` mode renders it for
 * you.
 *
 * @example
 * ```
 * <Table>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Alice</TableCell>
 *       <TableCell>30</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */
export function TableRow({
  children,
  xstyle,
  ref,
  isHeaderRow = false,
  className: incomingClassName,
  style: incomingStyle,
  ...props
}: TableRowProps) {
  const ctx = use(TableContext);

  if (!ctx) {
    return (
      <tr
        ref={ref}
        {...props}
        {...mergeProps(
          themeProps('table-row'),
          stylex.props(tableRowMarker, xstyle),
          incomingClassName,
          incomingStyle,
        )}>
        {children}
      </tr>
    );
  }

  const rowStyles: StyleXStyles[] = [];

  // Striped + hover styling is for body rows only — the header row must not
  // pick up the hover highlight (or striping) even when hasHover/isStriped.
  if (!isHeaderRow) {
    // Handle striped + hover combination to avoid backgroundColor conflicts
    if (ctx.isStriped && ctx.hasHover) {
      rowStyles.push(stripedHoverRowStyles.row);
    } else if (ctx.isStriped) {
      rowStyles.push(stripedRowStyles.row);
    } else if (ctx.hasHover) {
      rowStyles.push(hoverRowStyles.row);
    }
  }

  if (ctx.dividers === 'rows' || ctx.dividers === 'grid') {
    // Note: last-body-row border removal is handled by TableCell
    // to avoid affecting the header row in <thead>.
    // While a glide moves the row, its divider moves with it.
    rowStyles.push(glidingDividerStyles.row);
  }

  if (xstyle) {
    rowStyles.push(...xstyle);
  }

  return (
    <tr
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('table-row'),
        stylex.props(tableRowMarker, ...rowStyles),
        incomingClassName,
        incomingStyle,
      )}>
      {children}
    </tr>
  );
}

TableRow.displayName = 'TableRow';
