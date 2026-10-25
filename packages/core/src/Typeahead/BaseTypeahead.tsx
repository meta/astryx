// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BaseTypeahead.tsx
 * @input Uses React, StyleX, usePopover, TypeaheadItem
 * @output Exports BaseTypeahead; focus bootstraps a replaced search source
 * @position Core implementation; used by Typeahead and Tokenizer
 *
 * Pure combobox engine: input, search, keyboard navigation, dropdown.
 * No wrapper div, no border styling, no token rendering.
 * Consumers provide their own wrapper and pass anchorRef for dropdown positioning.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Typeahead/index.ts
 * - /packages/cli/assets/templates/blocks/components/Typeahead/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useBusyIndicatorLane} from './busyIndicatorLane';
import {useTrailingKeyDown} from './trailingKeyDown';
import type {StyleXStyles} from '@stylexjs/stylex';
import {usePopover} from '../Popover/usePopover';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useHighlightedOptionScroll} from '../hooks/useHighlightedOptionScroll';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isImeKeyEvent} from '../utils/ime';
import {TypeaheadItem} from './TypeaheadItem';
import {Icon} from '../Icon';
import {Spinner} from '../Spinner';
import {
  borderVars,
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {
  characterCount,
  composeEventHandlers,
  getKey,
  groupItems,
  mergeProps,
} from '../utils';
import {warnOnce} from '../utils/devWarning';
import type {BaseProps} from '../BaseProps';
import type {SearchableItem, SearchSource} from './types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {clampInlineSize} from '../Layer/clampInlineSize';
// =============================================================================
// Types
// =============================================================================

export interface BaseTypeaheadProps<T extends SearchableItem> extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Search source providing items.
   */
  searchSource: SearchSource<T>;

  /**
   * Currently selected item (null = nothing selected).
   */
  value: T | null;

  /**
   * Callback when selection changes.
   */
  onChange: (item: T | null) => void;

  /**
   * Render function for dropdown items. Default: TypeaheadItem.
   */
  renderItem?: (item: T) => ReactNode;

  /**
   * Placeholder text.
   */
  placeholder?: string;

  /**
   * Show results on focus before typing.
   * @default false
   */
  hasEntriesOnFocus?: boolean;

  /**
   * Max dropdown items to display.
   * @default 10
   */
  maxMenuItems?: number;

  /** Requested dropdown width in pixels before viewport clamping. */
  menuWidth?: number;

  /**
   * Minimum query length before the search source is queried. Below it no
   * search runs and the menu stays closed, so a remote source is not asked
   * for a result set that cannot be meaningful yet — and the user does not
   * see "no results" for a query that was never searched.
   *
   * Measured by grapheme cluster, so one visible character counts once even
   * when JavaScript represents it with multiple UTF-16 code units.
   *
   * @default 1 — every non-empty query is searched.
   */
  minQueryLength?: number;

  /**
   * Content shown when the query matched nothing (`spec:AST-056` FR1).
   * Takes a `ReactNode`, so a dead end can carry a link or a create row.
   *
   * The message is announced in a polite live region as the text it renders,
   * read from the DOM, so an element is announced as written and anything
   * marked `aria-hidden` is left out of both. Content that renders no text
   * announces nothing, matching the screen.
   *
   * `null` means "not given", exactly as `undefined` does, so it falls
   * through to the default. Pass an empty string to render nothing.
   *
   * @default 'No results found'
   */
  emptySearchText?: ReactNode;

  /**
   * Whether the input is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * When disabled with a reason, keeps the input focusable via `aria-disabled`
   * (instead of the native `disabled` attribute) and `readOnly` so an
   * associated disabled-reason tooltip stays discoverable by keyboard and
   * assistive technology. Query and text mutation are blocked, but an
   * already-open highlighted option can still be selected with Enter after a
   * transition into this state. Consumers (Typeahead) own the tooltip and
   * wrapper.
   * @default false
   */
  isFocusableDisabled?: boolean;

  /**
   * Auto-focus on mount.
   * @default false
   */
  hasAutoFocus?: boolean;

  /**
   * Query change callback (for logging/external use).
   */
  onChangeQuery?: (query: string) => void;

  /**
   * Callback when dropdown opens/closes.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Entries derived from the query text rather than fetched for it — today,
   * Tokenizer's "Create ...".
   *
   * They are appended to whatever the search returned, and they are offered
   * whatever `minQueryLength` says: that threshold exists to avoid a fetch
   * that is too broad to be worth making, and these cost no fetch. A field
   * that can create `QA` should not stop being able to just because a search
   * for `QA` would match too much.
   *
   * Receives the results they will be appended to, so a caller can decline to
   * offer an entry that duplicates one.
   *
   * Underscored and `@internal`: `BaseTypeaheadProps` is re-exported from the
   * package entry point, so anything named on it ships as public API at the
   * next cut. This is a wiring detail between Tokenizer and the base — the
   * same reason `DefinedTheme.__inputTokens` carries its prefix.
   *
   * @internal
   */
  __queryEntries?: (query: string, results: T[]) => T[];

  /**
   * Debounce delay in ms before triggering search after typing.
   * Set to 0 for synchronous/local search sources that don't need debouncing.
   * @default 150
   */
  debounceMs?: number;

  /**
   * Legacy input-specific alias for the native `id` prop. When provided, this
   * alias takes precedence; otherwise the native prop is preserved.
   */
  inputId?: string;

  /**
   * Legacy input-specific alias for native `aria-describedby`. When provided,
   * this alias takes precedence; otherwise the native prop is preserved.
   */
  ariaDescribedBy?: string;

  /**
   * Legacy input-specific alias for native `aria-labelledby`. When provided,
   * this alias takes precedence; otherwise the native prop is preserved.
   */
  ariaLabelledBy?: string;

  /**
   * Additional StyleX styles for the input element.
   */
  inputXStyle?: StyleXStyles;

  /**
   * Legacy input-specific alias for native `tabIndex`. When provided, this
   * alias takes precedence; otherwise the native prop is preserved. Typeahead
   * passes `-1` while its selected-value token is shown: the input is visually
   * collapsed (width 0 / opacity 0) but must stay programmatically focusable
   * for token edit/clear interactions, so removing it from the Tab order is
   * what prevents an invisible tab stop (WCAG 2.4.3 / 2.4.7). The input remains
   * focusable via `.focus()` regardless of this value.
   */
  inputTabIndex?: number;

  /**
   * Ref to the anchor element for dropdown positioning.
   * The dropdown will be positioned relative to this element.
   * If not provided, the input itself is used as the anchor.
   */
  anchorRef?: RefObject<HTMLElement | null>;

  /**
   * Additional keydown handler called before internal keyboard navigation.
   * If the handler calls `e.preventDefault()`, internal handling is skipped.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  /**
   * Size of the typeahead, used to scale dropdown item padding.
   * When 'sm', items get compact padding to match the trigger size.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  input: {
    display: 'block',
    flex: 1,
    minWidth: '60px',
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    fontFamily: typographyVars['--font-family-body'],
    // The 16px floor is iOS-only: iOS Safari zooms the page when a focused
    // control sits under 16px, and only iOS WebKit implements
    // -webkit-touch-callout to key the coarse-pointer floor to it.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    outline: 'none',
    '::placeholder': {
      color: colorVars['--color-text-secondary'],
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  dropdown: {
    boxSizing: 'border-box',
    maxHeight: '300px',
    overflowY: 'auto',
    padding: spacingVars['--spacing-1'],
  },
  // The menu prefers the input's width and renders an explicit menuWidth at
  // its size, both clamped to the layer runtime's viewport cap rather than to
  // the room beside the input (spec:AST-059 FR2, FR7).
  popover: {
    boxSizing: 'border-box',
    minWidth: stylex.firstThatWorks(
      `min(anchor-size(width), ${layerViewportInset.maxInlineSize})`,
      `min(anchor-size(width), ${layerViewportInset.maxInlineSizeFallback})`,
      'anchor-size(width)',
    ),
  },
  popoverCustomWidth: (width: string) => ({
    width,
  }),
  groupHeading: {
    paddingInline: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
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
    textAlign: 'start',
  },
  itemHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'Highlight',
    },
    outlineStyle: {
      default: null,
      '@media (forced-colors: active)': 'solid',
    },
    outlineWidth: {
      default: null,
      '@media (forced-colors: active)': borderVars['--border-width'],
    },
  },
  itemSelected: {
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  itemContent: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  defaultItem: {
    minWidth: 0,
    width: '100%',
  },
  emptyState: {
    padding: spacingVars['--spacing-3'],
    textAlign: 'center',
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
  // The indicator a direct caller gets. In flow, where it has always been, so
  // it reserves its own width and the input's text never runs under it.
  // Typeahead and Tokenizer take the indicator over and paint it in their own
  // inline-end lane instead; this is what renders for everyone else.
  loadingStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: spacingVars['--spacing-1'],
  },
});

/**
 * Size-specific overrides for dropdown list items.
 * Matches the pattern used by DropdownMenuItem / Selector so that
 * an `sm` typeahead renders compact list items.
 */
const itemSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {
    paddingBlock: spacingVars['--spacing-2'],
  },
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * A query that has been typed but is still shorter than the caller's
 * threshold. An empty query is not "below the minimum" — it is the
 * untouched state, and `hasEntriesOnFocus` owns what happens there.
 */
function isBelowMinQueryLength(query: string, minQueryLength: number): boolean {
  const length = characterCount(query);
  return length > 0 && length < minQueryLength;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Combobox engine: input, search, keyboard navigation, and dropdown.
 *
 * Renders only the `<input>` and the dropdown popover. No wrapper div,
 * no border styling, no token rendering. Consumers (Typeahead,
 * Tokenizer) provide their own wrapper and pass `anchorRef` for
 * dropdown positioning.
 *
 * @example
 * ```
 * <BaseTypeahead
 *   searchSource={source}
 *   value={selected}
 *   onChange={setSelected}
 *   aria-label="Search frameworks"
 *   anchorRef={wrapperRef}
 *   placeholder="Search..."
 * />
 * ```
 */
export const BaseTypeahead = function BaseTypeahead<T extends SearchableItem>({
  searchSource,
  value,
  onChange,
  renderItem,
  placeholder: placeholderFromProps,
  hasEntriesOnFocus = false,
  maxMenuItems = 10,
  menuWidth,
  minQueryLength = 1,
  emptySearchText: emptySearchTextFromProps,
  isDisabled = false,
  isFocusableDisabled = false,
  hasAutoFocus = false,
  onChangeQuery,
  onOpenChange,
  __queryEntries,
  inputId: externalInputId,
  ariaDescribedBy,
  ariaLabelledBy,
  inputXStyle,
  inputTabIndex,
  anchorRef,
  onKeyDown: externalOnKeyDown,
  debounceMs = 150,
  size = 'md',
  xstyle,
  className,
  style,
  onPointerDown: onPointerDownProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  onClick: onClickProp,
  id: nativeInputId,
  'aria-describedby': nativeAriaDescribedBy,
  'aria-labelledby': nativeAriaLabelledBy,
  tabIndex: nativeInputTabIndex,
  ref,
  ...rest
}: BaseTypeaheadProps<T>) {
  const t = useTranslator();
  const placeholder =
    placeholderFromProps ?? t('@astryx.typeahead.searchPlaceholder');
  const emptySearchText =
    emptySearchTextFromProps ?? t('@astryx.typeahead.emptySearchResults');
  // The empty-state row carries the message visually, and the live region has
  // to speak the same words. `emptySearchText` takes a ReactNode, so they are
  // read off the rendered row after it renders rather than guessed from the
  // prop — announcing a default over a caller's element tells the
  // screen-reader user something the sighted user is not reading
  // (`spec:AST-056` AR1).
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  // Keep the released input-specific aliases authoritative when a caller uses
  // them, but do not let an omitted alias erase the equivalent native BaseProp.
  const inputId = externalInputId ?? nativeInputId ?? generatedId;
  const inputAriaDescribedBy = ariaDescribedBy ?? nativeAriaDescribedBy;
  const inputAriaLabelledBy = ariaLabelledBy ?? nativeAriaLabelledBy;
  const resolvedInputTabIndex = inputTabIndex ?? nativeInputTabIndex;
  const listboxId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackAnchorRef = useRef<HTMLInputElement>(null);

  // Announce result counts / "no results" to screen readers via a persistent
  // live region (comboboxes-6). The combobox's own popup carries no working
  // live region, so highlight/result changes were previously silent.
  const announce = useAnnounce();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);

  // `action` is declared on `SearchableItem` for the grid-adopting hosts;
  // this panel has not adopted it, so it renders the item without the
  // control and says so (spec:AST-058 FR9).
  useEffect(() => {
    if (results.some(item => item.action != null)) {
      warnOnce(
        'base-typeahead:item-action',
        'BaseTypeahead',
        'A result carries `action`, which the typeahead panel does not render ' +
          'yet; the item is shown without it.',
      );
    }
  }, [results]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Only the WORDS move here, not the timing. An empty query still reports
  // nothing — a focus-opened menu that bootstrapped to nothing is not a
  // search that failed — and a search still in flight reports nothing, which
  // matters because the row is in the DOM before the spinner clears.
  useAnnounceRenderedText(
    emptyStateRef,
    results.length === 0 && hasSearched && query.length > 0 && !isLoading,
    query,
  );

  // Report the busy state to a wrapper that has taken the indicator over.
  //
  // Through a ref, and at the call site rather than from an effect: an effect
  // would run after this component had already committed, so the wrapper's
  // own state change landed in a second commit — two renders of the whole
  // field per transition, four across a search. Called here, the wrapper's
  // setState batches with ours into the one commit that React was already
  // doing. The ref keeps the identity of a caller's inline arrow from
  // mattering, and the guard makes the report edge-triggered: the redundant
  // `false` on every keystroke below the query threshold reports nothing.
  //
  // The ref is synced in a layout effect rather than during render, following
  // `onMotionStartRef` in BottomSheetPanel — a render that React discards
  // must not leave the ref pointing at the callback from the abandoned pass.
  // This effect only writes a ref, so it commits nothing and no wrapper
  // re-renders for it; every caller of `setLoading` runs from an event or an
  // awaited continuation, long after the first commit.
  // A wrapper that owns the inline-end lane subscribes through context; see
  // busyIndicatorLane.tsx for why this is not a prop.
  const busyLane = useBusyIndicatorLane();
  // Without a wrapper that took the indicator over, this input announces each
  // search's busy start (spec:AST-086 FR8); its Spinner stays named but is not
  // a live region (family:input-fields FR7).
  const settleBusyAnnouncement = useBusyAnnouncement(
    isLoading && busyLane == null,
    t('@astryx.typeahead.loading'),
    inputRef,
  );
  const onLoadingChangeRef = useRef(busyLane?.onBusyChange);
  useIsomorphicLayoutEffect(() => {
    onLoadingChangeRef.current = busyLane?.onBusyChange;
  }, [busyLane]);
  const loadingRef = useRef(false);
  const setLoading = useCallback((next: boolean) => {
    if (loadingRef.current === next) {
      return;
    }
    loadingRef.current = next;
    setIsLoading(next);
    onLoadingChangeRef.current?.(next);
  }, []);

  // Track active pointer to defer popover.show() past click events.
  // With popover="auto", showing the popover between pointerdown and
  // pointerup/click causes the browser's light-dismiss to immediately
  // close it (the click is seen as "outside" the newly-opened popover).
  const pointerActiveRef = useRef(false);

  // Whether the input was ALREADY the active element the moment the current
  // click gesture began, captured at pointerdown -- before the browser's own
  // focus-on-pointerdown behavior can move focus onto it. pointerdown always
  // fires before focus in a mouse/touch-driven click (pointerdown -> focus ->
  // pointerup -> click), so this reflects the pre-click focus state exactly,
  // with no dependency on event-loop timing between focus and click (a
  // microtask-based flag cleared between the two was tried and measured
  // clearing before the click arrived for an async bootstrap source,
  // double-firing it). A click that itself just caused the input to gain
  // focus reads false here and is left to handleFocus, which already opens
  // it; a click on an input that was already focused -- closing the
  // dropdown (selecting a result, committing a token elsewhere in a
  // composing component) often re-focuses the same input programmatically,
  // which dispatches no focus event at all -- reads true and reopens it in
  // handleClick.
  const wasAlreadyFocusedRef = useRef(false);

  // Debounce ref
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monotonic counter incremented on selection, query-clear, and source
  // replacement. Async searches that resolve afterwards compare their
  // captured generation to the current value and discard stale results.
  const searchGenRef = useRef(0);
  // The generation at which results were last populated. handleFocus
  // compares this to searchGenRef — if they differ, the cached results
  // in the closure are stale (a selection cleared them) and shouldn't
  // be re-shown.
  const resultsGenRef = useRef(0);
  // The generation at which the current searchSource took over. Results
  // populated before it (resultsGenRef below this) came from a replaced
  // source: they can never be re-shown, so focus bootstraps the new source.
  const sourceGenRef = useRef(0);

  // Results still arriving from a replaced source must not land in the new
  // one's menu.
  const prevSearchSourceRef = useRef(searchSource);
  if (prevSearchSourceRef.current !== searchSource) {
    prevSearchSourceRef.current.cancel?.();
    prevSearchSourceRef.current = searchSource;
    sourceGenRef.current = ++searchGenRef.current;
  }

  // The previous source is remembered in state, not a ref, so a render React
  // discards cannot consume the comparison without its state updates.
  const [sourceOfState, setSourceOfState] = useState(searchSource);
  if (sourceOfState !== searchSource) {
    setSourceOfState(searchSource);
    if (isLoading) {
      setIsLoading(false);
      setHasSearched(false);
    }
    loadingRef.current = false;
  }

  // When the search source is replaced, any in-flight load from the previous
  // source is abandoned (generation bumped above). Notify the wrapper's busy lane
  // in an effect so external store listeners run safely after commit.
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (!loadingRef.current) {
      onLoadingChangeRef.current?.(false);
    }
  }, [searchSource]);

  // Layer for dropdown
  const handleLayerShow = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handleLayerHide = useCallback(() => {
    onOpenChange?.(false);
    setHighlightedIndex(-1);
    searchSource.cancel?.();
  }, [onOpenChange, searchSource]);

  const popover = usePopover({
    onShow: handleLayerShow,
    onHide: handleLayerHide,
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own role="listbox" is the exposed semantics; the input keeps
    // DOM focus, so wrapping it in a modal dialog would misrepresent it.
    role: 'none',
  });

  // Show the layer, deferring past the active click if a pointer is down.
  // Without this, popover="auto" light-dismiss immediately closes the
  // dropdown when it opens between pointerdown and pointerup/click.
  const showLayer = useCallback(() => {
    if (pointerActiveRef.current) {
      document.addEventListener(
        'click',
        () => requestAnimationFrame(() => popover.show()),
        {once: true},
      );
    } else {
      popover.show();
    }
  }, [popover]);

  // Set up anchor on the provided anchorRef or fall back to the input itself
  useEffect(() => {
    const el = anchorRef?.current ?? fallbackAnchorRef.current;
    if (el) {
      popover.triggerRef(el);
    }
    return () => {
      popover.triggerRef(null);
    };
  }, [popover, anchorRef]);

  // Perform search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      searchSource.cancel?.();
      // Claim a new generation so overlapping searches can't race: an
      // in-flight response for an older query fails the gen check below
      // instead of overwriting the newer results.
      const gen = ++searchGenRef.current;
      setLoading(true);
      setHasSearched(true);
      try {
        const searchResults = await searchSource.search(searchQuery);
        if (searchGenRef.current !== gen) {
          return;
        }
        resultsGenRef.current = gen;
        const fetched = searchResults.slice(0, maxMenuItems);
        const shown = [
          ...fetched,
          ...(__queryEntries?.(searchQuery, fetched) ?? []),
        ];
        setResults(shown);
        setHighlightedIndex(shown.length > 0 ? 0 : -1);
        if (searchResults.length > 0 || searchQuery.length > 0) {
          showLayer();
        }
        // Announce the outcome only for an active query (not the initial
        // focus-open), so screen-reader users hear result counts / no-results.
        if (searchQuery.length > 0) {
          // This query's outcome is announced now (a count) or from the
          // rendered row (an empty result); a busy start not yet announced
          // would follow it, so it is dropped (spec:AST-086 FR8).
          settleBusyAnnouncement();
        }
        if (searchQuery.length > 0 && shown.length > 0) {
          announce(t('@astryx.typeahead.resultCount', {count: shown.length}));
        }
        // An empty result is announced from the rendered row instead, so the
        // region speaks whatever the caller put there.
      } catch {
        if (searchGenRef.current !== gen) {
          return;
        }
        setResults([]);
        setHighlightedIndex(-1);
      } finally {
        if (searchGenRef.current === gen) {
          setLoading(false);
        }
      }
    },
    [
      searchSource,
      maxMenuItems,
      showLayer,
      announce,
      __queryEntries,
      setLoading,
      settleBusyAnnouncement,
      t,
    ],
  );

  const applyBootstrapResults = useCallback(
    (bootstrapResults: T[], gen: number) => {
      if (searchGenRef.current !== gen) {
        return;
      }
      resultsGenRef.current = gen;
      const shown = bootstrapResults.slice(0, maxMenuItems);
      const nextHighlightedIndex = shown.length > 0 ? 0 : -1;
      if (
        results.length === 0 &&
        shown.length === 0 &&
        highlightedIndex === -1
      ) {
        return;
      }
      setResults(shown);
      setHighlightedIndex(nextHighlightedIndex);
      if (bootstrapResults.length > 0) {
        showLayer();
      }
    },
    [highlightedIndex, maxMenuItems, results.length, showLayer],
  );

  // Perform bootstrap
  const performBootstrap = useCallback(async () => {
    const gen = ++searchGenRef.current;
    let bootstrapResult: T[] | Promise<T[]>;
    try {
      bootstrapResult = searchSource.bootstrap();
    } catch {
      if (searchGenRef.current === gen) {
        setResults([]);
        setLoading(false);
      }
      return;
    }

    if (Array.isArray(bootstrapResult)) {
      setLoading(false);
      applyBootstrapResults(bootstrapResult, gen);
      return;
    }

    setLoading(true);
    try {
      applyBootstrapResults(await bootstrapResult, gen);
    } catch {
      if (searchGenRef.current === gen) {
        setResults([]);
      }
    } finally {
      if (searchGenRef.current === gen) {
        setLoading(false);
      }
    }
  }, [searchSource, applyBootstrapResults, setLoading]);

  // Handle query change
  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      onChangeQuery?.(newQuery);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Nothing to search: either the field was emptied, or the query is
      // still shorter than `minQueryLength`. Both drop stale results and
      // close the menu — showing the empty state for a query that was never
      // searched would report "no results" that nobody looked for.
      if (
        (newQuery.length === 0 && !hasEntriesOnFocus) ||
        isBelowMinQueryLength(newQuery, minQueryLength)
      ) {
        searchGenRef.current++;
        searchSource.cancel?.();
        // A query too short to search can still carry entries derived from
        // the text itself. `hasSearched` stays false either way, so the menu
        // never reports "no results" for a query nobody looked for.
        const derived = __queryEntries?.(newQuery, []) ?? [];
        setResults(derived);
        setHighlightedIndex(derived.length > 0 ? 0 : -1);
        setHasSearched(false);
        // Bumping the generation abandons any in-flight search, which means
        // its own `finally` will decline to clear this — so clear it here or
        // the field spins forever. Backspacing below the threshold on a remote
        // source is the everyday way to hit that.
        setLoading(false);
        // Clear any lingering result-count / no-results announcement.
        announce('');
        if (derived.length > 0) {
          showLayer();
        } else {
          popover.hide();
        }
        return;
      }

      const triggerSearch = () => {
        if (newQuery.length > 0) {
          void performSearch(newQuery);
        } else if (hasEntriesOnFocus) {
          void performBootstrap();
        }
      };

      if (debounceMs <= 0) {
        triggerSearch();
      } else {
        searchTimeoutRef.current = setTimeout(triggerSearch, debounceMs);
      }
    },
    [
      onChangeQuery,
      hasEntriesOnFocus,
      minQueryLength,
      __queryEntries,
      showLayer,
      performSearch,
      performBootstrap,
      popover,
      debounceMs,
      searchSource,
      announce,
      setLoading,
    ],
  );

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleQueryChange(e.target.value);
    },
    [handleQueryChange],
  );

  // Handle item selection
  const handleSelect = useCallback(
    (item: T) => {
      // Bump generation to invalidate any in-flight async searches
      searchGenRef.current++;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      searchSource.cancel?.();
      onChange(item);
      setQuery('');
      setResults([]);
      setHasSearched(false);
      // Same reason as in handleQueryChange: the invalidated search will not
      // clear this itself. Selecting a stale result while the next search is
      // still in flight would otherwise leave the field spinning.
      setLoading(false);
      popover.hide();
      inputRef.current?.focus();
    },
    [onChange, popover, searchSource, setLoading],
  );

  // Shared by handleFocus and handleClick: bootstrap entries if none are
  // loaded yet, or re-show cached results that haven't been invalidated by
  // a selection since (comparing the two generation refs catches that).
  // Results cached from a replaced search source count as none, so focusing
  // an empty field bootstraps the new source instead of opening nothing.
  // Results a selection invalidated still keep the menu closed when the
  // selection returns focus to the input.
  const openIfEligible = useCallback(() => {
    if (isDisabled) {
      return;
    }
    const hasResultsFromCurrentSource =
      results.length > 0 && resultsGenRef.current >= sourceGenRef.current;
    if (
      hasEntriesOnFocus &&
      !hasResultsFromCurrentSource &&
      query.length === 0
    ) {
      void performBootstrap();
    } else if (
      results.length > 0 &&
      (query.length > 0 || hasEntriesOnFocus) &&
      resultsGenRef.current === searchGenRef.current
    ) {
      showLayer();
    }
  }, [
    isDisabled,
    hasEntriesOnFocus,
    results.length,
    query.length,
    performBootstrap,
    showLayer,
  ]);

  // Handle focus
  const handleFocus = useCallback(() => {
    openIfEligible();
  }, [openIfEligible]);

  // Handle click — a click that focuses a previously-unfocused input is
  // already covered by handleFocus. A click on an input that was ALREADY
  // focused (the common case right after selecting a result or committing a
  // token elsewhere re-focuses this input programmatically, closing the
  // dropdown) dispatches no focus event at all, so without this the
  // dropdown never reopens until the user clicks away and back (#6845). See
  // wasAlreadyFocusedRef above for how the two cases are told apart.
  const handleClick = useCallback(() => {
    if (!wasAlreadyFocusedRef.current || popover.isOpen) {
      return;
    }
    if (
      hasEntriesOnFocus &&
      query.length === 0 &&
      resultsGenRef.current !== searchGenRef.current
    ) {
      void performBootstrap();
      return;
    }
    openIfEligible();
  }, [
    popover.isOpen,
    hasEntriesOnFocus,
    query.length,
    performBootstrap,
    openIfEligible,
  ]);

  // Handle blur — close the dropdown when focus leaves the input for an
  // element that is neither inside the field wrapper (anchor) nor inside the
  // dropdown popover. The native popover="auto" light-dismiss only fires on
  // outside pointer clicks and Escape; it does not close when focus moves away
  // via the keyboard (Tab) or programmatically, which would otherwise leave an
  // orphaned open menu. Clicking a result moves focus onto the option (it is
  // tabIndex={-1}, so it lives inside the popover) and selection re-focuses the
  // input, so this only closes on a genuine focus-out of the whole field.
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!popover.isOpen) {
        return;
      }
      const next = e.relatedTarget as Node | null;
      if (next) {
        const anchorEl = anchorRef?.current ?? fallbackAnchorRef.current;
        const popoverEl = document.getElementById(popover.id);
        if (anchorEl?.contains(next) || popoverEl?.contains(next)) {
          return;
        }
      }
      popover.hide();
    },
    [popover, anchorRef],
  );

  // Keyboard navigation
  const trailingKeyDown = useTrailingKeyDown();
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      externalOnKeyDown?.(e);
      if (e.defaultPrevented) {
        return;
      }

      // An IME candidate window uses Enter to commit the composition and
      // Escape/ArrowUp/ArrowDown/Home/End to navigate its own candidates.
      // Without this guard, a composing Enter both fires handleSelect AND
      // clears the input via handleSelect's setQuery(''), so the IME's
      // subsequent compositionend then writes the still-pending syllable
      // into the freshly-cleared field -- producing a second, spurious
      // selection on the next real Enter.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }

      if (!popover.isOpen) {
        if (e.key === 'ArrowDown' && (hasEntriesOnFocus || query.length > 0)) {
          e.preventDefault();
          if (results.length > 0) {
            popover.show();
            setHighlightedIndex(0);
          } else if (
            hasEntriesOnFocus &&
            // A below-threshold query was never searched; falling back to the
            // bootstrap entries here would open a menu of suggestions that
            // ignore what the user has already typed.
            !isBelowMinQueryLength(query, minQueryLength)
          ) {
            void performBootstrap();
          }
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (results.length > 0) {
            setHighlightedIndex(prev =>
              prev < results.length - 1 ? prev + 1 : 0,
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (results.length > 0) {
            setHighlightedIndex(prev =>
              prev > 0 ? prev - 1 : results.length - 1,
            );
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            handleSelect(results[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          popover.hide();
          break;
        case 'Tab':
          // Dismiss here rather than from the blur this press produces:
          // hiding a top-layer popover during the focusout makes Chrome
          // abandon the in-flight focus move and drop focus to <body>, so the
          // user's Tab appears to do nothing. Selector and MultiSelector
          // already dismiss on this keydown.
          popover.hide();
          break;
        case 'Home':
          if (popover.isOpen) {
            e.preventDefault();
            if (results.length > 0) {
              setHighlightedIndex(0);
            }
          }
          break;
        case 'End':
          if (popover.isOpen) {
            e.preventDefault();
            if (results.length > 0) {
              setHighlightedIndex(results.length - 1);
            }
          }
          break;
      }
    },
    [
      popover,
      results,
      highlightedIndex,
      handleSelect,
      hasEntriesOnFocus,
      query,
      minQueryLength,
      performBootstrap,
      externalOnKeyDown,
    ],
  );

  // Generate item ID for accessibility
  const getItemId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId],
  );

  // Keep the highlighted option visible during keyboard navigation; hover
  // highlights never scroll (#6077). Both sides live in useHighlightedOptionScroll.
  const highlightOnHover = useHighlightedOptionScroll({
    isOpen: popover.isOpen,
    highlightedIndex,
    setHighlightedIndex,
    getOptionId: getItemId,
    itemCount: results.length,
  });

  const selectedKey =
    value == null ? null : getKey(value.id, () => results.indexOf(value));

  // Unmount: clear the pending debounce and cancel in-flight work.
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      prevSearchSourceRef.current.cancel?.();
    };
  }, []);

  return (
    <>
      <input
        {...rest}
        ref={useMergedRefs(ref, inputRef, fallbackAnchorRef)}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={popover.isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          popover.isOpen &&
          highlightedIndex >= 0 &&
          highlightedIndex < results.length
            ? getItemId(highlightedIndex)
            : undefined
        }
        aria-autocomplete="list"
        aria-busy={isLoading || undefined}
        aria-describedby={inputAriaDescribedBy}
        aria-labelledby={inputAriaLabelledBy}
        aria-disabled={isFocusableDisabled ? 'true' : undefined}
        tabIndex={resolvedInputTabIndex}
        value={query}
        onChange={handleInputChange}
        onPointerDown={composeEventHandlers(() => {
          // Captured before the browser's own default action moves focus
          // onto the input as part of this same pointerdown — see
          // wasAlreadyFocusedRef above.
          wasAlreadyFocusedRef.current =
            document.activeElement === inputRef.current;
          pointerActiveRef.current = true;
          document.addEventListener(
            'click',
            () => {
              pointerActiveRef.current = false;
            },
            {once: true},
          );
        }, onPointerDownProp)}
        onFocus={composeEventHandlers(handleFocus, onFocusProp)}
        onClick={composeEventHandlers(handleClick, onClickProp)}
        onBlur={composeEventHandlers(handleBlur, onBlurProp)}
        onKeyDown={
          trailingKeyDown
            ? event => {
                handleKeyDown(event);
                trailingKeyDown(event);
              }
            : handleKeyDown
        }
        placeholder={placeholder}
        // When a disabled-reason tooltip is shown the input keeps focusability
        // via aria-disabled + readOnly instead of the native disabled
        // attribute. Query and text mutation are blocked, but an already-open
        // highlighted option can still be selected with Enter after transition.
        disabled={isDisabled && !isFocusableDisabled}
        readOnly={isFocusableDisabled || undefined}
        autoFocus={hasAutoFocus}
        data-autofocus={hasAutoFocus || undefined}
        autoComplete="off"
        {...mergeProps(
          stylex.props(
            styles.input,
            isDisabled && styles.inputDisabled,
            inputXStyle,
            xstyle,
          ),
          className,
          style,
        )}
      />
      {isLoading && busyLane == null && (
        <span {...stylex.props(styles.loadingStatus)}>
          <Spinner
            size="sm"
            aria-label={t('@astryx.typeahead.loading')}
            role="img"
          />
        </span>
      )}
      {popover.render(
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('@astryx.typeahead.searchResults')}
          {...mergeProps(
            themeProps('typeahead-dropdown'),
            stylex.props(styles.dropdown),
          )}>
          {results.length === 0 && hasSearched ? (
            <div
              ref={emptyStateRef}
              role="option"
              aria-disabled="true"
              {...mergeProps(
                themeProps('typeahead-empty-state'),
                stylex.props(styles.emptyState),
              )}>
              {emptySearchText}
            </div>
          ) : (
            (() => {
              let flatIndex = 0;
              const renderOption = (item: T) => {
                const index = flatIndex++;
                const itemKey = getKey(item.id, index);
                const isSelected = itemKey === selectedKey;
                return (
                  <div
                    key={itemKey}
                    id={getItemId(index)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => handleSelect(item)}
                    // Highlight follows pointer movement, not pointer
                    // presence: a menu that opens or reflows under a resting
                    // pointer keeps its keyboard highlight, so Enter acts on
                    // the option the user was shown, not the one that
                    // happened to appear under the cursor.
                    onMouseMove={() => highlightOnHover(index)}
                    {...stylex.props(
                      styles.item,
                      itemSizeStyles[size],
                      index === highlightedIndex && styles.itemHighlighted,
                      isSelected && styles.itemSelected,
                    )}>
                    <span {...stylex.props(styles.itemContent)}>
                      {renderItem ? (
                        renderItem(item)
                      ) : (
                        <TypeaheadItem
                          item={item}
                          xstyle={styles.defaultItem}
                        />
                      )}
                    </span>
                    {isSelected && (
                      <Icon icon="check" size="sm" color="primary" />
                    )}
                  </div>
                );
              };

              return groupItems(results, {ungroupedFirst: true}).map(group => {
                const options = group.items.map(renderOption);
                if (group.heading == null) {
                  return options;
                }
                return (
                  <div
                    key={`group-${group.heading}`}
                    role="group"
                    aria-label={group.heading}>
                    <div
                      aria-hidden="true"
                      {...stylex.props(styles.groupHeading)}>
                      {group.heading}
                    </div>
                    {options}
                  </div>
                );
              });
            })()
          )}
        </div>,
        {
          placement: 'below',
          alignment: 'start',
          offset: spacingVars['--spacing-1'],
          xstyle: [
            styles.popover,
            menuWidth != null &&
              styles.popoverCustomWidth(
                clampInlineSize(
                  menuWidth,
                  layerViewportInset.maxInlineSizeFallback,
                ),
              ),
          ],
        },
      )}
    </>
  );
} as <T extends SearchableItem>(
  props: BaseTypeaheadProps<T>,
) => React.ReactElement;

(BaseTypeahead as {displayName?: string}).displayName = 'BaseTypeahead';
