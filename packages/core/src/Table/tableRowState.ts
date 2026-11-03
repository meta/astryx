// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Coordinated semantic Table row paint.
 * @input Independent selection and activation state.
 * @output One effective row and pinned-cell overlay; independent active cue.
 * @position Private parent paint owner; plugins contribute state, not rival writes.
 */
import {colorVars} from '../theme/tokens.stylex';
interface RowState {
  selected: boolean;
  highlight: boolean;
  active: boolean;
  ownsActivation: boolean;
  originalCurrent: string | null;
  originalActive: string | null;
  originalCue: string;
  background: string;
  overlay: string;
}
const states = new WeakMap<HTMLTableRowElement, RowState>();
function stateFor(row: HTMLTableRowElement): RowState {
  let state = states.get(row);
  if (state == null) {
    state = {
      selected: false,
      highlight: true,
      active: false,
      ownsActivation: false,
      originalCurrent: row.getAttribute('aria-current'),
      originalActive: row.getAttribute('data-active'),
      originalCue: row.style.getPropertyValue('--table-row-active-cue-width'),
      background: row.style.backgroundColor,
      overlay: row.style.getPropertyValue('--table-row-overlay'),
    };
    states.set(row, state);
  }
  return state;
}
function paint(row: HTMLTableRowElement, state: RowState) {
  const hasWash = (state.selected && state.highlight) || state.active;
  const wash = hasWash ? colorVars['--color-accent-muted'] : state.background;
  if (row.style.backgroundColor !== wash) {
    row.style.backgroundColor = wash;
  }
  const overlay = hasWash ? colorVars['--color-accent-muted'] : state.overlay;
  if (overlay) {
    row.style.setProperty('--table-row-overlay', overlay);
  } else {
    row.style.removeProperty('--table-row-overlay');
  }
  if (state.active) {
    row.setAttribute('data-active', 'active');
    row.setAttribute('aria-current', 'true');
    row.style.setProperty('--table-row-active-cue-width', '3px');
  } else if (state.ownsActivation) {
    if (state.originalActive == null) row.removeAttribute('data-active');
    else row.setAttribute('data-active', state.originalActive);
    if (state.originalCurrent == null) row.removeAttribute('aria-current');
    else row.setAttribute('aria-current', state.originalCurrent);
    if (state.originalCue)
      row.style.setProperty('--table-row-active-cue-width', state.originalCue);
    else row.style.removeProperty('--table-row-active-cue-width');
    state.ownsActivation = false;
  }
}
export function setRowActivation(
  row: HTMLTableRowElement,
  isActive: boolean,
  originalAttributes?: {current: string | null; active: string | null},
): void {
  const state = stateFor(row);
  if (isActive && !state.ownsActivation) {
    state.originalCurrent = originalAttributes
      ? originalAttributes.current
      : row.getAttribute('aria-current');
    state.originalActive = originalAttributes
      ? originalAttributes.active
      : row.getAttribute('data-active');
    state.originalCue = row.style.getPropertyValue(
      '--table-row-active-cue-width',
    );
    state.ownsActivation = true;
  }
  state.active = isActive;
  paint(row, state);
}
export function setRowSelection(
  row: HTMLTableRowElement,
  isSelected: boolean,
  hasRowHighlight: boolean,
): void {
  const state = stateFor(row);
  state.selected = isSelected;
  state.highlight = hasRowHighlight;
  if (isSelected) {
    row.setAttribute('aria-selected', 'true');
  } else {
    row.removeAttribute('aria-selected');
  }
  paint(row, state);
}
