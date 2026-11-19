// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file table.stylex.ts
 * @input StyleX, theme tokens
 * @output Shared table styles used by TableCell, TableHeaderCell, TableRow
 * @position Utility styles; consumed by cell and row components
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/TableCell.tsx
 * - /packages/core/src/Table/TableHeaderCell.tsx
 * - /packages/core/src/Table/TableRow.tsx
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

/**
 * Scoped marker for table row ancestor selectors.
 *
 * Applied to each `<tr>` via TableRow so that cell-level
 * `stylex.when.ancestor(':last-child', tableRowMarker)` only matches
 * the parent row — not other ancestors like `<tbody>` or `<table>`.
 */
export const tableRowMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();

/**
 * Overflow truncation for table cells.
 *
 * Applied at the <td>/<th> level when textOverflow is 'truncate'.
 * For data-driven tables in truncate mode, the default renderer wraps
 * content in <Text maxLines={1}> for smart tooltips that only appear
 * when text is actually overflowing.
 */
export const overflowStyles = stylex.create({
  cell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '0',
  },
});

/**
 * Wrap styles for table cells.
 *
 * Applied at the <td>/<th> level when textOverflow is 'wrap'.
 * Text wraps naturally and the row grows taller to fit. No content is hidden.
 */
export const wrapStyles = stylex.create({
  cell: {
    overflow: 'hidden',
    // Break a word only when it cannot fit its column. A zero max-width or a
    // break at any letter lets automatic layout shrink a column below its
    // longest word. The table sets the word-break for its layout.
    overflowWrap: 'break-word',
    wordBreak: 'var(--_table-cell-word-break, normal)',
  },
});

/**
 * Truncation for header cells when the table's cells wrap.
 *
 * A header label stays on one line and ends in an ellipsis when its column is
 * narrower than the label. There is no zero max-width: in automatic layout it
 * would hold every column at zero width. Under `textOverflow="truncate"`,
 * header cells use `overflowStyles` like the body cells.
 */
export const headerOverflowStyles = stylex.create({
  cell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/**
 * Container edge compensation for table cells.
 *
 * When a table is inside a Card, Section, or Layout area, the table
 * element applies negative inline margins to bleed edge-to-edge
 * (see Table.tsx containerBleed style). These styles ensure the
 * first and last columns' outer padding aligns with the container's
 * content inset, with a minimum of --spacing-2 (8px).
 *
 * Each density variant uses its own paddingInline as the fallback,
 * so standalone tables (where --container-padding-inline-start/end are unset)
 * keep their normal density-based cell padding unchanged.
 *
 * The last column's end inset is also exposed as `--_table-edge-inline-end`,
 * so a header cell can give its content the same room it pads with. Every
 * other cell resets it, so a Table nested in a last-column cell does not
 * inherit the outer cell's inset.
 */
export const containerEdgeStyles = stylex.create({
  compact: {
    paddingInlineStart: {
      default: null,
      ':first-child': `max(var(--container-padding-inline-start, ${spacingVars['--spacing-2']}), ${spacingVars['--spacing-2']})`,
    },
    '--_table-edge-inline-end': {
      default: 'initial',
      ':last-child': `max(var(--container-padding-inline-end, ${spacingVars['--spacing-2']}), ${spacingVars['--spacing-2']})`,
    },
    paddingInlineEnd: {
      default: null,
      ':last-child': 'var(--_table-edge-inline-end)',
    },
  },
  balanced: {
    paddingInlineStart: {
      default: null,
      ':first-child': `max(var(--container-padding-inline-start, ${spacingVars['--spacing-3']}), ${spacingVars['--spacing-2']})`,
    },
    '--_table-edge-inline-end': {
      default: 'initial',
      ':last-child': `max(var(--container-padding-inline-end, ${spacingVars['--spacing-3']}), ${spacingVars['--spacing-2']})`,
    },
    paddingInlineEnd: {
      default: null,
      ':last-child': 'var(--_table-edge-inline-end)',
    },
  },
  spacious: {
    paddingInlineStart: {
      default: null,
      ':first-child': `max(var(--container-padding-inline-start, ${spacingVars['--spacing-4']}), ${spacingVars['--spacing-2']})`,
    },
    '--_table-edge-inline-end': {
      default: 'initial',
      ':last-child': `max(var(--container-padding-inline-end, ${spacingVars['--spacing-4']}), ${spacingVars['--spacing-2']})`,
    },
    paddingInlineEnd: {
      default: null,
      ':last-child': 'var(--_table-edge-inline-end)',
    },
  },
});
