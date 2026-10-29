// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenizerBottomSheet.tsx
 * @input Uses BottomSheet, PanelSearchInput, Button, CheckboxIndicator,
 *   EmptyState, AlertDialog, Icon, Spinner, Text, useBusyAnnouncement, and
 *   the i18n translator
 * @output Exports TokenizerBottomSheet — the touch surface of
 *   `Tokenizer experimental.presentation="bottom-sheet"`: one tall modal sheet
 *   with a search row on top, stable-order checkbox rows, progressive
 *   long-list rendering, an optional create row, and a confirmed Clear all
 * @position Internal presentation surface of Tokenizer. Loaded on demand by
 *   Tokenizer.tsx so the inline combobox never carries it
 *   (`component:Tokenizer` PR6).
 *
 * Selection itself stays in Tokenizer: this surface receives `onAdd`,
 * `onRemove`, and `onClearAll` so the add/remove announcements, the create
 * sentinel, and the duplicate checks are the inline field's own. What lives
 * here is the sheet session — the query, the fetched results, the row order
 * snapshot taken when the sheet opens, and the rendered-row window.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tokenizer/Tokenizer.tsx (the trigger and the lazy host)
 * - /packages/core/src/Tokenizer/Tokenizer.spec.md (FR16–FR24, AR6, PR6)
 */

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {AlertDialog} from '../AlertDialog/AlertDialog';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Button} from '../Button/Button';
import {EmptyState} from '../EmptyState/EmptyState';
import {PanelSearchInput} from '../Field/PanelSearchInput';
import {Icon} from '../Icon';
import {CheckboxIndicator} from '../Indicator/CheckboxIndicator';
import {Spinner} from '../Spinner';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {Text} from '../Text/Text';
import {useTranslator} from '../i18n';
import {warnOnce} from '../utils/devWarning';
import type {SearchableItem, SearchSource} from '../Typeahead/types';
import {colorVars, radiusVars, spacingVars} from '../theme/tokens.stylex';

/**
 * Sentinel prefix for the create row's synthetic item. Kept identical to the
 * inline field's so Tokenizer's `handleAdd` recognizes it and turns it into a
 * real item with a `create` change.
 */
const CREATABLE_ID_PREFIX = '__xds_create__';
/** Rows rendered per batch while a long list scrolls (`component:Tokenizer` FR21). */
export const LIST_RENDER_BATCH_SIZE = 50;
const EMPTY_RESULTS: never[] = [];
/** Distance from the list's end at which the next batch renders. */
const LIST_LOAD_MORE_THRESHOLD_PX = 200;

const styles = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    paddingInline: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  // The sheet has no dedicated close button; it keeps BottomSheet's gesture,
  // scrim, and Escape dismissal paths, and the footer's Done.
  searchRow: {
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  // PanelSearchInput sizes its field to the 32px option rows of a dropdown
  // panel. The sheet's rows are 44px thumb targets, so the field grows to
  // match them and the query reads as the first row of the list.
  searchField: {
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
  },
  rowItem: {
    display: 'contents',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-1'],
    borderWidth: 0,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // An aria-disabled row gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there. The default repeats
  // the base value, since StyleX merges per property.
  rowDisabled: {
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  rowLabel: {
    flexGrow: 1,
    minWidth: 0,
  },
  // Same for the indicator's border: GrayText in forced colors, and the
  // default repeats the indicator's disabled border.
  indicatorDisabled: {
    borderColor: {
      default: colorVars['--color-border'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  createRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-1'],
  },
  createLabel: {
    flexGrow: 1,
    minWidth: 0,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-3'],
    marginTop: 'auto',
  },
  footerAction: {
    flexGrow: 1,
    flexBasis: 0,
  },
  emptyHost: {
    display: 'contents',
  },
  empty: {
    flexGrow: 1,
  },
  pending: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
  },
});

export interface TokenizerBottomSheetProps<T extends SearchableItem> {
  /** Whether the sheet is open. */
  isOpen: boolean;
  /** Called with `false` when the sheet dismisses or Done is pressed. */
  onOpenChange: (isOpen: boolean) => void;
  /** The trigger, which takes focus back after the sheet closes. */
  finalFocusRef: RefObject<HTMLElement | null>;
  /**
   * The query this presentation starts with. The sheet is mounted only from
   * a press until its exit completes, so the field keeps the query between
   * mounts from what `onChangeQuery` reported: a close the field forces
   * (becoming disabled while open) keeps it, as nothing the person did
   * changed it, while a close the person makes clears and reports it
   * (`component:Tokenizer` FR18).
   */
  initialQuery: string;
  /** The field label; names the sheet, the search field, and the list. */
  label: string;
  searchSource: SearchSource<T>;
  /** The committed selection. */
  value: T[];
  /** Whether `maxEntries` is reached. */
  isAtMax: boolean;
  hasCreate: boolean;
  maxMenuItems: number;
  minQueryLength: number;
  debounceMs: number;
  /** The no-results message; a string becomes the empty state's title. */
  emptySearchText: ReactNode;
  /**
   * Tokenizer's add path — duplicate checks and the create sentinel — asked
   * to stay silent: the sheet announces the change itself, from inside its
   * dialog, where `useAnnounce` routes it (`spec:AST-086` FR14). Returns
   * whether the item was added.
   */
  onAdd: (item: T, options: {silent: true}) => boolean;
  /** Tokenizer's remove path, silent for the same reason. */
  onRemove: (item: T, options: {silent: true}) => boolean;
  /** Tokenizer's clear-all path. */
  onClearAll: () => void;
  onChangeQuery?: (query: string) => void;
}

/**
 * The touch surface of Tokenizer's `bottom-sheet` presentation.
 *
 * Rows keep their position while the sheet is open: the items selected when it
 * opened lead, in `value` order, then selected items the results do not carry,
 * then the results. Toggling a row changes its checkbox and nothing else; the
 * next open takes a fresh snapshot and regroups selected-first.
 */
/**
 * The sheet: BottomSheet around the content. Split in two so the content —
 * search, rows, footer, and every announcement about them — is rendered
 * inside the sheet's dialog, where `useAnnounce` routes into it while it is
 * open (`spec:AST-086` FR14): a component that renders a modal and announces
 * about its content is inside that modal only when the announcing code is.
 *
 * The outer part also tells the content how a close came about: a close the
 * person made (Done, swipe, scrim, Escape) clears the query so the next open
 * lists the bootstrap set, while a close the field forced (becoming disabled
 * while open) keeps it (`component:Tokenizer` FR18).
 */
export function TokenizerBottomSheet<T extends SearchableItem>({
  isOpen,
  onOpenChange,
  finalFocusRef,
  label,
  ...content
}: TokenizerBottomSheetProps<T>) {
  // The content owns the query; a close the person makes clears it through
  // this handle, from the closing event, so a close the field forces by
  // becoming disabled (which never comes through here) keeps it.
  const clearQueryRef = useRef<(() => void) | null>(null);
  const requestClose = () => {
    clearQueryRef.current?.();
    onOpenChange(false);
  };
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={next => {
        if (next) {
          onOpenChange(true);
        } else {
          requestClose();
        }
      }}
      finalFocusRef={finalFocusRef}
      label={label}
      height="tall"
      padding={0}>
      <TokenizerSheetContent
        {...content}
        isOpen={isOpen}
        label={label}
        clearQueryRef={clearQueryRef}
        onRequestClose={requestClose}
      />
    </BottomSheet>
  );
}

TokenizerBottomSheet.displayName = 'TokenizerBottomSheet';

type TokenizerSheetContentProps<T extends SearchableItem> = Omit<
  TokenizerBottomSheetProps<T>,
  'onOpenChange' | 'finalFocusRef'
> & {
  /** Set by the content: clears and reports its query; called on a user close. */
  clearQueryRef: RefObject<(() => void) | null>;
  /** Close the sheet as the person's own act (Done). */
  onRequestClose: () => void;
};

function TokenizerSheetContent<T extends SearchableItem>({
  isOpen,
  initialQuery,
  clearQueryRef,
  onRequestClose,
  label,
  searchSource,
  value,
  isAtMax,
  hasCreate,
  maxMenuItems,
  minQueryLength,
  debounceMs,
  emptySearchText,
  onAdd,
  onRemove,
  onClearAll,
  onChangeQuery,
}: TokenizerSheetContentProps<T>) {
  const t = useTranslator();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Whether a checkbox row holds focus, kept by the list's own focus events,
  // so the hand-off below fires only when it was a row that a settled search
  // removed — not the search field or a footer action.
  const isRowFocusedRef = useRef(false);
  // The Clear all confirmation is in the DOM only from the Clear all press
  // until it closes — mounted open, as the sheet itself is mounted from the
  // trigger's press — so an open sheet with no confirmation pending carries
  // no closed dialog (`architecture:component-style-authoring` INV7). Dialog
  // has an entrance animation and no exit, so a close is its unmount; the
  // sheet then places focus itself, in the Effect below, once the modal is
  // gone and the sheet's content can take focus again: on the search field
  // after a confirmed clear — the clear is spent, and the search field is
  // where the next selection starts (FR24, `spec:AST-085` FR4) — and back on
  // Clear all after a cancel. A confirmed clear is announced there too — a
  // change the person hears about, as an add or a remove is
  // (`component:Tokenizer` AR6) — after the confirmation's dialog has gone,
  // so the sheet is the modal on top and the words are delivered inside it
  // (`spec:AST-086` FR14), not into a covered sheet. Every announcement the
  // sheet makes goes through `useAnnounce`, called inside the sheet's
  // dialog, so FR14 routes the words into it while the sheet is open.
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const clearAllRef = useRef<HTMLButtonElement>(null);
  const afterConfirmationRef = useRef<'search' | 'clear-all' | null>(null);
  const announce = useAnnounce();
  const closeClearConfirmation = (confirmed: boolean) => {
    afterConfirmationRef.current = confirmed ? 'search' : 'clear-all';
    setIsClearConfirmationOpen(false);
  };
  useEffect(() => {
    if (isClearConfirmationOpen || afterConfirmationRef.current == null) {
      return;
    }
    const destination = afterConfirmationRef.current;
    afterConfirmationRef.current = null;
    if (destination === 'search') {
      searchRef.current?.focus();
      announce(t('@astryx.tokenizer.allRemoved'));
    } else {
      clearAllRef.current?.focus();
    }
  }, [announce, isClearConfirmationOpen, t]);
  const selectedIds = useMemo(() => new Set(value.map(v => v.id)), [value]);

  // ---- sheet session ----
  // Starts from the field's copy, which `onChangeQuery` keeps current, so the
  // query survives the sheet's unmount between presentations (FR18).
  const [query, setQuery] = useState(initialQuery);
  const [sourceResults, setSourceResults] = useState<T[]>([]);
  const trimmedQueryForSearch = query.trim();
  // A query shorter than `minQueryLength` is never searched: no source rows,
  // no busy feedback, no empty state, no outcome announcement, as the inline
  // field shows nothing for such a query (`component:Tokenizer` FR20).
  const isBelowMinQuery =
    trimmedQueryForSearch !== '' &&
    trimmedQueryForSearch.length < minQueryLength;
  const results = isBelowMinQuery ? EMPTY_RESULTS : sourceResults;
  // Whether a query is one the source is asked about: empty (the bootstrap
  // set) or at least `minQueryLength`. Below that nothing is searched, so
  // nothing is pending and no outcome is owed. One rule for every way a query
  // comes to be: the initial one, an open, a change.
  const willSearchFor = (trimmed: string) =>
    trimmed === '' || trimmed.length >= minQueryLength;
  // Pending from open, and from each query change, until that search settles
  // (`component:Tokenizer` FR20). Set where the change happens rather than in
  // the Effect, so the debounce window never shows a stale empty state. The
  // sheet mounts already open (the field mounts it from the press), so its
  // first render is its open: the initial state is derived from the initial
  // query the way an open derives it — a kept query below the threshold
  // (after a close the field forced, FR18) starts settled, not pending for a
  // search that never runs.
  const [isPending, setIsPending] = useState(
    () => !isOpen || willSearchFor(initialQuery.trim()),
  );
  const emptyStateRef = useRef<HTMLDivElement>(null);
  // Each search that runs gets a number; its outcome is announced once, keyed
  // on that number, so a stale effect from an earlier commit cannot claim a
  // newer search's announcement and a rerender cannot repeat one. A first
  // render whose query is not searched owes no announcement for search 0.
  const [searchId, setSearchId] = useState(0);
  const searchIdRef = useRef(0);
  const announcedSearchIdRef = useRef(
    isOpen && !willSearchFor(initialQuery.trim()) ? 0 : -1,
  );
  const startSearch = () => {
    searchIdRef.current += 1;
    setSearchId(searchIdRef.current);
  };
  const [renderedItemCount, setRenderedItemCount] = useState(
    LIST_RENDER_BATCH_SIZE,
  );
  const seqRef = useRef(0);
  const lastLoadScrollHeightRef = useRef<number | null>(null);
  const [selectedItemsAtOpen, setSelectedItemsAtOpen] = useState<T[]>(value);

  // Snapshot the selection and reset the rendered window in the render that
  // opens the sheet, so the first open frame already shows selected-first
  // order — an effect would paint one frame of the previous session's order.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setSelectedItemsAtOpen(value);
      setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
      // An open lists the bootstrap set, or searches a query kept across a
      // close the field forced (FR18), and that load is pending; a kept
      // query below the threshold leaves nothing pending, since no search
      // runs for it.
      const willSearch = willSearchFor(trimmedQueryForSearch);
      setIsPending(willSearch);
      if (willSearch) {
        startSearch();
      } else {
        announcedSearchIdRef.current = searchIdRef.current;
      }
      lastLoadScrollHeightRef.current = null;
    }
  }

  // Done, swipe, scrim, and Escape alike clear the query, so the next open
  // lists the bootstrap set (FR18); a close the field forced (becoming
  // disabled while open) keeps it, since nothing the person did changed it.
  // Cleared and reported from the closing event through this handle, never
  // from render (`architecture:react-component-runtime` INV2).
  useImperativeHandle(
    clearQueryRef,
    () => () => {
      if (query !== '') {
        setQuery('');
        onChangeQuery?.('');
      }
    },
    [query, onChangeQuery],
  );

  // The source is read through a ref at request time, as the inline field
  // reads it inside its search callbacks: a caller that rebuilds the source
  // object in render (`searchSource={{search, bootstrap}}`) then causes no
  // new request on an unrelated render — a row toggle, a selection change —
  // and the sheet asks the source only on open, on a query change, and on
  // clearing. The ref is updated in a layout effect, before any request this
  // commit makes.
  const searchSourceRef = useRef(searchSource);
  useIsomorphicLayoutEffect(() => {
    searchSourceRef.current = searchSource;
  }, [searchSource]);
  // Synchronizes the row list with the caller's `searchSource`, an external
  // system this component does not own: it asks the source for the bootstrap
  // set or the query's results and copies the answer into state. The
  // bootstrap set is requested at once — on open and when the query clears —
  // as the inline field requests its focus bootstrap; only a typed query
  // waits `debounceMs`. A layout effect, so a source that answers
  // synchronously settles before the browser paints the open commit: the
  // Loading row never reaches the screen and no busy start is announced for
  // it (`component:Tokenizer` FR20). Cleanup clears the debounce timer so a
  // superseded query never fetches, and the sequence guard drops a response
  // that lands after a newer request, so the list never shows stale results
  // (`architecture:react-component-runtime` INV3).
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const trimmed = query.trim();
    const seq = ++seqRef.current;
    if (trimmed !== '' && trimmed.length < minQueryLength) {
      // Not searched; the derived `results` are already empty, and taking a
      // sequence number retires a still-running search so its rows cannot
      // land under this query.
      return;
    }
    const settle = (items: T[]) => {
      if (seqRef.current === seq) {
        setSourceResults(items.slice(0, maxMenuItems));
        setIsPending(false);
      }
    };
    const run = () => {
      let answer: T[] | PromiseLike<T[]>;
      const source = searchSourceRef.current;
      try {
        answer = trimmed === '' ? source.bootstrap() : source.search(query);
      } catch {
        answer = [];
      }
      if (Array.isArray(answer)) {
        // An instant source settles in the same tick, before any busy
        // feedback or announcement could start.
        settle(answer);
        return;
      }
      // Anything else is awaited as a thenable — a native Promise, one from
      // another realm, or a library's — as the inline field's `await` does.
      void Promise.resolve(answer).then(settle, () => {
        // A rejecting source settles to no results, as the inline field does:
        // the previous query's rows are not this query's answer.
        settle([]);
      });
    };
    if (trimmed !== '' && debounceMs > 0) {
      const timer = setTimeout(run, debounceMs);
      return () => clearTimeout(timer);
    }
    run();
  }, [isOpen, query, minQueryLength, maxMenuItems, debounceMs]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = (item: T) =>
      normalizedQuery === '' ||
      item.label.toLowerCase().includes(normalizedQuery);
    const selectedAtOpenMatches = selectedItemsAtOpen.filter(matchesQuery);
    const selectedAtOpenIds = new Set(
      selectedAtOpenMatches.map(item => item.id),
    );
    const resultIds = new Set(results.map(item => item.id));
    const selectedItemsMissingFromResults = value.filter(
      item =>
        !selectedAtOpenIds.has(item.id) &&
        !resultIds.has(item.id) &&
        matchesQuery(item),
    );

    // Selection changes update checkbox state without moving an existing row.
    // The next open snapshots the latest value and applies selected-first order.
    return [
      ...selectedAtOpenMatches,
      ...selectedItemsMissingFromResults,
      ...results.filter(item => !selectedAtOpenIds.has(item.id)),
    ];
  }, [query, results, selectedItemsAtOpen, value]);

  const renderedItems = visibleItems.slice(0, renderedItemCount);

  // A settled search may remove the row that holds focus: it was listed from
  // the previous search and is not in this one. Focus would fall to the page
  // body behind the modal; the search field takes it instead, where the next
  // query starts (FR20, `spec:AST-085` FR4).
  useEffect(() => {
    if (!isOpen || isPending || !isRowFocusedRef.current) {
      return;
    }
    const active = document.activeElement;
    if (active == null || active === document.body) {
      isRowFocusedRef.current = false;
      searchRef.current?.focus();
    }
  }, [isOpen, isPending, renderedItems]);

  // `action` is declared on `SearchableItem` for the grid-adopting hosts; the
  // sheet rows have not adopted it, so a row renders the item without the
  // control and says so (`spec:AST-058` FR9), as the inline panel does.
  useEffect(() => {
    if (results.some(item => item.action != null)) {
      warnOnce(
        'tokenizer-sheet:item-action',
        'Tokenizer',
        'A result carries `action`, which the bottom-sheet rows do not render ' +
          'yet; the item is shown without it.',
      );
    }
  }, [results]);

  // The pending Spinner below stays named, as the inline field's does
  // (`family:input-fields` FR7), but is not a live region; the sheet announces
  // each busy start once, through the region inside its own modal dialog
  // (`spec:AST-086` FR8, FR14).
  useBusyAnnouncement(
    isOpen && isPending,
    t('@astryx.typeahead.loading'),
    listRef,
  );

  const trimmedQuery = query.trim();
  const createItem = useMemo<T | null>(() => {
    // Judged against this query's own results: while the search is pending
    // `results` still hold the previous query's rows, and a create row then
    // could offer a value the source already has.
    if (!hasCreate || trimmedQuery === '' || isAtMax || isPending) {
      return null;
    }
    const lowered = trimmedQuery.toLowerCase();
    if (
      selectedIds.has(trimmedQuery) ||
      value.some(item => item.label.toLowerCase() === lowered) ||
      results.some(item => item.label.toLowerCase() === lowered)
    ) {
      return null;
    }
    return {
      id: `${CREATABLE_ID_PREFIX}${trimmedQuery}`,
      label: t('@astryx.tokenizer.create', {value: trimmedQuery}),
    } as unknown as T;
  }, [
    hasCreate,
    trimmedQuery,
    isAtMax,
    isPending,
    selectedIds,
    value,
    results,
    t,
  ]);

  const resetListWindow = () => {
    lastLoadScrollHeightRef.current = null;
    setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
  };

  const handleQueryChange = (next: string) => {
    resetListWindow();
    const willSearch = willSearchFor(next.trim());
    // A search still unsettled from the previous query is retired
    // unannounced, so "0 results" is never said for a query that was never
    // searched. Only a query that runs gets a search number.
    setIsPending(willSearch);
    if (willSearch) {
      startSearch();
    } else {
      announcedSearchIdRef.current = searchIdRef.current;
    }
    setQuery(next);
    onChangeQuery?.(next);
  };

  const searchLabel = t('@astryx.tokenizer.search', {label});
  // An empty state only once the search has settled; while pending the busy
  // row above stands in for it.
  const isQueryEmpty = trimmedQuery === '';
  // An empty state is a searched query's answer. An empty query that lists
  // nothing — nothing selected and a source whose bootstrap set is empty,
  // such as a search-only source — shows only the search field, no list, no
  // message, and announces nothing, as the inline field opens no menu and
  // reports nothing for a bootstrap that returned nothing (`component:Tokenizer`
  // FR20): nothing has failed, typing is what finds items.
  const isSettledEmpty =
    !isPending &&
    !isBelowMinQuery &&
    !isQueryEmpty &&
    visibleItems.length === 0 &&
    createItem == null;
  const isSettledBlank =
    !isPending &&
    !isBelowMinQuery &&
    isQueryEmpty &&
    visibleItems.length === 0 &&
    createItem == null;
  const noResultsTitle =
    typeof emptySearchText === 'string'
      ? emptySearchText
      : t('@astryx.typeahead.emptySearchResults');

  // How each search ended, once per settle (`component:Tokenizer` AR6),
  // keyed on the search's number. The result count is an action announcement
  // this owner makes. The empty state's words are rendered content: the
  // default EmptyState announces its own title and description once when it
  // appears (its own contract, `spec:AST-086` FR2, FR11), so the sheet speaks
  // nothing for it; a caller's `emptySearchText` element is the sheet's own
  // rendered content, so the shared own-content module reads and speaks it
  // (`spec:AST-056` FR3, `architecture:react-component-runtime` INV10). Both
  // go through `useAnnounce`, which, called from inside the sheet's dialog,
  // routes into it while the sheet is open (`spec:AST-086` FR14).
  const hasCustomEmptyElement =
    typeof emptySearchText !== 'string' && emptySearchText != null;
  useAnnounceRenderedText(
    emptyStateRef,
    isOpen && isSettledEmpty && hasCustomEmptyElement,
    String(searchId),
  );
  useEffect(() => {
    if (!isOpen || isPending || announcedSearchIdRef.current === searchId) {
      return;
    }
    announcedSearchIdRef.current = searchId;
    if (!isSettledEmpty && !isQueryEmpty) {
      // The rows the sheet lists for this query — the source's results,
      // capped by `maxMenuItems`, selected items the source did not return,
      // such as a created value, and the create row when it is offered — as
      // the inline field announces the entries it shows (its create entry
      // included), not the source's count.
      announce(
        t('@astryx.typeahead.resultCount', {
          count: visibleItems.length + (createItem == null ? 0 : 1),
        }),
      );
    }
  }, [
    announce,
    createItem,
    isOpen,
    isPending,
    isQueryEmpty,
    isSettledEmpty,
    visibleItems.length,
    searchId,
    t,
  ]);

  return (
    <div {...stylex.props(styles.body)}>
      <div {...stylex.props(styles.searchRow)}>
        <PanelSearchInput
          ref={searchRef}
          label={searchLabel}
          clearLabel={t('@astryx.textInput.clearLabel', {label: searchLabel})}
          placeholder={t('@astryx.tokenizer.searchPlaceholder')}
          value={query}
          onValueChange={handleQueryChange}
          fieldXstyle={styles.searchField}
        />
      </div>
      {/* The sheet's own content area is already a group named by the
            label; naming this list the same would announce it twice. */}
      <div
        ref={listRef}
        {...stylex.props(styles.list)}
        aria-busy={isPending || undefined}
        data-rendered-count={renderedItems.length}
        data-total-count={visibleItems.length}
        onFocusCapture={event => {
          isRowFocusedRef.current =
            event.target instanceof HTMLElement &&
            event.target.getAttribute('role') === 'checkbox';
        }}
        onBlurCapture={event => {
          // A row unmounted while focused fires no blur, so a blur that
          // does arrive is a real move elsewhere.
          if (event.relatedTarget != null) {
            isRowFocusedRef.current = false;
          }
        }}
        onScroll={event => {
          const list = event.currentTarget;
          const distanceFromBottom =
            list.scrollHeight - list.scrollTop - list.clientHeight;
          if (
            distanceFromBottom <= LIST_LOAD_MORE_THRESHOLD_PX &&
            lastLoadScrollHeightRef.current !== list.scrollHeight
          ) {
            lastLoadScrollHeightRef.current = list.scrollHeight;
            setRenderedItemCount(current =>
              Math.min(current + LIST_RENDER_BATCH_SIZE, visibleItems.length),
            );
          }
        }}>
        {createItem ? (
          <div {...stylex.props(styles.createRow)}>
            <Text type="body" xstyle={styles.createLabel}>
              {createItem.label}
            </Text>
            <Button
              label={t('@astryx.tokenizer.add')}
              aria-label={t('@astryx.tokenizer.addValue', {
                value: trimmedQuery,
              })}
              variant="secondary"
              size="lg"
              onClick={() => {
                if (onAdd(createItem, {silent: true})) {
                  // The created value, as the inline field announces it; the
                  // item's label is the row's caption ("Create …").
                  announce(
                    t('@astryx.tokenizer.tokenAdded', {label: trimmedQuery}),
                  );
                }
                // The same path a typed change takes, so the bootstrap
                // reload shows its pending state and reports the change.
                handleQueryChange('');
                // The row this control sits on is gone with the query; the
                // search field is where the next value starts (FR22).
                searchRef.current?.focus();
              }}
            />
          </div>
        ) : null}
        {isPending ? (
          // Named busy feedback while the source works
          // (`family:input-fields` FR7), above any rows still listed from
          // the previous search; the empty states wait for it.
          <div {...stylex.props(styles.pending)}>
            <Spinner
              size="md"
              role="img"
              aria-label={t('@astryx.typeahead.loading')}
            />
          </div>
        ) : null}
        {isSettledEmpty ? (
          <div ref={emptyStateRef} {...stylex.props(styles.emptyHost)}>
            {hasCustomEmptyElement ? (
              <div {...stylex.props(styles.empty)}>{emptySearchText}</div>
            ) : (
              <EmptyState
                icon={<Icon icon="search" size="lg" color="secondary" />}
                title={noResultsTitle}
                description={t('@astryx.tokenizer.noResultsDescription')}
                isCompact
                xstyle={styles.empty}
              />
            )}
          </div>
        ) : isSettledBlank ? null : (
          // A list of items: each listitem carries its place in the whole
          // set, not the rendered window, so a person moving through the
          // rows hears "n of total" and learns more exist before the list
          // has scrolled (FR21). The position attributes live on the
          // listitem because `checkbox` does not admit them.
          <div role="list" {...stylex.props(styles.rows)}>
            {renderedItems.map((item, index) => {
              const isSelected = selectedIds.has(item.id);
              const rowDisabled = !isSelected && isAtMax;
              const isLastRendered = index === renderedItems.length - 1;
              return (
                <div
                  key={item.id}
                  role="listitem"
                  aria-setsize={visibleItems.length}
                  aria-posinset={index + 1}
                  {...stylex.props(styles.rowItem)}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={item.label}
                    aria-disabled={rowDisabled || undefined}
                    onFocus={
                      isLastRendered &&
                      renderedItems.length < visibleItems.length
                        ? () => {
                            // Focus reaching the last rendered row renders the
                            // next batch, so Tab and arrow keys reach every row
                            // without a scroll (FR21).
                            setRenderedItemCount(current =>
                              Math.min(
                                current + LIST_RENDER_BATCH_SIZE,
                                visibleItems.length,
                              ),
                            );
                          }
                        : undefined
                    }
                    onClick={() => {
                      if (rowDisabled) {
                        return;
                      }
                      if (isSelected) {
                        if (onRemove(item, {silent: true})) {
                          announce(
                            t('@astryx.tokenizer.tokenRemoved', {
                              label: item.label,
                            }),
                          );
                        }
                      } else if (onAdd(item, {silent: true})) {
                        announce(
                          t('@astryx.tokenizer.tokenAdded', {
                            label: item.label,
                          }),
                        );
                      }
                    }}
                    {...stylex.props(
                      styles.row,
                      rowDisabled && styles.rowDisabled,
                    )}>
                    <Text
                      type="body"
                      color={rowDisabled ? 'inherit' : undefined}
                      xstyle={styles.rowLabel}>
                      {item.label}
                    </Text>
                    <CheckboxIndicator
                      state={isSelected ? 'checked' : 'unchecked'}
                      size="md"
                      isDisabled={rowDisabled}
                      xstyle={
                        rowDisabled ? styles.indicatorDisabled : undefined
                      }
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isQueryEmpty && (
        <div {...stylex.props(styles.footer)}>
          <Button
            label={t('@astryx.tokenizer.clearAll')}
            variant="secondary"
            size="lg"
            isDisabled={value.length === 0}
            // With a tooltip, Button's disabled mode is `aria-disabled`: the
            // action keeps its focus order and says why it does nothing
            // (`spec:AST-085` FR1), instead of leaving the tab order as a
            // natively disabled button does — a confirmed Clear all returns
            // focus here before the search field takes it (FR24).
            tooltip={
              value.length === 0
                ? t('@astryx.tokenizer.nothingToClear')
                : undefined
            }
            ref={clearAllRef}
            onClick={() => setIsClearConfirmationOpen(true)}
            xstyle={styles.footerAction}
          />
          <Button
            label={t('@astryx.tokenizer.done')}
            variant="primary"
            size="lg"
            onClick={onRequestClose}
            xstyle={styles.footerAction}
          />
        </div>
      )}
      {isClearConfirmationOpen && (
        <AlertDialog
          isOpen
          onOpenChange={next => {
            if (!next) {
              closeClearConfirmation(false);
            }
          }}
          title={t('@astryx.tokenizer.clearAllTitle')}
          description={t('@astryx.tokenizer.clearAllDescription', {label})}
          actionLabel={t('@astryx.tokenizer.clearSelection')}
          onAction={() => {
            onClearAll();
            closeClearConfirmation(true);
          }}
        />
      )}
    </div>
  );
}

TokenizerSheetContent.displayName = 'TokenizerSheetContent';
