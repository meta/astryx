// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowPaint.ts
 * @input Mounted body rows and the row state the row plugins publish
 * @output Exports `publishRowState`: row plugins tell Table a row's state,
 *   and Table alone writes that row's fill
 * @position Table internals, shared by the row plugins that colour a row
 *   (selection today). A plugin calls it from the row ref callback it already
 *   has, so a state change repaints only the rows it touches.
 *
 * SYNC: When modified, update plugins/selection.
 */

import {colorVars} from '../theme/tokens.stylex';

/** A row plugin that publishes row state. */
export type RowPaintSource = 'selection' | 'activation';

/** What a row plugin tells Table about one row. */
export interface RowState {
  /** The row is selected. */
  readonly selected?: boolean;
  /** Selection paints its wash on a selected row (`hasRowHighlight`). */
  readonly highlight?: boolean;
}

const SELECTED_WASH = colorVars['--color-accent-muted'];

/**
 * The row's current fill, republished for pinned cells to read: a pinned
 * column paints its own opaque background over the row, so a row fill alone
 * stops at the freeze line. Declared as a literal because StyleX needs the
 * same name as a static key on the reading side.
 */
const ROW_OVERLAY_VAR = '--table-row-overlay';

/** Each mounted row's published state, by source. */
const rowStates = new WeakMap<
  HTMLTableRowElement,
  Map<RowPaintSource, RowState>
>();

function resolveFill(states: Map<RowPaintSource, RowState> | undefined) {
  const selection = states?.get('selection');
  if (selection?.selected === true && selection.highlight === true) {
    return SELECTED_WASH;
  }
  return '';
}

/**
 * Records what `source` says about `row` and repaints the row's fill from
 * every source's state, so the result is the same whichever source publishes
 * first. `null` withdraws the source's state; a row ref calls it on detach,
 * so a row keeps no state across row generations.
 */
export function publishRowState(
  row: HTMLTableRowElement,
  source: RowPaintSource,
  state: RowState | null,
): void {
  let states = rowStates.get(row);
  if (state == null) {
    states?.delete(source);
    if (states?.size === 0) {
      rowStates.delete(row);
      states = undefined;
    }
  } else {
    if (states == null) {
      states = new Map();
      rowStates.set(row, states);
    }
    states.set(source, state);
  }
  const fill = resolveFill(states);
  if (row.style.backgroundColor !== fill) {
    row.style.backgroundColor = fill;
  }
  const overlay = row.style.getPropertyValue(ROW_OVERLAY_VAR);
  if (fill === '') {
    if (overlay !== '') {
      row.style.removeProperty(ROW_OVERLAY_VAR);
    }
  } else if (overlay !== fill) {
    row.style.setProperty(ROW_OVERLAY_VAR, fill);
  }
}
