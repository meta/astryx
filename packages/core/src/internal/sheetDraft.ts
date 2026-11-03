// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file sheetDraft.ts
 * @input A sheet's selection at open, its draft, and the last edit made
 * @output SheetDraftChange, hasSameSelection, nameSheetDraftChange — the
 *   rules a touch sheet's Save and dismissal share
 * @position Core-internal, shared by the Tokenizer sheet and the Lab sheets
 *   through `internal/touch-sheet`; not a public export
 *
 * A touch sheet edits a draft and reports it once, on Save, with one change:
 * the last edit that still holds, else the nearest net add or remove. A
 * dismissal asks before discarding only while the draft differs from the
 * selection at open, as a set: a row unchecked and checked again is no change.
 */

interface SheetDraftItem {
  id: string | number;
}

/** An edit of a sheet's draft, and the shape Save reports. */
export type SheetDraftChange<T> = {
  item: T;
  type: 'add' | 'create' | 'remove';
};

/** Whether two selections hold the same items, in any order. */
export function hasSameSelection<T extends SheetDraftItem>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>,
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const ids = new Set(a.map(item => item.id));
  return b.every(item => ids.has(item.id));
}

/**
 * The change Save reports for a draft that differs from the selection at
 * open, or `null` when nothing differs. The last edit names it when it still
 * holds: its item is in the draft and was not selected at open, or was
 * selected at open and is gone. Otherwise, after a removal, a `remove` names
 * an item that is gone; otherwise an `add` (`create` when the last edit
 * created that item) names an item that is new; otherwise a `remove` names
 * an item that is gone.
 */
export function nameSheetDraftChange<T extends SheetDraftItem>(
  valueAtOpen: ReadonlyArray<T>,
  draftValue: ReadonlyArray<T>,
  lastDraftChange: SheetDraftChange<T> | null,
): SheetDraftChange<T> | null {
  const wasSelected = (id: T['id']) => valueAtOpen.some(item => item.id === id);
  const isSelected = (id: T['id']) => draftValue.some(item => item.id === id);
  const added = draftValue.find(item => !wasSelected(item.id));
  const removed = valueAtOpen.find(item => !isSelected(item.id));
  const lastChangeIsNet =
    lastDraftChange != null &&
    (lastDraftChange.type === 'remove'
      ? wasSelected(lastDraftChange.item.id) &&
        !isSelected(lastDraftChange.item.id)
      : isSelected(lastDraftChange.item.id) &&
        !wasSelected(lastDraftChange.item.id));
  if (lastChangeIsNet) {
    return lastDraftChange;
  }
  if (lastDraftChange?.type === 'remove' && removed != null) {
    return {item: removed, type: 'remove'};
  }
  if (added != null) {
    const type: SheetDraftChange<T>['type'] =
      lastDraftChange?.item.id === added.id && lastDraftChange.type === 'create'
        ? 'create'
        : 'add';
    return {item: added, type};
  }
  if (removed != null) {
    return {item: removed, type: 'remove'};
  }
  return null;
}
