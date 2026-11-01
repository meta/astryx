// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTriggerMenu.tsx
 * @input Uses React, usePopover, SearchSource
 * @output Exports useTriggerMenu hook for trigger-based menus in contentEditable
 * @position Internal hook; consumed by ChatComposerInput
 *
 * Detects trigger characters (@ / etc.) typed inside a contentEditable,
 * opens a popover at the cursor position with filtered items, handles
 * keyboard navigation, and inserts tokens or text on selection. Triggers
 * opt into multi-word queries with hasMultiWordQuery; results apply only
 * while their query is current (component:ChatComposerInput FR10–FR16).
 *
 * Reuses SearchSource from Typeahead for async/sync search with
 * cancel() support and debounce.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/ChatComposerInput.tsx
 * - /packages/core/src/Chat/index.ts
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useId,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {usePopover} from '../Popover/usePopover';
import {useAnnounce} from '../hooks/useAnnounce';
import {useHighlightedOptionScroll} from '../hooks/useHighlightedOptionScroll';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {mergeProps, groupItems, isImeKeyEvent} from '../utils';
import type {SearchableItem} from '../Typeahead/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import type {ChatComposerTrigger, ChatComposerToken} from './ChatComposerInput';

// =============================================================================
// Types
// =============================================================================

export interface TriggerMenuState {
  isActive: boolean;
  activeTrigger: ChatComposerTrigger | null;
  query: string;
  items: SearchableItem[];
  highlightedIndex: number;
  isLoading: boolean;
  /**
   * The last settled results were an unmatched multi-word query, so the menu
   * is closed. It stays closed while a newer search for the same query runs.
   */
  isHidden: boolean;
}

export interface UseTriggerMenuOptions {
  triggers?: ChatComposerTrigger[];
  editableRef: React.RefObject<HTMLDivElement | null>;
  onInsertToken: (token: ChatComposerToken) => void;
  onInsertText: (text: string) => void;
  onEmitChange: () => void;
  /**
   * Debounce delay in ms before triggering search after typing.
   * @default 150
   */
  debounceMs?: number;
}

export interface UseTriggerMenuReturn {
  state: TriggerMenuState;
  /** Call on every input event to check for trigger activation */
  handleInput: () => void;
  /** Call on keydown — returns true if the event was consumed */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Render the trigger menu popover */
  renderMenu: () => ReactNode;
  /** Reset/close the trigger menu */
  reset: () => void;
  /**
   * ARIA props to spread onto the editable element: the role, and every
   * attribute whose validity depends on it. Emit them as one spread — the
   * role and its allowed attributes have to be decided together. See the
   * construction site for which attribute forces which role.
   */
  ariaProps: {
    role: 'combobox' | 'textbox';
    'aria-multiline'?: 'true';
    'aria-expanded'?: boolean;
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
    'aria-haspopup'?: 'listbox';
  };
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  dropdown: {
    boxSizing: 'border-box',
    maxHeight: '240px',
    overflowY: 'auto',
    padding: spacingVars['--spacing-1'],
    minWidth: '180px',
  },
  popoverSurface: {
    minWidth: '180px',
  },
  item: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    textAlign: 'start' as const,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
  },
  itemHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    padding: spacingVars['--spacing-3'],
    textAlign: 'center' as const,
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
  loadingState: {
    padding: spacingVars['--spacing-3'],
    textAlign: 'center' as const,
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
  groupHeading: {
    paddingInline: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
  },
});

// =============================================================================
// Helpers
// =============================================================================

/** The text node holding a collapsed caret inside `editable`, if any. */
function getCaretTextNode(editable: HTMLDivElement): Node | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const node = selection.getRangeAt(0).startContainer;
  return node.nodeType === Node.TEXT_NODE && editable.contains(node)
    ? node
    : null;
}

function getTextBeforeCursor(editable: HTMLDivElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    return null;
  }
  if (!editable.contains(range.startContainer)) {
    return null;
  }

  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').slice(0, range.startOffset);
  }

  return null;
}

const MAX_MULTI_WORD_QUERY_LENGTH = 64;

/**
 * An unmatched multi-word query hides the menu instead of covering prose with
 * an empty panel, unless the trigger supplies its own empty message.
 */
function isUnmatchedMultiWordQuery(
  trigger: ChatComposerTrigger | null,
  items: SearchableItem[],
  isLoading: boolean,
): boolean {
  return (
    trigger?.hasMultiWordQuery === true &&
    // `null` means "not given", exactly as `undefined` does.
    trigger.emptySearchText == null &&
    items.length === 0 &&
    !isLoading
  );
}

function isTriggerBoundary(char: string | null): boolean {
  return char === null || char === ' ' || char === '\t' || char === '\n';
}

/**
 * Finds the trigger query the caret is in (component:ChatComposerInput FR10,
 * FR11). A trigger character activates at the start of the text or after a
 * space, tab, or line break. A single-token query ends at whitespace. A
 * multi-word query ends at a line break, past the length bound, or where the
 * same trigger's character starts a new query; another trigger's character
 * inside it is ordinary text.
 */
function findActiveTrigger(
  textBeforeCursor: string,
  triggers: ChatComposerTrigger[],
): {
  trigger: ChatComposerTrigger;
  query: string;
  triggerStart: number;
} | null {
  let active: {trigger: ChatComposerTrigger; triggerStart: number} | null =
    null;

  for (let i = 0; i < textBeforeCursor.length; i++) {
    const char = textBeforeCursor[i];

    if (char === '\n') {
      active = null;
      continue;
    }
    if (active && !active.trigger.hasMultiWordQuery) {
      if (char === ' ' || char === '\t') {
        active = null;
      }
      continue;
    }
    if (active && i - active.triggerStart > MAX_MULTI_WORD_QUERY_LENGTH) {
      active = null;
    }

    if (!isTriggerBoundary(i > 0 ? textBeforeCursor[i - 1] : null)) {
      continue;
    }
    const trigger = triggers.find(t => t.character === char);
    if (!trigger) {
      continue;
    }
    if (active && trigger.character !== active.trigger.character) {
      continue;
    }
    active = {trigger, triggerStart: i};
  }

  if (!active) {
    return null;
  }
  const query = textBeforeCursor.slice(active.triggerStart + 1);
  if (
    active.trigger.hasMultiWordQuery &&
    query.length > MAX_MULTI_WORD_QUERY_LENGTH
  ) {
    return null;
  }
  return {trigger: active.trigger, query, triggerStart: active.triggerStart};
}

function deleteTriggerText(
  editable: HTMLDivElement,
  triggerStart: number,
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return;
  }

  const text = node.textContent ?? '';
  const cursorOffset = range.startOffset;

  const before = text.slice(0, triggerStart);
  const after = text.slice(cursorOffset);
  node.textContent = before + after;

  const newRange = document.createRange();
  newRange.setStart(node, triggerStart);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
}

// =============================================================================
// Hook
// =============================================================================

export function useTriggerMenu(
  options: UseTriggerMenuOptions,
): UseTriggerMenuReturn {
  const t = useTranslator();
  const {
    triggers,
    editableRef,
    onInsertToken,
    onInsertText,
    onEmitChange,
    debounceMs = 150,
  } = options;

  const listboxId = useId();
  const [state, setState] = useState<TriggerMenuState>({
    isActive: false,
    activeTrigger: null,
    query: '',
    items: [],
    highlightedIndex: 0,
    isLoading: false,
    isHidden: false,
  });

  // The loading row carries no live role: it mounts already holding its text
  // and is removed when results arrive, so it would be skipped. The shared
  // channel announces each loading episode once instead (spec:AST-086 FR2,
  // FR6), once the row has been painted: the second animation frame runs
  // after the first paint, and a search that settles before then never shows
  // the row, so it announces nothing (FR7). The flag clears when the loading
  // row goes away, so the next search is a new occasion.
  const announce = useAnnounce();
  const hasAnnouncedLoadingRef = useRef(false);
  // Mirrors renderMenu: no row exists without an active trigger or while hidden.
  const isLoadingRowShown =
    state.isLoading && !state.isHidden && state.activeTrigger !== null;
  // One catalog string serves the row and the announcement (FR7).
  const loadingText =
    state.activeTrigger?.loadingText ?? t('@astryx.chatTriggerMenu.searching');
  useEffect(() => {
    if (!isLoadingRowShown) {
      hasAnnouncedLoadingRef.current = false;
      return;
    }
    if (hasAnnouncedLoadingRef.current) {
      return;
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        hasAnnouncedLoadingRef.current = true;
        announce(loadingText, 'polite');
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [announce, isLoadingRowShown, loadingText]);

  const triggerStartRef = useRef<number>(-1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef<number>(0);
  const dismissedRef = useRef<{
    character: string;
    triggerStart: number;
    dismissedQuery: string;
    // The text the Escape dismissed. Replacing the draft from outside typing
    // (a send button, a cleared value) replaces this node, which ends the
    // dismissal without any extra bookkeeping.
    textNode: Node | null;
  } | null>(null);
  const anchorSpanRef = useRef<HTMLSpanElement | null>(null);
  // True while the popover is closed only because the query is unmatched; the
  // trigger query itself is still active.
  const isMenuSuppressedRef = useRef(false);

  const removeAnchorSpan = useCallback(() => {
    if (anchorSpanRef.current) {
      anchorSpanRef.current.remove();
      anchorSpanRef.current = null;
    }
  }, []);

  const popover = usePopover({
    onHide: useCallback(() => {
      if (isMenuSuppressedRef.current) {
        return;
      }
      // A search still waiting out its debounce must not start for a menu
      // that is gone.
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      searchRequestIdRef.current++;
      removeAnchorSpan();
      setState(prev => ({
        ...prev,
        isActive: false,
        activeTrigger: null,
        query: '',
        items: [],
        highlightedIndex: 0,
        isLoading: false,
        isHidden: false,
      }));
    }, [removeAnchorSpan]),
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own role="listbox" is the exposed semantics; focus stays in
    // the contenteditable composer, so a modal dialog wrapper is incorrect.
    role: 'none',
  });
  const {show: showPopover, hide: hidePopover} = popover;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      removeAnchorSpan();
    };
  }, [removeAnchorSpan]);

  const reset = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    searchRequestIdRef.current++;
    // Cancel any in-flight search on the active trigger's searchSource
    const trigger = state.activeTrigger;
    if (trigger?.searchSource) {
      trigger.searchSource.cancel?.();
    }
    removeAnchorSpan();
    isMenuSuppressedRef.current = false;
    // Ending the query also forgets an Escape on it; a send or clear must not
    // leave the next message's mention at the same offset suppressed.
    dismissedRef.current = null;
    popover.hide();
    triggerStartRef.current = -1;
    setState(prev => ({
      ...prev,
      isActive: false,
      activeTrigger: null,
      query: '',
      items: [],
      highlightedIndex: 0,
      isLoading: false,
      isHidden: false,
    }));
  }, [popover, state.activeTrigger, removeAnchorSpan]);

  // Anchor the popover to the cursor position (not the entire input).
  // We append a zero-size span to document.body positioned at the cursor
  // rect — outside the contentEditable to avoid splitting text nodes.
  const setAnchor = useCallback(() => {
    const editable = editableRef.current;
    if (!editable) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      popover.triggerRef(editable);
      return;
    }

    removeAnchorSpan();

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);

    // getBoundingClientRect is unavailable in some environments (e.g. jsdom)
    const rect =
      typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : null;

    // Fall back to the editable when layout info is unavailable
    if (
      !rect ||
      (rect.width === 0 &&
        rect.height === 0 &&
        rect.top === 0 &&
        rect.left === 0)
    ) {
      popover.triggerRef(editable);
      return;
    }

    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('data-astryx-trigger-anchor', '');
    span.style.position = 'fixed';
    span.style.left = `${rect.left}px`;
    span.style.top = `${rect.top}px`;
    span.style.width = `${Math.max(rect.width, 1)}px`;
    span.style.height = `${rect.height}px`;
    span.style.pointerEvents = 'none';
    span.style.opacity = '0';
    document.body.appendChild(span);

    anchorSpanRef.current = span;
    popover.triggerRef(span);
  }, [editableRef, popover, removeAnchorSpan]);

  const searchItems = useCallback(
    (trigger: ChatComposerTrigger, query: string) => {
      // Clear any pending debounce
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      const requestId = ++searchRequestIdRef.current;
      // A result applies only while its request is the latest one and the
      // caret is still inside the same trigger query. Submitting or clearing
      // the editor ends the query without an input event, so check the DOM.
      const isCurrent = () => {
        if (requestId !== searchRequestIdRef.current) {
          return false;
        }
        const editable = editableRef.current;
        const textBefore = editable ? getTextBeforeCursor(editable) : null;
        const found =
          textBefore === null || !triggers
            ? null
            : findActiveTrigger(textBefore, triggers);
        if (
          found?.trigger.character !== trigger.character ||
          found.triggerStart !== triggerStartRef.current
        ) {
          reset();
          return false;
        }
        return true;
      };

      const applyResults = (items: SearchableItem[]) => {
        const isHidden = isUnmatchedMultiWordQuery(trigger, items, false);
        setState(prev => ({
          ...prev,
          items,
          highlightedIndex: items.length > 0 ? 0 : -1,
          isLoading: false,
          isHidden,
        }));
        // A hidden menu closes its popover, which also releases the popover's
        // Escape and light-dismiss handling; matches reopen it at the caret.
        if (isHidden && !isMenuSuppressedRef.current) {
          isMenuSuppressedRef.current = true;
          hidePopover();
        } else if (!isHidden && isMenuSuppressedRef.current) {
          isMenuSuppressedRef.current = false;
          setAnchor();
          showPopover();
        }
      };

      const doSearch = () => {
        if (trigger.searchSource) {
          // Use SearchSource — cancel previous, then search
          trigger.searchSource.cancel?.();
          const result = trigger.searchSource.search(query);
          // A synchronous source already has its results, so it never shows
          // or announces the loading row (spec:AST-086 FR7).
          if (!Array.isArray(result)) {
            setState(prev => ({...prev, isLoading: true}));
          }
          Promise.resolve(result).then(
            items => {
              if (!isCurrent()) {
                return;
              }
              applyResults(items);
            },
            () => {
              if (!isCurrent()) {
                return;
              }
              applyResults([]);
            },
          );
        }
      };

      // Debounce async sources, immediate for sync
      if (trigger.searchSource) {
        // Check if search is likely sync (returns array, not promise)
        const testResult = trigger.searchSource.search('');
        const isAsync = testResult instanceof Promise;
        if (isAsync && debounceMs > 0) {
          setState(prev => ({...prev, isLoading: true}));
          searchTimeoutRef.current = setTimeout(doSearch, debounceMs);
        } else {
          doSearch();
        }
      }
    },
    [
      debounceMs,
      editableRef,
      triggers,
      reset,
      setAnchor,
      hidePopover,
      showPopover,
    ],
  );

  const selectItem = useCallback(
    (item: SearchableItem) => {
      const trigger = state.activeTrigger;
      if (!trigger) {
        return;
      }

      const editable = editableRef.current;
      if (!editable) {
        return;
      }

      // Clean up anchor span before modifying DOM — if the span were
      // inside the editable it would split text nodes and break offsets.
      // With the body-appended approach this is just bookkeeping.
      removeAnchorSpan();

      deleteTriggerText(editable, triggerStartRef.current);

      const result = trigger.onSelect(item);
      if (typeof result === 'string') {
        onInsertText(result);
      } else {
        onInsertToken(result);
      }

      onEmitChange();
      reset();
    },
    [
      state.activeTrigger,
      editableRef,
      removeAnchorSpan,
      onInsertText,
      onInsertToken,
      onEmitChange,
      reset,
    ],
  );

  const handleInput = useCallback(() => {
    if (!triggers || triggers.length === 0) {
      return;
    }

    const editable = editableRef.current;
    if (!editable) {
      return;
    }

    const textBefore = getTextBeforeCursor(editable);
    if (textBefore === null) {
      dismissedRef.current = null;
      if (state.isActive) {
        reset();
      }
      return;
    }

    const found = findActiveTrigger(textBefore, triggers);
    if (!found) {
      dismissedRef.current = null;
      if (state.isActive) {
        reset();
      }
      return;
    }

    const {trigger, query, triggerStart} = found;

    // After Escape, keep the menu hidden while that same query keeps growing
    const dismissed = dismissedRef.current;
    if (
      dismissed &&
      dismissed.character === trigger.character &&
      dismissed.triggerStart === triggerStart &&
      dismissed.textNode !== null &&
      dismissed.textNode.isConnected &&
      dismissed.textNode === getCaretTextNode(editable)
    ) {
      if (query.startsWith(dismissed.dismissedQuery)) {
        return;
      }
      dismissedRef.current = null;
    } else {
      dismissedRef.current = null;
    }

    if (
      !state.isActive ||
      state.activeTrigger?.character !== trigger.character ||
      triggerStartRef.current !== triggerStart
    ) {
      triggerStartRef.current = triggerStart;
      isMenuSuppressedRef.current = false;
      setState(prev => ({
        ...prev,
        isActive: true,
        activeTrigger: trigger,
        query,
        highlightedIndex: 0,
        isHidden: false,
      }));
      setAnchor();
      searchItems(trigger, query);
      popover.show();
    } else if (state.query !== query) {
      setState(prev => ({...prev, query, activeTrigger: trigger}));
      searchItems(trigger, query);
    }
  }, [
    triggers,
    editableRef,
    state.isActive,
    state.activeTrigger,
    state.query,
    reset,
    setAnchor,
    searchItems,
    popover,
  ]);

  const isMenuVisible = state.isActive && !state.isHidden;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      // Never intercept IME composition keystrokes (e.g. Enter committing candidates)
      if (isImeKeyEvent(e.nativeEvent)) {
        return false;
      }

      // A hidden menu consumes nothing: arrows move the caret, Enter submits,
      // and Escape reaches the surrounding surface.
      if (!isMenuVisible) {
        return false;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        const editable = editableRef.current;
        const dismissed = state.activeTrigger
          ? {
              character: state.activeTrigger.character,
              triggerStart: triggerStartRef.current,
              dismissedQuery: state.query,
              textNode: editable ? getCaretTextNode(editable) : null,
            }
          : null;
        reset();
        // Remembered after reset, which clears it: the menu stays hidden while
        // this same query keeps growing.
        dismissedRef.current = dismissed;
        return true;
      }

      // A visible menu keeps the arrows even when it has nothing to pick (rows
      // still loading, or the empty message), so they never recall history
      // under an open panel. Enter and Tab pick only a settled row; otherwise
      // they keep their editor meaning, so Enter sends the message as typed.
      const hasPickableRows = !state.isLoading && state.items.length > 0;
      if (!hasPickableRows && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        return true;
      }
      if (!hasPickableRows) {
        return false;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setState(prev => ({
            ...prev,
            highlightedIndex:
              prev.highlightedIndex < prev.items.length - 1
                ? prev.highlightedIndex + 1
                : 0,
          }));
          return true;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setState(prev => ({
            ...prev,
            highlightedIndex:
              prev.highlightedIndex > 0
                ? prev.highlightedIndex - 1
                : prev.items.length - 1,
          }));
          return true;
        }
        case 'Enter':
        case 'Tab': {
          if (
            state.highlightedIndex >= 0 &&
            state.highlightedIndex < state.items.length
          ) {
            e.preventDefault();
            selectItem(state.items[state.highlightedIndex]);
            return true;
          }
          return false;
        }
        default:
          return false;
      }
    },
    [
      isMenuVisible,
      editableRef,
      state.activeTrigger,
      state.query,
      state.isLoading,
      state.highlightedIndex,
      state.items,
      selectItem,
      reset,
    ],
  );

  const getItemId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId],
  );

  // Keep the highlighted option visible during keyboard navigation; hover
  // highlights never scroll (#6077). Both sides live in useHighlightedOptionScroll.
  const highlightOnHover = useHighlightedOptionScroll({
    isOpen: popover.isOpen,
    highlightedIndex: state.highlightedIndex,
    setHighlightedIndex: index =>
      setState(prev => ({...prev, highlightedIndex: index})),
    getOptionId: getItemId,
  });

  // ARIA props for the editable element. Of the attributes the trigger menu
  // needs, only aria-expanded forces the role: aria-controls and
  // aria-haspopup are global, and aria-activedescendant is allowed on
  // textbox too. So the element becomes a combobox exactly when triggers are
  // configured and there is an expanded state to report; with no triggers it
  // stays a plain textbox. aria-multiline runs the other way — ARIA 1.2
  // supports it on textbox but not on combobox — so it rides the textbox
  // branch. Emitting it on the combobox branch is a critical
  // aria-allowed-attr violation (#4681).
  const hasTriggers = (triggers?.length ?? 0) > 0;
  const ariaProps: UseTriggerMenuReturn['ariaProps'] = !hasTriggers
    ? {role: 'textbox', 'aria-multiline': 'true'}
    : isMenuVisible
      ? {
          role: 'combobox',
          'aria-expanded': true as const,
          'aria-controls': listboxId,
          'aria-activedescendant':
            state.highlightedIndex >= 0
              ? getItemId(state.highlightedIndex)
              : undefined,
          'aria-haspopup': 'listbox' as const,
        }
      : {
          role: 'combobox',
          'aria-expanded': false as const,
          'aria-haspopup': 'listbox' as const,
        };

  const renderMenu = useCallback((): ReactNode => {
    const activeTrigger = state.activeTrigger;
    if (!activeTrigger) {
      return null;
    }

    if (state.isHidden) {
      return null;
    }

    const emptyText = activeTrigger.emptySearchText ?? 'No results';

    let listContent: ReactNode;
    if (state.isLoading) {
      listContent = (
        <div {...stylex.props(styles.loadingState)}>{loadingText}</div>
      );
    } else if (state.items.length === 0 && state.isActive) {
      listContent = <div {...stylex.props(styles.emptyState)}>{emptyText}</div>;
    } else {
      const groups = groupItems(state.items);
      let flatIndex = 0;
      listContent = groups.map(group => {
        const groupItems = group.items.map(item => {
          const idx = flatIndex++;
          return (
            <div
              key={item.id}
              id={getItemId(idx)}
              role="option"
              aria-selected={idx === state.highlightedIndex}
              tabIndex={-1}
              onMouseDown={e => {
                e.preventDefault(); // Keep focus in the editable
                selectItem(item);
              }}
              onMouseEnter={() => highlightOnHover(idx)}
              {...stylex.props(
                styles.item,
                idx === state.highlightedIndex && styles.itemHighlighted,
              )}>
              {activeTrigger.renderItem ? (
                activeTrigger.renderItem(item)
              ) : (
                <span {...stylex.props(styles.itemLabel)}>{item.label}</span>
              )}
            </div>
          );
        });
        if (group.heading) {
          return (
            <div
              key={`group-${group.heading}`}
              role="group"
              aria-label={group.heading}>
              <div aria-hidden="true" {...stylex.props(styles.groupHeading)}>
                {group.heading}
              </div>
              {groupItems}
            </div>
          );
        }
        return groupItems;
      });
    }

    return popover.render(
      <div
        id={listboxId}
        role="listbox"
        aria-label={
          activeTrigger.menuLabel ?? t('@astryx.chatTriggerMenu.suggestions')
        }
        {...mergeProps(
          themeProps('trigger-menu'),
          stylex.props(styles.dropdown),
        )}>
        {listContent}
      </div>,
      {
        placement: 'above',
        alignment: 'start',
        offset: spacingVars['--spacing-1'],
        xstyle: styles.popoverSurface,
      },
    );
  }, [
    popover,
    listboxId,
    state,
    selectItem,
    getItemId,
    highlightOnHover,
    t,
    loadingText,
  ]);

  return {
    state,
    handleInput,
    handleKeyDown,
    renderMenu,
    reset,
    ariaProps,
  };
}
