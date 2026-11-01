// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListFocus.ts
 * @input Uses React useCallback, useRef, useIsomorphicLayoutEffect,
 *   isRtlElement
 * @output Exports useListFocus hook for linear list keyboard navigation
 * @position Core hook; used by TabMenu for dropdown menu navigation, Toolbar
 *   for roving tabindex, ButtonGroup, ContextMenu, NavHeadingMenu, and more.
 *   Auto-detects RTL from the container's computed direction so horizontal
 *   arrow keys follow visual direction (WCAG 1.3.2).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useListFocus.doc.mjs
 * - /packages/core/src/hooks/useListFocus.test.tsx
 */

import {useCallback, useRef} from 'react';
import {isRtlElement} from './isRtlElement';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {focusForLastInput} from '../utils/focusReturn';

/**
 * Navigation orientation for a linear list.
 * - `'horizontal'`: ArrowLeft/ArrowRight move between items.
 * - `'vertical'`: ArrowUp/ArrowDown move between items.
 * - `'both'`: all four arrows move between items (in linear DOM order).
 */
export type ListFocusOrientation = 'horizontal' | 'vertical' | 'both';

/**
 * Configuration for list focus behavior
 */
export interface UseListFocusOptions {
  /**
   * Selector for focusable items within the list.
   * @default '[role="menuitem"]'
   */
  itemSelector?: string;

  /**
   * Selector identifying a list boundary — used to scope a list that contains
   * *nested* lists of the same kind (e.g. a menu with submenu flyouts).
   *
   * Overlays like submenu flyouts render inline (native popover, not a
   * portal), so a nested list's items are DOM descendants of the parent list.
   * Without scoping, the parent's `querySelectorAll` sweeps the nested items
   * into its roving order (leaving hidden items `.focus()` can't land on), and
   * key events from the nested list bubble into the parent's handler (moving
   * focus twice). When set, `useListFocus`:
   *   - counts an item as its own only when the item's nearest
   *     `boundarySelector` ancestor is this list's container, and
   *   - ignores key events whose nearest `boundarySelector` ancestor is not
   *     this list's container (i.e. they originated in a nested list).
   *
   * Typically `'[role="menu"]'` for menus. Omit for flat lists.
   */
  boundarySelector?: string;

  /**
   * Whether arrow navigation wraps around at the ends.
   * @default true
   */
  wrap?: boolean;

  /**
   * Callback when Escape key is pressed. Supplying it also makes the list
   * consume the key (`preventDefault`); without it Escape passes through to
   * the surrounding layer.
   */
  onEscape?: () => void;

  /**
   * Navigation orientation. `'horizontal'` uses ArrowLeft/ArrowRight,
   * `'vertical'` uses ArrowUp/ArrowDown, `'both'` accepts all four arrows.
   * @default 'vertical'
   */
  orientation?: ListFocusOrientation;

  /**
   * Whether Home/End jump to the first/last enabled item.
   * @default true
   */
  hasHomeEnd?: boolean;

  /**
   * Whether PageDown/PageUp page through a list that scrolls: PageDown moves
   * to the last enabled item fully visible in the container, and pressed
   * there again one viewport further; PageUp is the mirror. Neither wraps.
   * In a list that does not scroll they act as End/Home.
   * @default false
   */
  hasPaging?: boolean;

  /**
   * Roving-tabindex ownership. When true, the hook manages a single tab stop
   * across the items: exactly one enabled item carries `tabindex="0"` and the
   * rest `tabindex="-1"`. The tab stop is stamped on mount and repaired
   * whenever items mount/unmount or toggle disabled, and moves with arrow
   * navigation. Attach the returned {@link UseListFocusReturn.handleFocus} to
   * the container's `onFocus` to keep the stop in sync after clicks or
   * programmatic focus.
   *
   * When false (the default), the hook only *moves* focus (`.focus()`) and
   * never touches `tabindex` — the caller owns tab-stop management.
   * @default false
   */
  hasRovingTabIndex?: boolean;

  /**
   * When true, arrow keys are not stolen from a nested text input/textarea
   * whose caret is not at the boundary in the direction of travel (or that has
   * a non-collapsed selection), and are never stolen from a nested
   * `contenteditable` (rich-text editor / chat composer). This preserves
   * normal caret movement while the user is editing inline within the list
   * (e.g. a toolbar search field or composer).
   * @default false
   */
  hasCaretGuard?: boolean;
}

/**
 * Options only Core components pass; this module's internal export, not
 * re-exported from `hooks/index.ts`, so not public API.
 */
export interface InternalListFocusOptions extends UseListFocusOptions {
  /**
   * With `hasRovingTabIndex`, keeps one tab stop while every item is disabled:
   * returns the elements that share it, the stop first. The hook gives the
   * first `tabindex="0"` and the rest `tabindex="-1"`. For a group that stays
   * focusable while disabled, so its disabled reason is reachable by keyboard.
   * Unset (the default): no item holds the stop while every item is disabled.
   */
  disabledTabStop?: (list: HTMLElement) => ReadonlyArray<HTMLElement>;
  /**
   * Moves focus with the focus the last input calls for
   * (`architecture:interaction-modality` INV1): after a pointer press a
   * focused item shows no keyboard ring, after a key press it does. For a list
   * whose items draw the ring and that opens from a pointer, such as a context
   * menu. Unset (the default): a plain `focus()`.
   */
  focusFollowsLastInput?: boolean;
}

/**
 * Return type for useListFocus hook
 */
export interface UseListFocusReturn<T extends HTMLElement = HTMLElement> {
  /**
   * Ref to attach to the list container element.
   */
  listRef: React.RefObject<T | null>;

  /**
   * Key down handler to attach to the list container.
   */
  handleKeyDown: (e: React.KeyboardEvent) => void;

  /**
   * Focus handler to attach to the container's `onFocus`. Keeps the roving tab
   * stop in sync when `hasRovingTabIndex` is enabled; a no-op otherwise, so it is
   * always safe to attach.
   */
  handleFocus: (e: React.FocusEvent) => void;

  /**
   * Focus a specific item by index.
   */
  focusItem: (index: number) => void;

  /**
   * Focus the first enabled item. Returns true when an item was focused.
   */
  focusFirst: () => boolean;

  /**
   * Focus the last enabled item. Returns true when an item was focused.
   */
  focusLast: () => boolean;

  /**
   * Whether a key event belongs to this list level (vs. a nested list that
   * shares the same `boundarySelector`). Useful when a consumer wraps
   * `handleKeyDown` with extra behavior (Enter/Space activation, typeahead)
   * and must apply it only to events this level owns. Always true when no
   * `boundarySelector` is configured.
   */
  ownsEvent: (e: React.KeyboardEvent) => boolean;

  /**
   * The current, in-DOM-order list of this level's focusable items (already
   * scoped by `boundarySelector`). Exposed so consumers can build typeahead
   * targets from the same source of truth as roving focus, rather than
   * re-querying and re-filtering.
   */
  getItems: () => HTMLElement[];
}

// Text-editing inputs whose caret must not be hijacked by arrow navigation.
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

/**
 * Whether `el` sits under a `hidden` or `inert` ancestor that is itself inside
 * `listEl` (the list's own state is not consulted). Such a row cannot take
 * focus — a drilled-in menu hides the rows a view replaced — so it
 * leaves the roving order and the typeahead.
 */
function isHiddenWithin(el: HTMLElement, listEl: HTMLElement): boolean {
  const hidden = el.parentElement?.closest<HTMLElement>('[hidden],[inert]');
  return hidden != null && hidden !== listEl && listEl.contains(hidden);
}

/**
 * The nearest `contenteditable` root for `el`, or null when `el` is not inside
 * an editable region. Prefers the browser's `isContentEditable` property and
 * falls back to the closest `[contenteditable]` ancestor whose value is not
 * `"false"` (so environments without `isContentEditable` still work).
 */
function getContentEditableRoot(el: HTMLElement): HTMLElement | null {
  if (el.isContentEditable) {
    return el;
  }
  const candidate = el.closest<HTMLElement>('[contenteditable]');
  if (candidate && candidate.getAttribute('contenteditable') !== 'false') {
    return candidate;
  }
  return null;
}

/**
 * Whether an arrow/Home/End key should be left to the browser because the
 * event target is a text-editing element whose caret is not yet at the boundary
 * in the direction of travel (or a selection is present). Returns true when the
 * list should NOT steal the key.
 *
 * Covers three editing surfaces:
 * - `<textarea>` and text-type `<input>` — use `selectionStart`/`selectionEnd`
 *   to steal only at the boundary in the travel direction.
 * - `contenteditable` (rich-text editor / chat composer) — precise caret
 *   boundary detection in an arbitrary editable subtree is fragile, so we err
 *   on the side of never hijacking an active editor: defer on every caret key
 *   whenever focus is inside a non-empty contenteditable. (An empty editable
 *   has nothing to caret through, so navigation may proceed.)
 */
function shouldDeferToCaret(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // contenteditable (covers an element with contenteditable="" / "true" and
  // descendants that inherit it). `isContentEditable` is the reliable property
  // in the browser; fall back to the nearest `contenteditable` ancestor for
  // environments (e.g. jsdom) that don't implement the property.
  const editableRoot = getContentEditableRoot(target);
  if (editableRoot) {
    const selection =
      typeof window !== 'undefined' ? window.getSelection() : null;
    // A non-collapsed selection means the user is selecting text — never steal.
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      return true;
    }
    // Collapsed caret (or no selection API): defer whenever the editor has
    // content, so arrow keys stay with the active rich-text editor.
    return (editableRoot.textContent ?? '').length > 0;
  }

  const isTextarea = target.tagName === 'TEXTAREA';
  const isTextInput =
    target.tagName === 'INPUT' &&
    TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  if (!isTextarea && !isTextInput) {
    return false;
  }
  const input = target as HTMLInputElement | HTMLTextAreaElement;
  const {selectionStart, selectionEnd, value} = input;
  // A non-collapsed selection means the user is selecting text — never steal.
  if (selectionStart !== selectionEnd) {
    return true;
  }
  // number inputs report null selection; treat as "always defer" for caret keys.
  if (selectionStart == null) {
    return true;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Home') {
    // Defer unless the caret is at the very start.
    return selectionStart > 0;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'End') {
    // Defer unless the caret is at the very end.
    return selectionStart < value.length;
  }
  return false;
}

/**
 * Hook for managing keyboard navigation within a linear list.
 *
 * Implements WAI-ARIA menu/listbox/toolbar pattern:
 * - ArrowDown/ArrowRight: Move to next item (wraps to first)
 * - ArrowUp/ArrowLeft: Move to previous item (wraps to last)
 * - Home: Move to first item
 * - End: Move to last item
 * - Escape: runs `onEscape` and consumes the key. With no `onEscape` the key
 *   is left alone, so a surrounding layer can still dismiss on it.
 *
 * By default the hook only *moves* focus and leaves `tabindex` management to
 * the caller. Opt into {@link UseListFocusOptions.hasRovingTabIndex} for a hook
 * that owns a single tab stop (roving tabindex) across the items — stamping and
 * repairing it as items mount/unmount or toggle disabled — for toolbars,
 * segmented controls, tab strips, and similar composite widgets.
 *
 * @example
 * ```
 * const {listRef, handleKeyDown} = useListFocus({
 *   onEscape: () => layer.hide(),
 * });
 *
 * <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
 *   {items.map(item => <div role="menuitem" tabIndex={0}>{item}</div>)}
 * </div>
 * ```
 *
 * Roving-tabindex composite (e.g. a toolbar):
 *
 * @example
 * ```
 * const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
 *   itemSelector: 'button, input, [tabindex]',
 *   orientation: 'horizontal',
 *   hasRovingTabIndex: true,
 *   hasCaretGuard: true,
 * });
 *
 * <div ref={listRef} role="toolbar" onKeyDown={handleKeyDown} onFocus={handleFocus}>
 *   {children}
 * </div>
 * ```
 */
export function useListFocus<T extends HTMLElement = HTMLElement>(
  options: UseListFocusOptions = {},
): UseListFocusReturn<T> {
  return useInternalListFocus<T>(options);
}

/**
 * {@link useListFocus} with the Core-only {@link InternalListFocusOptions}.
 * Not re-exported from `hooks/index.ts`.
 */
export function useInternalListFocus<T extends HTMLElement = HTMLElement>(
  options: InternalListFocusOptions = {},
): UseListFocusReturn<T> {
  const {
    itemSelector = '[role="menuitem"]',
    boundarySelector,
    wrap = true,
    onEscape,
    orientation = 'vertical',
    hasHomeEnd = true,
    hasPaging = false,
    hasRovingTabIndex = false,
    disabledTabStop,
    hasCaretGuard = false,
    focusFollowsLastInput = false,
  } = options;

  const listRef = useRef<T>(null);

  /**
   * Whether an item is disabled and therefore cannot receive DOM focus.
   * A `.focus()` call on such an element silently no-ops, so navigation must
   * skip these to avoid freezing on a disabled item (menus-4, navigation-5).
   */
  const isItemDisabled = useCallback((el: HTMLElement): boolean => {
    return (
      el.getAttribute('aria-disabled') === 'true' ||
      (el as HTMLButtonElement).disabled === true ||
      el.hasAttribute('disabled')
    );
  }, []);

  /**
   * Get all focusable items in the list.
   */
  const getItems = useCallback((): HTMLElement[] => {
    const listEl = listRef.current;
    if (!listEl) {
      return [];
    }
    const matched = Array.from(
      listEl.querySelectorAll<HTMLElement>(itemSelector),
    ).filter(el => !isHiddenWithin(el, listEl));
    // When a boundary is set, keep only items that belong to THIS list level —
    // i.e. whose nearest boundary ancestor is our own container. This excludes
    // items inside nested lists (e.g. inline submenu flyouts) that would
    // otherwise be swept in by querySelectorAll.
    if (!boundarySelector) {
      return matched;
    }
    return matched.filter(el => el.closest(boundarySelector) === listEl);
  }, [itemSelector, boundarySelector]);

  /**
   * Whether a key event belongs to this list level rather than a nested list.
   * With a boundary set, an event that originated inside a nested boundary
   * (e.g. a submenu flyout) has bubbled up to us and must be ignored so we
   * don't double-handle navigation. Without a boundary, every event is ours.
   */
  const ownsEvent = useCallback(
    (e: React.KeyboardEvent): boolean => {
      const listEl = listRef.current;
      if (!listEl || !boundarySelector) {
        return true;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return true;
      }
      return target.closest(boundarySelector) === listEl;
    },
    [boundarySelector],
  );

  /**
   * Find the next enabled item index from `start`, moving by `step`, optionally
   * wrapping. Returns -1 when no enabled item exists in range. Skipping
   * disabled items here (rather than relying on the selector) keeps navigation
   * from stalling on an item whose `.focus()` silently no-ops.
   */
  const findEnabledIndex = useCallback(
    (
      items: HTMLElement[],
      start: number,
      step: 1 | -1,
      shouldWrap: boolean,
    ): number => {
      const count = items.length;
      if (count === 0) {
        return -1;
      }
      let index = start;
      for (let i = 0; i < count; i++) {
        if (index < 0 || index >= count) {
          if (!shouldWrap) {
            return -1;
          }
          index = (index + count) % count;
        }
        const item = items[index];
        if (item && !isItemDisabled(item)) {
          return index;
        }
        index += step;
      }
      return -1;
    },
    [isItemDisabled],
  );

  /**
   * Get the currently focused item index.
   */
  const getCurrentIndex = useCallback((): number => {
    const items = getItems();
    const active = document.activeElement;
    return items.findIndex(item => item === active || item.contains(active));
  }, [getItems]);

  // --- Roving tabindex ownership (opt-in via `hasRovingTabIndex`) -------------

  /**
   * Set `tabindex` on an item, but only when it differs (avoids redundant DOM
   * writes). Uses setAttribute so the value reflects even for elements (like
   * `<button>`) whose default tabIndex is already 0.
   */
  const setTabIndex = useCallback((el: HTMLElement, value: 0 | -1) => {
    if (el.getAttribute('tabindex') !== String(value)) {
      el.setAttribute('tabindex', String(value));
    }
  }, []);

  /**
   * Stamp the roving tab stop: exactly one enabled item is tabbable (0), the
   * rest are -1. Prefer keeping the currently-tabbable item if it is still
   * enabled; otherwise promote the first enabled item (tab-stop repair).
   */
  const syncTabStops = useCallback(() => {
    const items = getItems();
    const enabled = items.filter(el => !isItemDisabled(el));
    if (enabled.length === 0) {
      const listEl = listRef.current;
      if (listEl == null || disabledTabStop == null) {
        return;
      }
      const [stop, ...others] = disabledTabStop(listEl);
      if (stop != null) {
        setTabIndex(stop, 0);
      }
      for (const el of others) {
        setTabIndex(el, -1);
      }
      return;
    }
    const current = enabled.find(el => el.getAttribute('tabindex') === '0');
    const tabbable = current ?? enabled[0];
    for (const el of items) {
      setTabIndex(el, el === tabbable ? 0 : -1);
    }
  }, [getItems, isItemDisabled, setTabIndex, disabledTabStop]);

  // Keep the tab stop valid across renders (items added/removed, disabled
  // toggled). Runs after every commit but only when roving tabindex is on.
  useIsomorphicLayoutEffect(() => {
    if (hasRovingTabIndex) {
      syncTabStops();
    }
  });

  /**
   * Move focus to `items[index]`. When roving tabindex is enabled, also move
   * the tab stop so `index` becomes the sole tabbable item.
   */
  const focusIndex = useCallback(
    (items: HTMLElement[], index: number) => {
      const target = items[index];
      if (!target) {
        return;
      }
      if (hasRovingTabIndex) {
        for (const el of items) {
          setTabIndex(el, el === target ? 0 : -1);
        }
      }
      if (focusFollowsLastInput) {
        focusForLastInput(target);
      } else {
        target.focus();
      }
    },
    [hasRovingTabIndex, setTabIndex, focusFollowsLastInput],
  );

  /**
   * Focus an item by index, clamping to valid range.
   */
  const focusItem = useCallback(
    (index: number) => {
      const items = getItems();
      if (items.length === 0) {
        return;
      }
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      focusIndex(items, clampedIndex);
    },
    [getItems, focusIndex],
  );

  /**
   * Focus the first enabled item. Returns true when an item was focused.
   */
  const focusFirst = useCallback((): boolean => {
    const items = getItems();
    const index = findEnabledIndex(items, 0, 1, false);
    if (index !== -1) {
      focusIndex(items, index);
      return true;
    }
    return false;
  }, [getItems, findEnabledIndex, focusIndex]);

  /**
   * Focus the last enabled item. Returns true when an item was focused.
   */
  const focusLast = useCallback((): boolean => {
    const items = getItems();
    const index = findEnabledIndex(items, items.length - 1, -1, false);
    if (index !== -1) {
      focusIndex(items, index);
      return true;
    }
    return false;
  }, [getItems, findEnabledIndex, focusIndex]);

  /**
   * PageDown / PageUp: move to the last / first enabled item fully
   * visible in the scrolling container. Pressed there again, scroll one
   * viewport further and land on the last / first item then visible. Never
   * wraps; at the end of the list it stays on the last enabled item.
   */
  const focusPage = useCallback(
    (direction: 1 | -1) => {
      const container = listRef.current;
      const items = getItems();
      if (!container || items.length === 0) {
        return;
      }
      const currentIndex = getCurrentIndex();
      const enabledIndices = items
        .map((item, index) => (isItemDisabled(item) ? -1 : index))
        .filter(index => index !== -1);
      if (enabledIndices.length === 0) {
        return;
      }
      const edgeVisible = (): number => {
        const bounds = container.getBoundingClientRect();
        const visible = enabledIndices.filter(index => {
          const rect = items[index].getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        });
        if (visible.length === 0) {
          return -1;
        }
        return direction === 1 ? visible[visible.length - 1] : visible[0];
      };
      const isAhead = (index: number): boolean =>
        currentIndex === -1 ||
        (direction === 1 ? index > currentIndex : index < currentIndex);
      if (currentIndex === -1 && direction === -1) {
        focusFirst();
        return;
      }
      let target = edgeVisible();
      if (target === -1 || !isAhead(target)) {
        // Already at the visible edge: one viewport further.
        const before = container.scrollTop;
        container.scrollTop = before + direction * container.clientHeight;
        target = edgeVisible();
        if (target === -1 || !isAhead(target)) {
          // No usable geometry (or nothing moved): step by the number of rows
          // a viewport shows, never wrapping.
          const pageSize = Math.max(
            1,
            enabledIndices.filter(index => {
              const bounds = container.getBoundingClientRect();
              const rect = items[index].getBoundingClientRect();
              return (
                rect.height > 0 &&
                rect.top >= bounds.top - 1 &&
                rect.bottom <= bounds.bottom + 1
              );
            }).length,
          );
          const position = enabledIndices.indexOf(currentIndex);
          const from =
            position === -1
              ? direction === 1
                ? -1
                : enabledIndices.length
              : position;
          const next = Math.max(
            0,
            Math.min(enabledIndices.length - 1, from + direction * pageSize),
          );
          target = enabledIndices[next];
        }
      }
      if (target !== -1 && target !== currentIndex) {
        focusIndex(items, target);
      }
    },
    [getItems, getCurrentIndex, isItemDisabled, focusIndex, focusFirst],
  );

  /**
   * Keep the roving stop pointing at whatever ended up focused (e.g. a click
   * or programmatic focus) so the next Tab behaves correctly. No-op unless
   * roving tabindex is enabled.
   */
  const handleFocus = useCallback(() => {
    if (hasRovingTabIndex) {
      syncTabStops();
    }
  }, [hasRovingTabIndex, syncTabStops]);

  /**
   * Handle keyboard navigation.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Let browser/OS shortcut chords (Ctrl/Cmd/Alt + key) through untouched.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Ignore events that bubbled up from a nested list (e.g. a submenu
      // flyout, which renders inline inside this container). That level owns
      // and already handled them; re-handling here would move focus twice.
      if (!ownsEvent(e)) {
        return;
      }

      // Escape is handled regardless of orientation, but only *consumed* when
      // a handler asked for it: a list with no dismissal to perform must leave
      // the key to whatever host layer does have one, and those defer to
      // `defaultPrevented` (see `useFocusTrap`) or to the native popover.
      if (e.key === 'Escape') {
        if (onEscape) {
          e.preventDefault();
          onEscape();
        }
        return;
      }

      const horizontal = orientation === 'horizontal' || orientation === 'both';
      const vertical = orientation === 'vertical' || orientation === 'both';

      // Resolve which keys advance vs retreat, honoring RTL for horizontal.
      // Direction is resolved lazily — getComputedStyle runs only when a
      // horizontal arrow key is actually pressed (SSR-safe, no layout thrash
      // on unrelated keys).
      const nextKeys: string[] = [];
      const prevKeys: string[] = [];
      if (horizontal) {
        const rtl =
          e.key === 'ArrowLeft' || e.key === 'ArrowRight'
            ? isRtlElement(listRef.current)
            : false;
        nextKeys.push(rtl ? 'ArrowLeft' : 'ArrowRight');
        prevKeys.push(rtl ? 'ArrowRight' : 'ArrowLeft');
      }
      if (vertical) {
        nextKeys.push('ArrowDown');
        prevKeys.push('ArrowUp');
      }

      const isNext = nextKeys.includes(e.key);
      const isPrev = prevKeys.includes(e.key);
      const isHome = hasHomeEnd && e.key === 'Home';
      const isEnd = hasHomeEnd && e.key === 'End';
      const isPageDown = hasPaging && e.key === 'PageDown';
      const isPageUp = hasPaging && e.key === 'PageUp';

      if (!isNext && !isPrev && !isHome && !isEnd && !isPageDown && !isPageUp) {
        return;
      }

      // Never hijack a caret key from a nested text input mid-line. Check both
      // the React event target and the actual focused element (events may
      // bubble up to the container).
      if (
        hasCaretGuard &&
        (shouldDeferToCaret(e.target, e.key) ||
          shouldDeferToCaret(document.activeElement, e.key))
      ) {
        return;
      }

      const currentIndex = getCurrentIndex();
      const items = getItems();

      if (isNext) {
        const from = currentIndex === -1 ? 0 : currentIndex + 1;
        const next = findEnabledIndex(items, from, 1, wrap);
        if (next !== -1) {
          focusIndex(items, next);
        }
      } else if (isPrev) {
        const from = currentIndex === -1 ? items.length - 1 : currentIndex - 1;
        const prev = findEnabledIndex(items, from, -1, wrap);
        if (prev !== -1) {
          focusIndex(items, prev);
        }
      } else if (isHome) {
        focusFirst();
      } else if (isEnd) {
        focusLast();
      } else if (isPageDown) {
        focusPage(1);
      } else if (isPageUp) {
        focusPage(-1);
      }

      e.preventDefault();
    },
    [
      getCurrentIndex,
      getItems,
      wrap,
      orientation,
      hasHomeEnd,
      hasPaging,
      hasCaretGuard,
      findEnabledIndex,
      focusIndex,
      focusFirst,
      focusLast,
      focusPage,
      onEscape,
      ownsEvent,
    ],
  );

  return {
    listRef,
    handleKeyDown,
    handleFocus,
    focusItem,
    focusFirst,
    focusLast,
    ownsEvent,
    getItems,
  };
}
