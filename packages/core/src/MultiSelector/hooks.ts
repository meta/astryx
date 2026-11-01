// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file hooks.ts
 * @input Uses React hooks, MultiSelectorOptionData type
 * @output Exports useMultiCombobox hook
 * @position Public hook, exported from the MultiSelector entry point; used by
 *   MultiSelector.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/MultiSelector/index.ts
 * - /packages/core/src/MultiSelector/useMultiCombobox.doc.mjs
 */

import {useCallback, useRef, useState} from 'react';
import {isRtlElement} from '../hooks/isRtlElement';
import {useHighlightedOptionScroll} from '../hooks/useHighlightedOptionScroll';
import type {MultiSelectorOptionData} from './types';
import {findTypeaheadMatch} from '../utils/typeaheadMatch';

interface UseMultiComboboxOptions {
  selectableItems: MultiSelectorOptionData[];
  isDisabled?: boolean;
  isOpen: boolean;
  hasSearch?: boolean;
  onOpen: () => unknown;
  onClose: () => void;
  onToggle: (itemValue: string) => void;
  /**
   * Clear all selected values. When provided, pressing Delete or Backspace on
   * the closed trigger clears the selection — a keyboard equivalent of the
   * clear button (comboboxes-2). No-op when the popup is open or search is on.
   */
  onClear?: () => void;
  /**
   * Whether at least one value is selected (i.e. there is something to clear).
   * The Delete/Backspace clear path is skipped when false.
   */
  hasValue?: boolean;
  listboxId: string;
  /**
   * Whether the popup is a grid (`spec:AST-058`): rows pair an option cell
   * with an action cell, the inline-end arrow moves the highlight from the
   * option to the action and the inline-start arrow back, and Enter on the
   * action cell activates the caller's control instead of toggling.
   */
  isGrid?: boolean;
  /** Whether the row at `index` carries an action to move to. */
  rowHasAction?: (index: number) => boolean;
  /** Activate the control in the highlighted row's action cell. */
  onActivateAction?: (index: number) => void;
}

/** Which cell of the highlighted row the highlight is on. */
export type MultiComboboxCell = 'option' | 'action';

interface UseMultiComboboxResult {
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  /** `'action'` only in a grid, while the highlight is on the action cell. */
  highlightedCell: MultiComboboxCell;
  getItemId: (index: number) => string;
  /** Id of the action cell of the row at `index` (the active descendant there). */
  getActionCellId: (index: number) => string;
  /** The element `aria-activedescendant` names, or undefined. */
  activeDescendantId: string | undefined;
  onTriggerClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onItemMouseEnter: (
    item: MultiSelectorOptionData,
    index: number,
    cell?: MultiComboboxCell,
  ) => void;
}

/**
 * Handles keyboard navigation and toggle logic for multi-select combobox.
 * Works like useCombobox (index-based) but toggling does NOT close the dropdown.
 *
 * The caller must ensure selectableItems is in the same order as the rendered DOM.
 */
export function useMultiCombobox({
  selectableItems,
  isDisabled = false,
  isOpen,
  hasSearch = false,
  onOpen,
  onClose,
  onToggle,
  onClear,
  hasValue = false,
  listboxId,
  isGrid = false,
  rowHasAction,
  onActivateAction,
}: UseMultiComboboxOptions): UseMultiComboboxResult {
  const [highlightedIndex, setHighlightedIndexState] = useState<number>(-1);
  const [highlightedCell, setHighlightedCell] =
    useState<MultiComboboxCell>('option');
  // Every move between rows lands on the option cell (spec:AST-058 FR5).
  const setHighlightedIndex = useCallback((index: number) => {
    setHighlightedIndexState(index);
    setHighlightedCell('option');
  }, []);
  const [typeahead, setTypeahead] = useState('');
  const typeaheadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const getItemId = useCallback(
    (index: number) => `${listboxId}-item-${index}`,
    [listboxId],
  );
  const getActionCellId = useCallback(
    (index: number) => `${listboxId}-item-${index}-action`,
    [listboxId],
  );
  const activeDescendantId =
    isOpen && highlightedIndex >= 0
      ? isGrid && highlightedCell === 'action'
        ? getActionCellId(highlightedIndex)
        : getItemId(highlightedIndex)
      : undefined;

  const getEnabledIndices = useCallback(() => {
    return selectableItems
      .map((item, i) => (!item.disabled ? i : -1))
      .filter(i => i >= 0);
  }, [selectableItems]);

  const closeAndReset = useCallback(() => {
    setHighlightedIndex(-1);
    onClose();
  }, [onClose, setHighlightedIndex]);

  const onTriggerClick = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (isOpen) {
      closeAndReset();
    } else {
      const didOpen = onOpen() !== false;
      if (didOpen && !hasSearch) {
        setHighlightedIndex(0);
      }
    }
  }, [
    isDisabled,
    isOpen,
    onOpen,
    closeAndReset,
    hasSearch,
    setHighlightedIndex,
  ]);

  // The scroll effect lives here, the highlight owner, so the hover/keyboard
  // split is shared instead of re-implemented in MultiSelector.tsx (#6077).
  const highlightOnHover = useHighlightedOptionScroll({
    isOpen,
    highlightedIndex,
    setHighlightedIndex,
    getOptionId: getItemId,
  });

  const onItemMouseEnter = useCallback(
    (
      item: MultiSelectorOptionData,
      index: number,
      cell: MultiComboboxCell = 'option',
    ) => {
      // The action cell is the caller's control, usable whether or not the
      // option itself is disabled (spec:AST-058 FR4).
      if (cell === 'action') {
        highlightOnHover(index);
        setHighlightedCell('action');
        return;
      }
      if (!item.disabled) {
        highlightOnHover(index);
        setHighlightedCell('option');
      }
    },
    [highlightOnHover],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isDisabled) {
        return;
      }

      const enabledIndices = getEnabledIndices();

      // In a grid the horizontal arrows move between the row's two cells,
      // following visual direction under RTL (spec:AST-058 FR5). Outside a
      // grid, or with no row highlighted, they keep their default meaning
      // (the caret, in a search input).
      if (isGrid && isOpen && highlightedIndex >= 0) {
        const isRtl = isRtlElement(e.currentTarget as HTMLElement);
        const inlineEnd = isRtl ? 'ArrowLeft' : 'ArrowRight';
        const inlineStart = isRtl ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === inlineEnd) {
          if (
            highlightedCell === 'option' &&
            rowHasAction?.(highlightedIndex) === true
          ) {
            e.preventDefault();
            setHighlightedCell('action');
          }
          return;
        }
        if (e.key === inlineStart) {
          if (highlightedCell === 'action') {
            e.preventDefault();
            setHighlightedCell('option');
          }
          return;
        }
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            if (onOpen() !== false) {
              setHighlightedIndex(0);
            }
          } else {
            const currentEnabledPos = enabledIndices.indexOf(highlightedIndex);
            const nextPos = Math.min(
              currentEnabledPos + 1,
              enabledIndices.length - 1,
            );
            setHighlightedIndex(enabledIndices[nextPos] ?? highlightedIndex);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            if (onOpen() !== false) {
              setHighlightedIndex(selectableItems.length - 1);
            }
          } else {
            const currentEnabledPos = enabledIndices.indexOf(highlightedIndex);
            const prevPos = Math.max(currentEnabledPos - 1, 0);
            setHighlightedIndex(enabledIndices[prevPos] ?? highlightedIndex);
          }
          break;

        case 'Enter':
        case ' ':
          // Don't intercept Space when search input is focused
          if (e.key === ' ' && hasSearch) {
            break;
          }
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            if (isGrid && highlightedCell === 'action') {
              // The highlight is on the caller's control: fire it, and only
              // it — the selection does not change (spec:AST-058 FR4).
              onActivateAction?.(highlightedIndex);
              break;
            }
            const item = selectableItems[highlightedIndex];
            if (item && !item.disabled) {
              onToggle(item.value);
            }
          } else if (!isOpen) {
            const didOpen = onOpen() !== false;
            if (didOpen && !hasSearch) {
              setHighlightedIndex(0);
            }
          }
          break;

        case 'Tab':
          if (isOpen) {
            closeAndReset();
          }
          break;

        case 'Escape':
          if (isOpen) {
            e.preventDefault();
            closeAndReset();
          }
          break;

        case 'Home':
          e.preventDefault();
          if (isOpen && enabledIndices.length > 0) {
            setHighlightedIndex(enabledIndices[0]);
          }
          break;

        case 'End':
          e.preventDefault();
          if (isOpen && enabledIndices.length > 0) {
            setHighlightedIndex(enabledIndices[enabledIndices.length - 1]);
          }
          break;

        // PageUp/PageDown mirror Home/End. In search mode Home/End stay on
        // the input for caret movement (APG editable combobox), so these are
        // the sanctioned substitute for jumping to the first/last option.
        case 'PageUp':
          e.preventDefault();
          if (isOpen && enabledIndices.length > 0) {
            setHighlightedIndex(enabledIndices[0]);
          }
          break;

        case 'PageDown':
          e.preventDefault();
          if (isOpen && enabledIndices.length > 0) {
            setHighlightedIndex(enabledIndices[enabledIndices.length - 1]);
          }
          break;

        case 'Delete':
        case 'Backspace':
          // Keyboard equivalent of the clear button (comboboxes-2): clear all
          // selected values from the closed trigger so clearing is not
          // mouse-only. Skipped in search mode (keys edit the query) and while
          // the popup is open (arrow navigation owns interaction).
          if (!hasSearch && !isOpen && onClear != null && hasValue) {
            e.preventDefault();
            onClear();
          }
          break;

        default:
          // Typeahead only when search is not present
          if (!hasSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const newTypeahead = typeahead + e.key;
            // INV17: the shared type-to-select fold, as Selector uses.
            const matchIndex = findTypeaheadMatch(
              selectableItems.flatMap((item, i) => (item.disabled ? [] : [i])),
              i => selectableItems[i].label,
              newTypeahead,
            );
            const didOpen = isOpen || matchIndex < 0 || onOpen() !== false;
            if (didOpen) {
              setTypeahead(newTypeahead);
              if (typeaheadTimeoutRef.current) {
                clearTimeout(typeaheadTimeoutRef.current);
              }
              typeaheadTimeoutRef.current = setTimeout(() => {
                setTypeahead('');
              }, 500);
              if (matchIndex >= 0) {
                setHighlightedIndex(matchIndex);
              }
            }
          }
          break;
      }
    },
    [
      isDisabled,
      isOpen,
      onOpen,
      closeAndReset,
      selectableItems,
      highlightedIndex,
      highlightedCell,
      isGrid,
      rowHasAction,
      onActivateAction,
      setHighlightedIndex,
      onToggle,
      getEnabledIndices,
      typeahead,
      hasSearch,
      onClear,
      hasValue,
    ],
  );

  return {
    highlightedIndex,
    setHighlightedIndex,
    highlightedCell,
    getItemId,
    getActionCellId,
    activeDescendantId,
    onTriggerClick,
    onKeyDown,
    onItemMouseEnter,
  };
}
