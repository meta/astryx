// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowPressGuard.ts
 * @input A body row element, the press target, and the checks to apply
 * @output Whether the press belongs to something other than the row
 * @position Shared Table row-press guard for the activation, expansion, and
 *   tree row paths
 *
 * One definition for "this click belongs to something else", so the three
 * row-press surfaces cannot drift apart on target containment, the shared
 * interactive catalog, or text selection. Callers keep their own checks for
 * plugin-owned state (a competing current owner is activation's to know).
 * Descendant behavior is never suppressed — only the row's own request is.
 */

import {
  hasInteractiveAncestor,
  hasTextSelection,
} from '../hooks/useClickableContainer';

export interface RowPressGuardOptions {
  /**
   * A press inside a nested table row belongs to that row, even when the
   * cell looks plain: only the nearest row owns the press. @default true
   */
  readonly nestedRow?: boolean;
  /**
   * A press on a read-only control belongs to that control: the shared
   * guard excludes `aria-readonly` from interactive, so without this the
   * row would press under it. @default true
   */
  readonly readonlyScope?: boolean;
  /**
   * How a text selection suppresses clicks: `intersect` suppresses when any
   * selected range touches the row (either end inside it, or the ends on
   * opposite sides of it), `contain` only when the selection starts inside
   * it, `none` never. Standing selection never blocks keyboard presses;
   * check those separately. @default 'intersect'
   */
  readonly selection?: 'intersect' | 'contain' | 'none';
}

/**
 * Whether two selection ends intersect the row: either end inside it, or the
 * ends on opposite sides of it in document order (a drag spanning across the
 * row). Pure over the end nodes so tests can pin the geometry without
 * depending on Selection range normalization.
 */
export function selectionEndsIntersectRow(
  row: Element,
  anchorNode: Node | null,
  focusNode: Node | null,
): boolean {
  if (anchorNode == null || focusNode == null) {
    return false;
  }
  if (row.contains(anchorNode) || row.contains(focusNode)) {
    return true;
  }
  // Either end inside the row is covered above; what remains is a selection
  // spanning across it, with the ends on opposite sides in document order.
  const anchorPosition = row.compareDocumentPosition(anchorNode);
  const focusPosition = row.compareDocumentPosition(focusNode);
  const anchorBefore =
    (anchorPosition & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  const anchorAfter = (anchorPosition & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const focusBefore = (focusPosition & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  const focusAfter = (focusPosition & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return (anchorBefore && focusAfter) || (anchorAfter && focusBefore);
}

/**
 * Whether a live text selection intersects the row. Every selected range is
 * checked, so a multi-range selection (one range per table cell in some
 * browsers) suppresses the click when any range touches the row. Endpoints
 * are compared in document order rather than through
 * `selection.containsNode`: equivalent semantics, and jsdom's `containsNode`
 * answers true for disjoint nodes, which would make any page selection block
 * every row under test.
 */
function selectionIntersectsRow(row: Element): boolean {
  if (typeof document === 'undefined' || !('getSelection' in document)) {
    return false;
  }
  const selection = document.getSelection();
  if (selection == null || selection.isCollapsed) {
    return false;
  }
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (range.collapsed) {
      continue;
    }
    if (
      selectionEndsIntersectRow(row, range.startContainer, range.endContainer)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a pointer press must not drive its row: portalled content rendered
 * outside the row, nested interactive descendants (buttons, links, inputs,
 * and equivalent roles share one definition in `useClickableContainer`),
 * editable surfaces, or a text selection per the caller's `selection` mode.
 */
export function shouldSuppressRowPress(
  row: HTMLTableRowElement,
  target: EventTarget | null,
  options?: RowPressGuardOptions,
): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  if (!row.contains(target)) {
    return true;
  }
  if (options?.nestedRow !== false && target !== row) {
    const nearestRow = target.closest('tr');
    if (nearestRow != null && nearestRow !== row) {
      return true;
    }
  }
  if (target !== row && hasInteractiveAncestor(target, row)) {
    return true;
  }
  if (options?.readonlyScope !== false && target !== row) {
    const readonlyScope = target.closest('[aria-readonly="true"]');
    if (readonlyScope != null && row.contains(readonlyScope)) {
      return true;
    }
  }
  // An edit inside a contenteditable region is not a row press. The shared
  // clickable-container guard does not cover contenteditable (it would
  // change every other clickable surface), so the row path checks it here.
  if (
    target !== row &&
    target.closest('[contenteditable]:not([contenteditable="false"])') != null
  ) {
    return true;
  }
  const selection = options?.selection ?? 'intersect';
  if (selection === 'intersect') {
    if (selectionIntersectsRow(row)) {
      return true;
    }
  } else if (selection === 'contain') {
    if (hasTextSelection(row)) {
      return true;
    }
  }
  return false;
}
