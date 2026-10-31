// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file hooks.ts
 * @input Uses untransformed DOM layout geometry from the Selector's outer
 *   anchor, listbox, and selected option
 * @output Hooks for Selector: useSelectedItemOffset, and useCombobox (public,
 *   exported from the Selector entry point; also used by CommandPalette, and
 *   by products for a combobox over a text field they render, spec:AST-075)
 * @position Selector hooks; used by Selector.tsx and CommandPalette
 *
 * SYNC: When useCombobox's options or return change, update:
 * - /packages/core/src/Selector/useCombobox.doc.mjs
 */

import {useCallback, useState} from 'react';
import {useHighlightedOptionScroll} from '../hooks/useHighlightedOptionScroll';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isImeKeyEvent} from '../utils/ime';
import type {RefObject} from 'react';
import type {SelectorOptionData} from './types';

// The selected row renders one optical pixel below the closed trigger label at
// the same mathematical center, so compensate before viewport clamping.
const SELECTED_ITEM_OPTICAL_OFFSET = 1;

/**
 * Return an element's document-relative layout top without CSS transforms.
 * getBoundingClientRect includes the popover's entry scale, which would make
 * the measured error grow with each option's distance from the menu top.
 */
function getLayoutTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

// =============================================================================
// useSelectedItemOffset - Position dropdown to center selected item over trigger
// =============================================================================

interface UseSelectedItemOffsetOptions {
  isOpen: boolean;
  selectedItemIndex: number;
  listboxId: string;
  listboxRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLElement | null>;
}

interface UseSelectedItemOffsetResult {
  offset: number;
  isPositioned: boolean;
}

/**
 * Calculates the offset needed to position the dropdown so that the selected
 * item appears centered over the outer selector control (macOS-style selector).
 *
 * The desired dropdown top is calculated directly from the anchor center and
 * selected-item center, then clamped to the viewport. This preserves the
 * default "selected item over trigger" behavior while letting the menu slide
 * upward near the bottom edge or downward near the top edge instead of being
 * clipped off-screen.
 */
export function useSelectedItemOffset({
  isOpen,
  selectedItemIndex,
  listboxId,
  listboxRef,
  anchorRef,
}: UseSelectedItemOffsetOptions): UseSelectedItemOffsetResult {
  const [offset, setOffset] = useState(0);
  const [isPositioned, setIsPositioned] = useState(false);

  const commitPosition = useCallback(
    (nextOffset: number, nextIsPositioned: boolean) => {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- selector popover position is derived from DOM layout
      setOffset(nextOffset);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- selector popover position is derived from DOM layout
      setIsPositioned(nextIsPositioned);
    },
    [],
  );

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      // Reset offset when closed
      commitPosition(0, false);
      return;
    }

    if (!listboxRef.current || !anchorRef.current) {
      commitPosition(0, true);
      return;
    }

    // Find the target item: selected item or first item
    const targetIndex = selectedItemIndex >= 0 ? selectedItemIndex : 0;
    const targetItemId = `${listboxId}-item-${targetIndex}`;
    // Use getElementById - works with special characters without escaping
    const targetItem = document.getElementById(targetItemId);

    if (!targetItem) {
      commitPosition(0, true);
      return;
    }

    const listbox = listboxRef.current;
    const anchorRect = anchorRef.current.getBoundingClientRect();

    // offset* metrics intentionally exclude the popover's entry transform.
    const listboxHeight = listbox.offsetHeight;
    if (listboxHeight <= 0) {
      commitPosition(0, true);
      return;
    }

    // Item center relative to listbox top. This remains stable even as the
    // popover animates between scale values. scrollTop keeps the calculation
    // correct when a previously scrolled listbox is reopened.
    const itemCenterInListbox =
      getLayoutTop(targetItem) -
      getLayoutTop(listbox) -
      listbox.scrollTop +
      targetItem.offsetHeight / 2;
    const anchorCenter = anchorRect.top + anchorRect.height / 2;

    // Desired top aligns the selected item's center with the anchor center.
    const desiredTop =
      anchorCenter - itemCenterInListbox - SELECTED_ITEM_OPTICAL_OFFSET;
    const viewportHeight = window.innerHeight;
    const maxTop = Math.max(0, viewportHeight - listboxHeight);
    const clampedTop = Math.min(Math.max(desiredTop, 0), maxTop);

    // useLayer positions the popover below the outer anchor. Apply a negative
    // block-start margin to the layer container so the listbox top moves from
    // anchorRect.bottom to clampedTop.
    const clampedOffset = Math.max(0, anchorRect.bottom - clampedTop);

    commitPosition(clampedOffset, true);
  }, [
    isOpen,
    selectedItemIndex,
    listboxId,
    listboxRef,
    anchorRef,
    commitPosition,
  ]);

  return {offset, isPositioned};
}

// =============================================================================
// useCombobox - Keyboard navigation and selection
// =============================================================================

/**
 * What useCombobox reads from an option: its value, and whether it can be
 * picked. Any option type that carries these works; Selector's
 * `SelectorOptionData` is the default.
 */
interface ComboboxOption {
  value: string;
  disabled?: boolean;
}

interface UseComboboxOptions<T extends ComboboxOption> {
  selectableItems: ReadonlyArray<T>;
  value?: string;
  isDisabled?: boolean;
  isOpen: boolean;
  hasSearch?: boolean;
  onOpen: () => unknown;
  onClose: () => void;
  onSelect?: (value: string) => void;
  /**
   * Clear the current value. When provided, pressing Delete or Backspace on the
   * closed trigger clears the selection — a keyboard equivalent of the clear
   * button, so clearing is not mouse-only. No-op when the popup is open (arrow
   * navigation owns those keys there) or when there is no value.
   */
  onClear?: () => void;
  /**
   * With `hasSearch`, printable characters typed on the trigger are appended to
   * the search query (opening the popup if needed), so type-to-find works
   * without a separate open step. Characters keep arriving here until focus
   * lands in the search input, which then owns its own typing.
   */
  onSearchSeed?: (char: string) => void;
  listboxId: string;
}

/** Spread onto the caller's field. */
interface ComboboxFieldProps {
  role: 'combobox';
  'aria-autocomplete': 'list';
  'aria-expanded': boolean;
  'aria-controls'?: string;
  'aria-activedescendant'?: string;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/** Spread onto the caller's listbox, which the caller names. */
interface ComboboxListboxProps {
  id: string;
  role: 'listbox';
  onMouseDown: (event: React.MouseEvent) => void;
}

/** Spread onto the caller's option at one index. */
interface ComboboxOptionProps {
  id: string;
  role: 'option';
  'aria-selected': boolean;
  'aria-disabled'?: true;
  onMouseMove: () => void;
  onClick: () => void;
}

/** The caller's own handlers for its field, run after the hook's. */
interface ComboboxFieldHandlers {
  // Method syntax keeps the parameter bivariant, so a handler typed for its
  // own element, such as an input, is accepted.
  onKeyDown?(event: React.KeyboardEvent): void;
}

interface UseComboboxResult<T extends ComboboxOption> {
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  getItemId: (index: number) => string;
  onTriggerClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  // Method syntax keeps a result built over a richer option type assignable
  // to `ReturnType<typeof useCombobox>`, the name released callers use.
  onItemSelect(item: T): void;
  onItemMouseEnter(item: T, index: number): void;
  getFieldProps: (props?: ComboboxFieldHandlers) => ComboboxFieldProps;
  getListboxProps: () => ComboboxListboxProps;
  getOptionProps: (index: number) => ComboboxOptionProps;
}

/** Whether a key is chorded with a modifier, such as Shift+Enter. */
function hasModifier(e: React.KeyboardEvent): boolean {
  return e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
}

/**
 * Handles keyboard navigation and selection for combobox/listbox patterns.
 *
 * Type-to-select is not handled here: callers that want it compose the shared
 * `useTypeahead` hook and run it ahead of this handler (see Selector). That
 * keeps matching consistent with the other collections and leaves consumers
 * whose own input already filters the items (CommandPalette) untouched.
 *
 * For a single-line text field the caller renders (spec:AST-075), `getFieldProps`,
 * `getListboxProps` and `getOptionProps` carry the combobox semantics, the
 * field's keys and the pointer model, while the caller keeps the field, the
 * rows and where the list renders. The caller announces each new result count
 * through useAnnounce (spec:AST-075 DEC-2), with the words the field shows.
 */
export function useCombobox<T extends ComboboxOption = SelectorOptionData>({
  selectableItems,
  value,
  isDisabled = false,
  isOpen,
  hasSearch = false,
  onOpen,
  onClose,
  onSelect,
  onClear,
  onSearchSeed,
  listboxId,
}: UseComboboxOptions<T>): UseComboboxResult<T> {
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const getItemId = useCallback(
    (index: number) => `${listboxId}-item-${index}`,
    [listboxId],
  );

  const getEnabledIndices = useCallback(() => {
    return selectableItems
      .map((item, i) => (!item.disabled ? i : -1))
      .filter(i => i >= 0);
  }, [selectableItems]);

  const findSelectedIndex = useCallback(() => {
    return selectableItems.findIndex(item => item.value === value);
  }, [selectableItems, value]);

  const closeAndReset = useCallback(() => {
    setHighlightedIndex(-1);
    onClose();
  }, [onClose]);

  const selectItem = useCallback(
    (item: T) => {
      if (item.disabled) {
        return;
      }
      onSelect?.(item.value);
      closeAndReset();
    },
    [onSelect, closeAndReset],
  );

  const onTriggerClick = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (isOpen) {
      closeAndReset();
    } else {
      const didOpen = onOpen() !== false;
      if (didOpen && !hasSearch) {
        const selectedIndex = findSelectedIndex();
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
    }
  }, [isDisabled, isOpen, onOpen, closeAndReset, findSelectedIndex, hasSearch]);

  // The scroll effect lives here, the highlight owner, so every consumer
  // (Selector, CommandPalette) shares one hover/keyboard split (#6077).
  const highlightOnHover = useHighlightedOptionScroll({
    isOpen,
    highlightedIndex,
    setHighlightedIndex,
    getOptionId: getItemId,
  });

  const onItemMouseEnter = useCallback(
    (item: T, index: number) => {
      if (!item.disabled) {
        highlightOnHover(index);
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

        case ' ':
          if (hasSearch) {
            break;
          }
        // A space mid-typeahead extends the query instead of activating; the
        // caller's useTypeahead claims it before this handler ever runs.
        // falls through
        case 'Enter':
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            const item = selectableItems[highlightedIndex];
            if (item && !item.disabled) {
              selectItem(item);
            }
          } else if (!isOpen) {
            const didOpen = onOpen() !== false;
            if (didOpen && !hasSearch) {
              const selectedIndex = findSelectedIndex();
              setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
            }
          }
          break;

        case 'Escape':
          if (isOpen) {
            e.preventDefault();
            closeAndReset();
          }
          break;

        case 'Tab':
          if (isOpen) {
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
          // Keyboard equivalent of the clear button (comboboxes-2): clear the
          // value from the closed trigger so clearing is not mouse-only. When
          // hasSearch is active these keys must edit the search text instead,
          // and when the popup is open arrow navigation owns interaction, so
          // only handle the closed non-search case with a clearable value.
          if (!hasSearch && !isOpen && onClear != null && value != null) {
            e.preventDefault();
            onClear();
          }
          break;

        default:
          // Keys land here only while the trigger holds focus — once the search
          // input takes over it handles its own typing — so they belong in the
          // query, including the ones racing the open.
          if (
            hasSearch &&
            onSearchSeed &&
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey
          ) {
            if (isOpen || onOpen() !== false) {
              onSearchSeed(e.key);
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
      selectItem,
      findSelectedIndex,
      getEnabledIndices,
      hasSearch,
      onClear,
      onSearchSeed,
      value,
    ],
  );

  // ---------------------------------------------------------------------------
  // A field the caller renders (spec:AST-075). Focus never leaves it: the
  // active option is named through aria-activedescendant, and the field keeps
  // every key the list does not need.
  // ---------------------------------------------------------------------------

  // The listbox renders only while it has options; an open list with none
  // shows the caller's empty state instead, which is not a listbox.
  const isListboxShown = isOpen && selectableItems.length > 0;
  const activeDescendant =
    isListboxShown &&
    highlightedIndex >= 0 &&
    highlightedIndex < selectableItems.length
      ? getItemId(highlightedIndex)
      : undefined;

  const onFieldKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      // A chord is the field's own command, such as Shift+Enter, except
      // Escape: whatever modifier is held, it hides a shown list first, so an
      // enclosing layer never closes on the same press. An input method
      // composing text owns every key, Escape included, until it commits or
      // cancels.
      if (
        isDisabled ||
        isImeKeyEvent(e.nativeEvent) ||
        (hasModifier(e) && e.key !== 'Escape')
      ) {
        return;
      }
      const enabledIndices = getEnabledIndices();
      if (!isOpen) {
        // A single-line field has no caret work for ArrowDown, so it shows the
        // hidden list.
        if (
          e.key === 'ArrowDown' &&
          selectableItems.length > 0 &&
          onOpen() !== false
        ) {
          e.preventDefault();
          setHighlightedIndex(enabledIndices[0] ?? -1);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          // The list keeps the arrows even with nothing to move to, so they
          // never move the caret under an open list.
          e.preventDefault();
          if (enabledIndices.length === 0) {
            break;
          }
          // Wraps at either end, as the typeahead input does; with nothing
          // active, ArrowDown starts at the first option and ArrowUp at the
          // last.
          const count = enabledIndices.length;
          const position = enabledIndices.indexOf(highlightedIndex);
          const next =
            e.key === 'ArrowDown'
              ? (position + 1) % count
              : position < 0
                ? count - 1
                : (position - 1 + count) % count;
          setHighlightedIndex(enabledIndices[next]);
          break;
        }
        case 'Enter': {
          // Only a pick stops the field's own Enter (a send, a newline).
          const item =
            highlightedIndex >= 0 ? selectableItems[highlightedIndex] : null;
          if (item != null && !item.disabled) {
            e.preventDefault();
            selectItem(item);
          }
          break;
        }
        case 'Escape':
          // Claimed, so an enclosing layer stays open on this press.
          e.preventDefault();
          closeAndReset();
          break;
        default:
          // Every other key reaches the field unchanged. Home and End stay
          // with the caret until their behavior is decided (AST-075 OQ2).
          break;
      }
    },
    [
      isDisabled,
      getEnabledIndices,
      isOpen,
      selectableItems,
      onOpen,
      highlightedIndex,
      selectItem,
      closeAndReset,
    ],
  );

  const getFieldProps = useCallback(
    (props: ComboboxFieldHandlers = {}): ComboboxFieldProps => {
      return {
        role: 'combobox',
        'aria-expanded': isListboxShown,
        'aria-autocomplete': 'list',
        'aria-controls': isListboxShown ? listboxId : undefined,
        'aria-activedescendant': activeDescendant,
        onKeyDown: event => {
          onFieldKeyDown(event);
          if (!event.defaultPrevented) {
            props.onKeyDown?.(event);
          }
        },
      };
    },
    [isListboxShown, listboxId, activeDescendant, onFieldKeyDown],
  );

  const getListboxProps = useCallback(
    (): ComboboxListboxProps => ({
      id: listboxId,
      role: 'listbox',
      // A press anywhere in the list keeps focus in the field (FR6).
      onMouseDown: event => event.preventDefault(),
    }),
    [listboxId],
  );

  const getOptionProps = useCallback(
    (index: number): ComboboxOptionProps => {
      const item = selectableItems[index];
      const isOptionDisabled = item?.disabled === true;
      return {
        id: getItemId(index),
        role: 'option',
        'aria-selected': index === highlightedIndex,
        ...(isOptionDisabled ? {'aria-disabled': true as const} : {}),
        onMouseMove: () => {
          if (item != null && !isOptionDisabled && index !== highlightedIndex) {
            highlightOnHover(index);
          }
        },
        onClick: () => {
          if (item != null) {
            selectItem(item);
          }
        },
      };
    },
    [
      selectableItems,
      getItemId,
      highlightedIndex,
      highlightOnHover,
      selectItem,
    ],
  );

  return {
    highlightedIndex,
    setHighlightedIndex,
    getItemId,
    onTriggerClick,
    onKeyDown,
    onItemSelect: selectItem,
    onItemMouseEnter,
    getFieldProps,
    getListboxProps,
    getOptionProps,
  };
}
