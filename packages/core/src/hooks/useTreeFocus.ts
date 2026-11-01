// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTreeFocus.ts
 * @input Uses React useCallback, useRef, useIsomorphicLayoutEffect, isRtlElement
 * @output Exports useTreeFocus hook for WAI-ARIA tree keyboard navigation
 * @position Core hook; used by TreeList for roving tabindex + APG tree keyboard model
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useTreeFocus.doc.mjs
 * - /packages/core/src/hooks/useTreeFocus.test.tsx
 */

import {useCallback, useRef} from 'react';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {isRtlElement} from './isRtlElement';
import {findTypeaheadMatch, nextTypeaheadBuffer} from '../utils/typeaheadMatch';

/** Keys handled by the tree keyboard model (used to gate typeahead). */
const NAVIGATION_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'Home',
  'End',
  'Enter',
  ' ',
]);

/** Default reset delay for the typeahead buffer. */
const DEFAULT_TYPEAHEAD_RESET_MS = 500;

/**
 * Configuration for tree focus behavior.
 *
 * The tree keyboard model differs from a linear list (useListFocus): while
 * ArrowUp/ArrowDown/Home/End roam linearly over the *visible* treeitems,
 * ArrowRight/ArrowLeft carry tree semantics (expand/collapse, move to
 * first-child / parent). The hook stays generic by taking callbacks for the
 * tree-specific bits (expansion toggling, activation) — mirroring how
 * useGridFocus takes `isCellFocusable` rather than hardcoding disabled logic.
 */
export interface UseTreeFocusOptions {
  /**
   * Selector for treeitems within the tree. Matches ALL visible treeitems in
   * DOM order (collapsed subtrees are not rendered, so they are naturally
   * excluded). Disabled treeitems are still matched and then skipped via
   * {@link UseTreeFocusOptions.isItemDisabled}.
   * @default '[role="treeitem"]'
   */
  itemSelector?: string;

  /**
   * Predicate determining whether a treeitem matched by `itemSelector` is
   * disabled and must be skipped during arrow/Home/End navigation. A `.focus()`
   * on a disabled item silently no-ops, so navigation would otherwise stall.
   *
   * @default reads `data-tree-disabled` (present ⇒ disabled)
   */
  isItemDisabled?: (item: HTMLElement) => boolean;

  /**
   * Reads the nesting level (aria-level style, 1-based) of a treeitem. Used to
   * resolve first-child (ArrowRight) and parent (ArrowLeft) targets from the
   * flat visible-item list.
   *
   * @default reads the `aria-level` attribute (falling back to `1`)
   */
  getLevel?: (item: HTMLElement) => number;

  /**
   * Whether a treeitem is an expanded parent. Read DOM-side (aria-expanded)
   * by default so it reflects the rendered tree without prop plumbing.
   *
   * @default `aria-expanded === 'true'`
   */
  isExpanded?: (item: HTMLElement) => boolean;

  /**
   * Whether a treeitem is a collapsed parent (has children but is closed).
   *
   * @default `aria-expanded === 'false'`
   */
  isCollapsed?: (item: HTMLElement) => boolean;

  /**
   * Resolve the stable id for a treeitem, passed to `onToggleExpand` /
   * `onActivate`. Returns `undefined` when the element carries no id.
   *
   * @default reads the `data-tree-id` attribute
   */
  getItemId?: (item: HTMLElement) => string | undefined;

  /**
   * Called to expand/collapse the treeitem with the given id (ArrowRight on a
   * collapsed parent, ArrowLeft on an expanded parent, and Enter/Space on a
   * parent that has no inner action).
   */
  onToggleExpand?: (id: string) => void;

  /**
   * Called when Enter/Space activates a treeitem. Return `true` if the
   * activation was handled (e.g. an inner link/button was clicked); return
   * `false`/`undefined` to let the hook fall back to toggling expansion for a
   * parent. When omitted, the hook falls straight through to expansion
   * toggling for parents.
   *
   * @param item The focused treeitem element.
   * @param id The treeitem's id (per `getItemId`), if any.
   */
  onActivate?: (
    item: HTMLElement,
    id: string | undefined,
  ) => boolean | undefined;

  /**
   * Whether typeahead (jump to next item whose text starts with the typed
   * characters) is enabled.
   * @default true
   */
  typeahead?: boolean;

  /** Reset delay for the typeahead buffer, in ms. @default 500 */
  typeaheadResetMs?: number;

  /**
   * Notified whenever the hook moves focus to a treeitem, with its id (if any).
   * TreeList uses this to move its single roving tab stop.
   */
  onActiveChange?: (id: string | undefined) => void;

  /**
   * Roving-tabindex ownership. When true, the hook manages a single tab stop
   * across the visible treeitems: exactly one enabled treeitem carries
   * `tabindex="0"` and the rest `tabindex="-1"`. The tab stop is repaired on
   * mount and whenever items mount/unmount or toggle disabled, and moves with
   * keyboard navigation. Attach the returned {@link UseTreeFocusReturn.handleFocus}
   * to the container's `onFocus` to keep the stop in sync after clicks or
   * programmatic focus.
   *
   * On mount the hook preserves an existing `tabindex="0"` treeitem (so a
   * consumer can seed the active item in its render); if none exists it
   * promotes the first enabled treeitem.
   *
   * When false (the default), the hook only *moves* focus (`.focus()`) and
   * never touches `tabindex` — the caller owns tab-stop management.
   * @default false
   */
  hasRovingTabIndex?: boolean;
}

/**
 * Return type for useTreeFocus hook.
 */
export interface UseTreeFocusReturn<T extends HTMLElement = HTMLElement> {
  /** Ref to attach to the tree container element (role="tree"). */
  treeRef: React.RefObject<T | null>;

  /** Key down handler to attach to the tree container. */
  handleKeyDown: (e: React.KeyboardEvent) => void;

  /**
   * Focus handler to attach to the container's `onFocus`. Keeps the roving tab
   * stop in sync when `hasRovingTabIndex` is enabled; a no-op otherwise, so it
   * is always safe to attach.
   */
  handleFocus: (e: React.FocusEvent) => void;

  /** Focus the first enabled visible treeitem. */
  focusFirst: () => void;

  /** Focus the last enabled visible treeitem. */
  focusLast: () => void;
}

/**
 * The text typeahead matches against. With `matchLabelledBy`, the row's
 * `aria-labelledby` text (the label alone) when it has one; otherwise, and by
 * default, its text content.
 */
function itemLabelText(item: HTMLElement, matchLabelledBy: boolean): string {
  const labelledBy = matchLabelledBy
    ? item.getAttribute('aria-labelledby')
    : null;
  if (labelledBy != null) {
    const label = labelledBy
      .split(/\s+/)
      .map(id => item.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (label !== '') {
      return label;
    }
  }
  return (item.textContent ?? '').trim();
}

/**
 * Hook for managing roving-tabindex focus + the WAI-ARIA tree keyboard model.
 *
 * A tree is not a linear list: ArrowUp/ArrowDown/Home/End roam linearly over
 * the *visible* treeitems (skipping disabled ones), but ArrowRight/ArrowLeft
 * carry tree semantics. This is why a tree needs its own hook rather than
 * reusing `useListFocus` — the same reason 2D grids get `useGridFocus`.
 *
 * - ArrowDown / ArrowUp: move to next/previous visible treeitem (skip disabled)
 * - ArrowRight: collapsed parent → expand; expanded parent → first child;
 *   leaf → no-op
 * - ArrowLeft: expanded parent → collapse; otherwise → move to parent treeitem
 * - Home / End: first / last visible treeitem
 * - Enter / Space: activate (`onActivate`), falling back to expansion toggle
 * - Printable characters: typeahead to the next matching treeitem
 *
 * The hook is DOM-query based (reads aria-expanded/aria-level and data-*
 * attributes) and stays generic via option callbacks for the tree-specific
 * bits (`onToggleExpand`, `onActivate`, `getLevel`, `isItemDisabled`, …).
 *
 * @example
 * ```
 * const {treeRef, handleKeyDown, handleFocus} = useTreeFocus<HTMLUListElement>({
 *   onToggleExpand: id => toggle(id),
 *   hasRovingTabIndex: true,
 * });
 *
 * <ul ref={treeRef} role="tree" onKeyDown={handleKeyDown} onFocus={handleFocus}>
 *   {items.map(item => <li role="treeitem" tabIndex={-1}>{item.label}</li>)}
 * </ul>
 * ```
 */

export function useTreeFocus<T extends HTMLElement = HTMLElement>(
  options: UseTreeFocusOptions = {},
): UseTreeFocusReturn<T> {
  // The flag is pinned off here so an untyped options object cannot smuggle
  // it through the public hook.
  return useTreeFocusInternal<T>({...options, matchLabelledBy: false});
}

/**
 * Options the package's own components can pass beyond the public hook.
 *
 * Not exported from the package: TreeList imports this module directly, so
 * `UseTreeFocusOptions` stays exactly as released.
 */
export type UseTreeFocusInternalOptions = UseTreeFocusOptions & {
  /**
   * Match typeahead against the item's `aria-labelledby` text (its label
   * alone) instead of its whole text content, so start content, a chevron
   * toggle or a description never takes part. TreeList passes this; the
   * released text match stays the default for direct callers.
   * @default false
   */
  matchLabelledBy?: boolean;
};

/**
 * The implementation behind {@link useTreeFocus}. Not exported from the
 * package; the public hook calls it without the internal options.
 */
export function useTreeFocusInternal<T extends HTMLElement = HTMLElement>(
  options: UseTreeFocusInternalOptions = {},
): UseTreeFocusReturn<T> {
  const {
    itemSelector = '[role="treeitem"]',
    isItemDisabled,
    getLevel,
    isExpanded,
    isCollapsed,
    getItemId,
    onToggleExpand,
    onActivate,
    typeahead = true,
    typeaheadResetMs = DEFAULT_TYPEAHEAD_RESET_MS,
    matchLabelledBy = false,
    onActiveChange,
    hasRovingTabIndex = false,
  } = options;

  const treeRef = useRef<T>(null);

  const typeaheadRef = useRef<{buffer: string; timer: number | null}>({
    buffer: '',
    timer: null,
  });

  /** Visible treeitems in DOM order (collapsed subtrees are not rendered). */
  const getItems = useCallback((): HTMLElement[] => {
    const root = treeRef.current;
    if (root == null) {
      return [];
    }
    return Array.from(root.querySelectorAll<HTMLElement>(itemSelector));
  }, [itemSelector]);

  const itemDisabled = useCallback(
    (el: HTMLElement): boolean =>
      isItemDisabled
        ? isItemDisabled(el)
        : el.dataset.treeDisabled != null ||
          el.getAttribute('aria-disabled') === 'true',
    [isItemDisabled],
  );

  const levelOf = useCallback(
    (el: HTMLElement): number =>
      getLevel ? getLevel(el) : Number(el.getAttribute('aria-level') ?? '1'),
    [getLevel],
  );

  const expandedOf = useCallback(
    (el: HTMLElement): boolean =>
      isExpanded ? isExpanded(el) : el.getAttribute('aria-expanded') === 'true',
    [isExpanded],
  );

  const collapsedOf = useCallback(
    (el: HTMLElement): boolean =>
      isCollapsed
        ? isCollapsed(el)
        : el.getAttribute('aria-expanded') === 'false',
    [isCollapsed],
  );

  const idOf = useCallback(
    (el: HTMLElement): string | undefined =>
      getItemId ? getItemId(el) : el.dataset.treeId,
    [getItemId],
  );

  // --- Roving tabindex ownership (opt-in via `hasRovingTabIndex`) -------------

  /**
   * Set `tabindex` on a treeitem, but only when it differs (avoids redundant
   * DOM writes).
   */
  const setTabIndex = useCallback((el: HTMLElement, value: 0 | -1) => {
    if (el.getAttribute('tabindex') !== String(value)) {
      el.setAttribute('tabindex', String(value));
    }
  }, []);

  /**
   * Make `target` the sole tabbable treeitem: 0 on it, -1 on every other
   * visible treeitem.
   */
  const moveTabStop = useCallback(
    (items: HTMLElement[], target: HTMLElement) => {
      for (const el of items) {
        setTabIndex(el, el === target ? 0 : -1);
      }
    },
    [setTabIndex],
  );

  /**
   * Repair the roving tab stop: exactly one enabled treeitem is tabbable (0),
   * the rest are -1. Prefer an existing `tabindex="0"` treeitem (so a consumer
   * can seed the active item in its render); otherwise promote the first
   * enabled treeitem.
   */
  const syncTabStops = useCallback(() => {
    const items = getItems();
    const enabled = items.filter(el => !itemDisabled(el));
    if (enabled.length === 0) {
      return;
    }
    const current = enabled.find(el => el.getAttribute('tabindex') === '0');
    moveTabStop(items, current ?? enabled[0]);
  }, [getItems, itemDisabled, moveTabStop]);

  // Keep the tab stop valid across renders (items added/removed, disabled
  // toggled). Runs after every commit but only when roving tabindex is on.
  useIsomorphicLayoutEffect(() => {
    if (hasRovingTabIndex) {
      syncTabStops();
    }
  });

  /** Move focus to a treeitem and notify the active-change listener. */
  const focusItem = useCallback(
    (el: HTMLElement | undefined) => {
      if (el == null) {
        return;
      }
      if (hasRovingTabIndex) {
        moveTabStop(getItems(), el);
      }
      onActiveChange?.(idOf(el));
      el.focus();
    },
    [idOf, onActiveChange, hasRovingTabIndex, moveTabStop, getItems],
  );

  /**
   * Focus the first enabled treeitem from `start`, moving by `dir`. No wrap —
   * a tree's linear roam clamps at the ends.
   */
  const focusEnabledFrom = useCallback(
    (items: HTMLElement[], start: number, dir: 1 | -1) => {
      for (let i = start; i >= 0 && i < items.length; i += dir) {
        const candidate = items[i];
        if (candidate != null && !itemDisabled(candidate)) {
          focusItem(candidate);
          return;
        }
      }
    },
    [itemDisabled, focusItem],
  );

  const focusFirst = useCallback(() => {
    focusEnabledFrom(getItems(), 0, 1);
  }, [getItems, focusEnabledFrom]);

  const focusLast = useCallback(() => {
    const items = getItems();
    focusEnabledFrom(items, items.length - 1, -1);
  }, [getItems, focusEnabledFrom]);

  const runTypeahead = useCallback(
    (
      e: React.KeyboardEvent,
      items: HTMLElement[],
      currentIndex: number,
    ): void => {
      const state = typeaheadRef.current;
      // The same buffer step as useTypeahead: a repeat means "next match", and
      // a lone combining mark typed first is not a letter to jump to.
      const nextBuffer = nextTypeaheadBuffer(state.buffer, e.key);
      if (nextBuffer == null) {
        return;
      }
      if (state.timer != null) {
        clearTimeout(state.timer);
      }
      state.buffer = nextBuffer;
      state.timer = setTimeout(() => {
        typeaheadRef.current.buffer = '';
      }, typeaheadResetMs) as unknown as number;

      const query = state.buffer;
      // A longer query is refining, so the current item may still be the match.
      const hasCurrent = currentIndex >= 0;
      const start = hasCurrent ? currentIndex : 0;
      const offset = hasCurrent && query.length === 1 ? 1 : 0;
      const ordered = [
        ...items.slice(start + offset),
        ...items.slice(0, start + offset),
      ];
      const enabled = ordered.filter(item => !itemDisabled(item));
      // INV17: case, accents, stroked letters and Turkish i fold away, and a
      // typed mark prefers the exact match.
      const matchIndex = findTypeaheadMatch(
        enabled.map((_, i) => i),
        i => itemLabelText(enabled[i], matchLabelledBy),
        query,
      );
      const match = matchIndex >= 0 ? enabled[matchIndex] : undefined;
      if (match != null) {
        e.preventDefault();
        focusItem(match);
      }
    },
    [typeaheadResetMs, itemDisabled, focusItem, matchLabelledBy],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) {
        return;
      }

      const active = document.activeElement;
      // Resolve the treeitem that owns focus: the nearest treeitem ancestor of
      // the active element (never an outer treeitem that merely contains it).
      const activeItem =
        active instanceof Element ? active.closest('[role="treeitem"]') : null;
      const currentIndex = items.findIndex(item => item === activeItem);
      const current = currentIndex >= 0 ? items[currentIndex] : undefined;

      // Typeahead: printable single characters jump to the next matching item.
      if (
        typeahead &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        NAVIGATION_KEYS.has(e.key) === false
      ) {
        runTypeahead(e, items, currentIndex);
        return;
      }

      if (!NAVIGATION_KEYS.has(e.key)) {
        return;
      }

      // Under RTL, swap the horizontal arrows to a logical key so the
      // expand/collapse case bodies (written LTR-first) stay unchanged.
      let key = e.key;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const rtl = isRtlElement(treeRef.current);
        if (rtl) {
          key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
        }
      }

      switch (key) {
        case 'ArrowDown': {
          e.preventDefault();
          focusEnabledFrom(items, currentIndex < 0 ? 0 : currentIndex + 1, 1);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          focusEnabledFrom(
            items,
            currentIndex < 0 ? items.length - 1 : currentIndex - 1,
            -1,
          );
          break;
        }
        case 'ArrowRight': {
          if (current == null) {
            break;
          }
          e.preventDefault();
          if (collapsedOf(current)) {
            // Collapsed parent → expand.
            const id = idOf(current);
            if (id != null) {
              onToggleExpand?.(id);
            }
          } else if (expandedOf(current)) {
            // Expanded parent → move to first child.
            const next = items[currentIndex + 1];
            if (next != null && levelOf(next) > levelOf(current)) {
              focusItem(next);
            }
          }
          // Leaf → no-op.
          break;
        }
        case 'ArrowLeft': {
          if (current == null) {
            break;
          }
          e.preventDefault();
          if (expandedOf(current)) {
            // Expanded parent → collapse.
            const id = idOf(current);
            if (id != null) {
              onToggleExpand?.(id);
            }
          } else {
            // Otherwise → move to parent treeitem (nearest shallower item
            // scanning upward in visible order).
            const currentLevel = levelOf(current);
            for (let i = currentIndex - 1; i >= 0; i--) {
              const candidate = items[i];
              if (candidate != null && levelOf(candidate) < currentLevel) {
                focusItem(candidate);
                break;
              }
            }
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          focusEnabledFrom(items, 0, 1);
          break;
        }
        case 'End': {
          e.preventDefault();
          focusEnabledFrom(items, items.length - 1, -1);
          break;
        }
        case 'Enter':
        case ' ': {
          if (current == null || itemDisabled(current)) {
            break;
          }
          e.preventDefault();
          const id = idOf(current);
          // Activate the item: prefer the consumer's onActivate (e.g. click an
          // inner link/button). Fall back to toggling expansion for a parent
          // without its own action.
          const handled = onActivate ? onActivate(current, id) === true : false;
          if (!handled && current.getAttribute('aria-expanded') != null) {
            if (id != null) {
              onToggleExpand?.(id);
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [
      getItems,
      typeahead,
      runTypeahead,
      focusEnabledFrom,
      focusItem,
      collapsedOf,
      expandedOf,
      idOf,
      levelOf,
      itemDisabled,
      onToggleExpand,
      onActivate,
    ],
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

  return {
    treeRef,
    handleKeyDown,
    handleFocus,
    focusFirst,
    focusLast,
  };
}
