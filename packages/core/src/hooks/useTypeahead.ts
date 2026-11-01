// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypeahead.ts
 * @input Uses React useCallback/useEffect/useRef
 * @output Exports useTypeahead hook for first-character (type-to-focus) search
 * @position Core hook; adds APG typeahead to menus, listboxes, and other
 *   collections. Composes with useListFocus/useGridFocus (or any collection)
 *   via a caller-supplied getItemLabels + onMatch.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {useCallback, useEffect, useRef} from 'react';

export interface UseTypeaheadOptions {
  /**
   * Returns the current, in-DOM-order list of item labels to match against.
   * An entry may be `null`/empty to mark a non-matchable slot (its index is
   * preserved so it maps 1:1 to the caller's items).
   */
  getItemLabels: () => ReadonlyArray<string | null | undefined>;

  /**
   * Called with the index of the matched item so the caller can focus/select
   * it (e.g. `useListFocus`'s `focusItem`).
   */
  onMatch: (index: number) => void;

  /**
   * The index to start searching from — typically the currently focused item,
   * so repeated presses of the same letter cycle through matches. Any negative
   * value (the default) means nothing is current: the search runs from the top
   * and never skips the first item.
   */
  getCurrentIndex?: () => number;

  /**
   * Milliseconds of inactivity after which the typed buffer resets.
   * @default 750
   */
  resetMs?: number;

  /**
   * Whether an index should be skipped (e.g. disabled items).
   */
  isDisabled?: (index: number) => boolean;
}

export interface UseTypeaheadReturn {
  /**
   * Keydown handler. Call it (or let it fall through) from the collection's
   * own key handler. Returns `true` when it handled a printable character (so
   * the caller can `preventDefault`/stop further handling), `false` otherwise.
   */
  onKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => boolean;
  /** Clear the pending buffer (e.g. on close). */
  reset: () => void;
}

/**
 * Whether a key event represents a single printable character (a type-to-focus
 * candidate) rather than a control/navigation key or a shortcut chord.
 */
function isPrintableCharacter(e: React.KeyboardEvent | KeyboardEvent): boolean {
  return (
    e.key.length === 1 &&
    // Alt alone is not excluded: Option+letter on macOS composes a printable
    // character (Option+a → "å"), and dropping those makes accented labels
    // untypeable. Real chords still carry ctrl or meta — including AltGr,
    // which sets ctrlKey on Windows and Linux.
    !e.ctrlKey &&
    !e.metaKey &&
    // A key that is part of an input method's composition is the IME's, not
    // a jump. React's synthetic event surfaces `isComposing` too.
    !isComposingKey(e) &&
    // A lone space is used for activation in menus, not typeahead-from-empty.
    e.key !== ' '
  );
}

function isComposingKey(e: React.KeyboardEvent | KeyboardEvent): boolean {
  if ((e as {isComposing?: boolean}).isComposing === true) {
    return true;
  }
  const native = (e as {nativeEvent?: {isComposing?: boolean}}).nativeEvent;
  return native?.isComposing === true;
}

/**
 * First-character ("type-ahead") search for a collection.
 *
 * Buffers printable keystrokes (resetting after `resetMs` of inactivity),
 * matches items whose label starts with the buffer, and cycles from the
 * current index — so pressing "s" repeatedly walks through the "s" items
 * instead of sticking on the first. Space is reserved for activation and is
 * only treated as typeahead while a buffer is already active.
 *
 * Additive and collection-agnostic: it does not move focus itself; the caller
 * wires `onMatch` to its own focus/selection (e.g. `useListFocus.focusItem`).
 *
 * @example
 * ```
 * const {listRef, handleKeyDown, focusItem, getItems} = useListFocus(...);
 * const typeahead = useTypeahead({
 *   getItemLabels: () => getItems().map(el => el.textContent),
 *   onMatch: focusItem,
 *   getCurrentIndex: () => getItems().findIndex(el => el === document.activeElement),
 * });
 * const onKeyDown = (e) => { if (!typeahead.onKeyDown(e)) handleKeyDown(e); };
 * ```
 */
export function useTypeahead(options: UseTypeaheadOptions): UseTypeaheadReturn {
  const {
    getItemLabels,
    onMatch,
    getCurrentIndex,
    resetMs = 750,
    isDisabled,
  } = options;

  const bufferRef = useRef('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const reset = useCallback(() => {
    bufferRef.current = '';
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // A collection that unmounts, or that an `<Activity>` boundary hides,
  // mid-typing leaves no reset timer running and comes back with an empty
  // buffer, as the reset would have left it.
  useEffect(() => reset, [reset]);

  const scheduleReset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      bufferRef.current = '';
      timeoutRef.current = undefined;
    }, resetMs);
  }, [resetMs]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent): boolean => {
      // A bare Space with no active buffer is not typeahead (menus activate on
      // Space); once the user is mid-typing, Space extends the query. Chorded
      // with ctrl or meta it is neither — that is an OS or IME shortcut, and
      // consuming it would append a raw space that poisons the whole buffer.
      const isSpaceMidType =
        e.key === ' ' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !isComposingKey(e) &&
        bufferRef.current.length > 0;
      if (!isPrintableCharacter(e) && !isSpaceMidType) {
        return false;
      }

      const labels = getItemLabels();
      if (labels.length === 0) {
        return false;
      }

      // Pressing the SAME single character repeatedly cycles to the next match
      // rather than filtering deeper (APG behavior).
      const char = e.key.toLowerCase();
      const isRepeatSameChar =
        bufferRef.current.length > 0 &&
        bufferRef.current.split('').every(c => c === char);
      const nextBuffer = isRepeatSameChar ? char : bufferRef.current + char;
      bufferRef.current = nextBuffer;
      scheduleReset();

      const current = getCurrentIndex?.() ?? -1;
      const count = labels.length;
      const hasCurrent = current >= 0;
      const start = hasCurrent ? current : 0;
      // A single-character search starts AFTER the current item, so pressing a
      // letter walks to the next item beginning with it instead of re-matching
      // the one already selected (native <select> and APG getIndexByLetter).
      // Once the buffer is longer it is refining a match, so the current item
      // stays in range. With nothing current there is nothing to advance past.
      const offset = hasCurrent && nextBuffer.length === 1 ? 1 : 0;

      for (let i = 0; i < count; i++) {
        const index = (start + offset + i + count) % count;
        if (isDisabled?.(index)) {
          continue;
        }
        const label = labels[index];
        if (
          label != null &&
          label.trim().toLowerCase().startsWith(nextBuffer)
        ) {
          onMatch(index);
          return true;
        }
      }
      return true;
    },
    [getItemLabels, onMatch, getCurrentIndex, scheduleReset, isDisabled],
  );

  return {onKeyDown, reset};
}
