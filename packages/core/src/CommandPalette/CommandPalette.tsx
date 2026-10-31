// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file CommandPalette.tsx
 * @input Uses React, Dialog, Layout, CommandPaletteContext, SearchSource,
 *   useCombobox, useAnnounce, useAnnounceRenderedText
 * @output Exports CommandPalette root component and props
 * @position Core root component; dialog shell with searchSource-driven items
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /apps/storybook/stories/CommandPalette.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/CommandPalette/ (showcase blocks)
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import {Dialog} from '../Dialog';
import {Layout, LayoutHeader, LayoutContent, LayoutFooter} from '../Layout';
import type {SearchSource, SearchableItem} from '../Typeahead';
import {useCombobox} from '../Selector';
import type {SelectorOptionData} from '../Selector';
import {CommandPaletteContext} from './CommandPaletteContext';
import {BusyStartSettleContext} from './busyStartSettle';
import {CommandPaletteList} from './CommandPaletteList';
import {CommandPaletteItem} from './CommandPaletteItem';
import {CommandPaletteGroup} from './CommandPaletteGroup';
import {CommandPaletteInput} from './CommandPaletteInput';
import {CommandPaletteFooter} from './CommandPaletteFooter';
import {CommandPaletteEmpty} from './CommandPaletteEmpty';
import type {BaseProps} from '../BaseProps';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useTranslator} from '../i18n';

export interface CommandPaletteProps<
  T extends SearchableItem = SearchableItem,
> extends Omit<BaseProps<HTMLDialogElement>, 'onChange'> {
  ref?: React.Ref<HTMLDialogElement>;
  /** Whether the command palette is open. */
  isOpen: boolean;

  /**
   * Renders command palette content inline without modal behavior.
   * Suppresses input auto-focus and initial highlighted-item auto-scroll.
   * For documentation previews and showcases only.
   * @default false
   */
  isInline?: boolean;

  /** Called when the command palette visibility changes. */
  onOpenChange: (isOpen: boolean) => void;

  /**
   * Search source providing items. Implements `search(query)` and `bootstrap()`.
   * Same interface as Typeahead's searchSource.
   * Use `createStaticSource` for simple static lists.
   */
  searchSource: SearchSource<T>;

  /**
   * The search input slot.
   * @default <CommandPaletteInput />
   */
  input?: ReactNode;

  /**
   * The footer slot.
   * @default <CommandPaletteFooter />
   */
  footer?: ReactNode;

  /**
   * Per-item render function. Receives the item and whether it is currently selected.
   * Return non-interactive presentation content; buttons and links cannot be
   * nested inside the rendered option. Auto-grouping by `auxiliaryData.group`
   * is preserved.
   * When omitted, renders each item's `label` text.
   */
  renderItem?: (item: T, isSelected: boolean) => ReactNode;

  /**
   * Content shown when a search query returns no results.
   * @default 'No results'
   */
  emptySearchText?: ReactNode;

  /**
   * Content shown when there is no search query and bootstrap() returns nothing.
   * @default 'Type to search'
   */
  emptyBootstrapText?: ReactNode;

  /** Controlled selected value (for picker mode). */
  value?: string;

  /** Called when the selected value changes. */
  onValueChange?: (value: string) => void;

  /**
   * Accessible label for the command palette dialog.
   * @default 'Command palette'
   */
  label?: string;

  /**
   * Width of the command palette dialog.
   * @default 640
   */
  width?: number | string;

  /**
   * Maximum height of the command palette dialog.
   * @default 480
   */
  maxHeight?: number | string;
}

function getGroup(item: SearchableItem): string | undefined {
  const aux = item.auxiliaryData as Record<string, unknown> | undefined;
  return typeof aux?.group === 'string' ? aux.group : undefined;
}

/**
 * Build a flat list of selectable items in DOM order from search results.
 * When groups are present, items are ordered by group (preserving insertion order),
 * with ungrouped items at the end — matching the DefaultRenderer layout.
 */
function buildSelectableItems(items: SearchableItem[]): SelectorOptionData[] {
  const hasGroups = items.some(item => getGroup(item) != null);

  if (!hasGroups) {
    return items.map(item => ({
      value: item.id,
      label: item.label,
    }));
  }

  // Group items preserving insertion order of groups
  const groupOrder: string[] = [];
  const groups = new Map<string, SearchableItem[]>();
  const ungrouped: SearchableItem[] = [];

  for (const item of items) {
    const group = getGroup(item);
    if (group != null) {
      if (!groups.has(group)) {
        groupOrder.push(group);
        groups.set(group, []);
      }
      groups.get(group)?.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  const result: SelectorOptionData[] = [];
  for (const heading of groupOrder) {
    for (const item of groups.get(heading) ?? []) {
      result.push({value: item.id, label: item.label});
    }
  }
  for (const item of ungrouped) {
    result.push({value: item.id, label: item.label});
  }
  return result;
}

/**
 * O(1) value → index lookup over selectable items, used by the delegated
 * mouseover handler (#6077). The index is built once per results change;
 * each hover then pays a Map probe instead of a linear findIndex scan,
 * so cost no longer scales with list size. Keeps the first occurrence of
 * duplicate values to match the previous findIndex behavior.
 */
function createValueLookup<T extends {value: string}>(
  items: ReadonlyArray<T>,
): (value: string) => number | undefined {
  const indexByValue = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const value = items[i].value;
    if (!indexByValue.has(value)) {
      indexByValue.set(value, i);
    }
  }
  return value => indexByValue.get(value);
}

interface RendererProps<T extends SearchableItem> {
  items: T[];
  value: string;
  renderItem?: (item: T, isSelected: boolean) => ReactNode;
}

/**
 * Renders items with optional per-item customization.
 * Auto-groups by auxiliaryData.group when present.
 * Passes `isSelected` so renderItem can handle picker-mode visuals.
 */
function ItemRenderer<T extends SearchableItem>({
  items,
  value,
  renderItem,
}: RendererProps<T>) {
  const renderOne = (item: T) => (
    <CommandPaletteItem key={item.id} value={item.id}>
      {renderItem ? renderItem(item, item.id === value) : item.label}
    </CommandPaletteItem>
  );

  const hasGroups = items.some(item => getGroup(item) != null);

  if (!hasGroups) {
    return <>{items.map(renderOne)}</>;
  }

  const groupOrder: string[] = [];
  const groups = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const item of items) {
    const group = getGroup(item);
    if (group != null) {
      if (!groups.has(group)) {
        groupOrder.push(group);
        groups.set(group, []);
      }
      groups.get(group)?.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  return (
    <>
      {groupOrder.map(heading => (
        <CommandPaletteGroup key={heading} heading={heading}>
          {(groups.get(heading) ?? []).map(renderOne)}
        </CommandPaletteGroup>
      ))}
      {ungrouped.map(renderOne)}
    </>
  );
}

/**
 * Command palette root component.
 *
 * Uses `searchSource` for all search logic — same interface as Typeahead.
 * For static lists, use `createStaticSource` from `@astryxdesign/core/Typeahead`.
 *
 * Keyboard navigation is handled by `useCombobox` from Selector for arrows,
 * PageUp/PageDown, and Enter. Home/End remain native caret keys. Modal Escape
 * dismissal delegates to Dialog's shared layer stack so nested surfaces handle
 * the first press.
 *
 * Input and footer are rendered by default — only pass them to replace the defaults.
 *
 * @compositionHint
 *   - `input` slot: CommandPaletteInput (default)
 *   - `footer` slot: CommandPaletteFooter (default)
 *   - `renderItem(item, isSelected)`: custom per-item content (grouping preserved)
 *
 * @example
 * ```
 * <CommandPalette
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   searchSource={createStaticSource(commands)}
 * />
 * ```
 */
export function CommandPalette<T extends SearchableItem = SearchableItem>({
  ref,
  isOpen,
  isInline,
  onOpenChange,
  searchSource,
  input,
  footer,
  renderItem,
  emptySearchText: emptySearchTextFromProps,
  emptyBootstrapText: emptyBootstrapTextFromProps,
  value: controlledValue,
  onValueChange,
  label: labelFromProps,
  width = 640,
  maxHeight = 480,
  ...rest
}: CommandPaletteProps<T>) {
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.commandPalette.label');
  const emptySearchText =
    emptySearchTextFromProps ?? t('@astryx.commandPalette.emptySearch');
  const emptyBootstrapText =
    emptyBootstrapTextFromProps ?? t('@astryx.commandPalette.emptyBootstrap');
  const listId = useId();
  // search: the committed query — only advances when async results arrive.
  // optimisticSearch: updates immediately on keystroke, drives input + empty state.
  // This way optimisticSearch is always what the user sees, and search is what
  // the current results actually correspond to.
  const [search, setSearch] = useState('');
  const [internalValue, setInternalValue] = useState('');
  const [searchResults, setSearchResults] = useState<T[]>([]);
  const [isPending, startTransition] = useTransition();
  const [optimisticSearch, setOptimisticSearch] = useOptimistic(search);
  const [optimisticResults, setOptimisticResults] =
    useOptimistic(searchResults);
  const isBusy = isPending;
  const searchVersionRef = useRef(0);
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const settleBusyAnnouncementRef = useRef<(() => void) | null>(null);
  const registerBusyAnnouncementSettle = useCallback(
    (settle: (() => void) | null) => {
      settleBusyAnnouncementRef.current = settle;
    },
    [],
  );

  // Announce search results to screen readers through the shared polite live
  // region (comboboxes-7 announce path, mirroring Selector / BaseTypeahead).
  // The empty states are otherwise purely visual, so a screen-reader user
  // typing a query would hear nothing when results disappear. The busy start
  // is announced by CommandPaletteInput.
  const announce = useAnnounce();

  const value = controlledValue ?? internalValue;

  const setValue = useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [controlledValue, onValueChange],
  );

  // Build flat selectable items in DOM order from search results.
  // Must match the render order of ItemRenderer.
  const selectableItems = useMemo(
    () => buildSelectableItems(optimisticResults),
    [optimisticResults],
  );

  const valueLookup = useMemo(
    () => createValueLookup(selectableItems),
    [selectableItems],
  );

  const handleClose = useCallback(() => {
    // Invalidate any in-flight search. Most sources don't implement cancel(),
    // and a response that resolves after close would still pass runSearch's
    // version check and re-commit the stale query/results into the closed
    // palette (visible as a ghost query on reopen while bootstrap is pending).
    searchVersionRef.current++;
    // Reset both committed and optimistic search on close
    setSearch('');
    setSearchResults([]);
    if (controlledValue === undefined) {
      setInternalValue('');
    }
    searchSource.cancel?.();
    // Clear any lingering result / loading announcement when the palette
    // closes so stale status text does not linger in the a11y tree
    // (matching Selector's onHide).
    announce('');
    onOpenChange(false);
  }, [onOpenChange, searchSource, controlledValue, announce]);

  const selectItem = useCallback(
    (itemValue: string) => {
      setValue(itemValue);
    },
    [setValue],
  );

  // useCombobox handles all keyboard navigation and highlight state.
  // We treat the palette as always "open" from the combobox's perspective
  // (since the dialog itself handles open/close), and use onClose as a no-op
  // for the combobox — the palette's own close is handled by handleClose.
  const combobox = useCombobox({
    selectableItems,
    value,
    isOpen: true, // Always "open" from combobox POV — the dialog handles visibility
    onOpen: () => {}, // Dialog handles open
    onClose: () => {}, // We handle close via handleClose
    onSelect: (itemValue: string) => {
      selectItem(itemValue);
      handleClose();
    },
    listboxId: listId,
  });

  // Run a search for the given query and commit results.
  // Called directly when the user types — no effect needed.
  const runSearch = useCallback(
    (query: string) => {
      searchSource.cancel?.();
      const version = ++searchVersionRef.current;
      // A highlight belongs to the query that created it. Clear it before any
      // optimistic narrowing so aria-activedescendant never shifts to a
      // different command at the same index while the next result set loads.
      combobox.setHighlightedIndex(-1);

      startTransition(async () => {
        const isBootstrap = query === '';

        // The busy start ("Loading") is announced by CommandPaletteInput,
        // from a region inside the palette's dialog (spec:AST-086 FR8, FR3).

        // Client-filter previous results for instant narrowing while fetch is in flight
        if (!isBootstrap && searchResults.length > 0) {
          const lower = query.toLowerCase().trim();
          setOptimisticResults(
            searchResults.filter(item =>
              item.label.toLowerCase().includes(lower),
            ),
          );
        }

        const result = isBootstrap
          ? searchSource.bootstrap()
          : searchSource.search(query);

        const items = await Promise.resolve(result);

        if (searchVersionRef.current === version) {
          if (!isBootstrap) {
            // This query's outcome is announced below (a count) or from the
            // rendered empty state; a busy start not yet announced would
            // follow it, so the input drops it (spec:AST-086 FR8).
            settleBusyAnnouncementRef.current?.();
          }
          // Commit query and results together
          setSearch(query);
          setOptimisticResults(items);
          setSearchResults(items);

          // Announce the outcome from the search commit (not a reactive
          // effect), matching Selector / BaseTypeahead: exactly one
          // announcement per committed non-empty query. Empty results are
          // announced from their rendered content below so a caller-supplied
          // ReactNode reaches assistive technology as written.
          if (isBootstrap) {
            announce('');
          } else if (items.length > 0) {
            announce(
              t('@astryx.commandPalette.resultCount', {count: items.length}),
            );
          }

          // When opening with a preselected value, highlight it once
          // bootstrap results arrive. No value → highlight stays at -1
          // and ArrowDown naturally moves to the first item. Inline previews
          // take the hover-aware path so the initial highlight does not
          // scrollIntoView the surrounding page (#6077).
          if (isBootstrap && value != null && value !== '') {
            const selectedIdx = items.findIndex(item => item.id === value);
            if (selectedIdx >= 0) {
              if (isInline) {
                // `items` is the fresh bootstrap result; the closure's
                // selectableItems may still be empty at commit time.
                const selectedItem = items[selectedIdx];
                if (selectedItem) {
                  combobox.onItemMouseEnter(
                    {value: selectedItem.id},
                    selectedIdx,
                  );
                }
              } else {
                combobox.setHighlightedIndex(selectedIdx);
              }
            }
          }
        }
      });
    },
    [
      searchSource,
      searchResults,
      startTransition,
      value,
      isInline,
      combobox,
      setOptimisticResults,
      announce,
      t,
    ],
  );

  // Bootstrap on open. We use a ref to avoid re-triggering when
  // runSearch's identity changes (it depends on searchResults).
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;

  useEffect(() => {
    if (isOpen) {
      runSearchRef.current('');
    }
  }, [isOpen]);

  // Wrap combobox's onKeyDown to preserve inline-preview Escape handling and
  // select + close on Enter. Modal Escape stays unclaimed here so Dialog's
  // shared dismissal stack can route it to the topmost surface.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Modal CommandPalette delegates Escape to Dialog's shared dismissal
        // stack so a nested layer handles the first press. Inline previews do
        // not join that stack, so preserve their local close behavior.
        if (isInline) {
          e.preventDefault();
          handleClose();
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (
          combobox.highlightedIndex >= 0 &&
          combobox.highlightedIndex < selectableItems.length
        ) {
          const item = selectableItems[combobox.highlightedIndex];
          if (item && !item.disabled) {
            selectItem(item.value);
            handleClose();
          }
        }
        return;
      }
      // Home and End remain native caret-movement keys for this editable
      // combobox. PageUp/PageDown provide first/last result navigation.
      if (e.key === 'Home' || e.key === 'End') {
        return;
      }
      // Space should type in the input, not trigger selection
      if (e.key === ' ') {
        return;
      }
      combobox.onKeyDown(e);
    },
    [combobox, handleClose, isInline, selectableItems, selectItem],
  );

  // Hover highlight is owned here by a single delegated handler on the list
  // container: it routes to useCombobox's hover-aware path, which moves the
  // highlight without scrolling (#6077) — a stationary pointer cannot
  // re-highlight and auto-scroll in a runaway loop. Keeping it off the public
  // context preserves CommandPaletteContextValue's setHighlightedIndex shape;
  // disabled items are skipped via aria-disabled (selectableItems carries no
  // disabled info). Use mouseover so moves between options bubble to the list;
  // mouseenter only runs when the pointer enters the list from outside.
  const handleListMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const option = (e.target as HTMLElement).closest?.('[role="option"]');
      if (!option || option.getAttribute('aria-disabled') === 'true') {
        return;
      }
      const itemValue = option.getAttribute('data-value');
      if (itemValue == null) {
        return;
      }
      const index = valueLookup(itemValue);
      if (index !== undefined) {
        combobox.onItemMouseEnter(selectableItems[index], index);
      }
    },
    [combobox, selectableItems, valueLookup],
  );

  const contextValue = useMemo(
    () => ({
      // Input uses optimisticSearch — reflects keystrokes immediately.
      // setSearch calls setOptimisticSearch inside a transition for instant
      // feedback then triggers the async search directly (no effect indirection).
      search: optimisticSearch,
      setSearch: (query: string) => {
        startTransition(() => {
          setOptimisticSearch(query);
        });
        runSearch(query);
      },
      value,
      setValue,
      listId,
      highlightedIndex: combobox.highlightedIndex,
      setHighlightedIndex: combobox.setHighlightedIndex,
      getItemId: combobox.getItemId,
      selectableItems,
      searchResults: optimisticResults,
      selectItem,
      onKeyDown: handleKeyDown,
      onClose: handleClose,
      isOpen,
      isBusy,
    }),
    [
      optimisticSearch,
      setOptimisticSearch,
      runSearch,
      value,
      setValue,
      listId,
      combobox.highlightedIndex,
      combobox.setHighlightedIndex,
      combobox.getItemId,
      selectableItems,
      optimisticResults,
      selectItem,
      handleKeyDown,
      handleClose,
      isOpen,
      isBusy,
    ],
  );

  // `search` is the committed query the on-screen results correspond to (it
  // still holds the previous query while a transition is pending). Keeping both
  // flags ungated by `isPending` makes them exhaustive over the empty case, so
  // the empty state is never unmounted and re-added mid-search (which flashed).
  const showEmptyBootstrap = search === '' && optimisticResults.length === 0;
  const showEmptySearch = search !== '' && optimisticResults.length === 0;
  // Announce only once the search settles: while it is pending, optimistic
  // narrowing can empty the list before the source answers, which would
  // speak "No results" early or wrongly.
  useAnnounceRenderedText(emptyStateRef, showEmptySearch && !isPending, search);

  let listContent: ReactNode;
  if (showEmptyBootstrap) {
    listContent = (
      <CommandPaletteEmpty ref={emptyStateRef}>
        {emptyBootstrapText}
      </CommandPaletteEmpty>
    );
  } else if (showEmptySearch) {
    listContent = (
      <CommandPaletteEmpty ref={emptyStateRef}>
        {emptySearchText}
      </CommandPaletteEmpty>
    );
  } else {
    listContent = (
      <ItemRenderer
        items={optimisticResults}
        value={value}
        renderItem={renderItem}
      />
    );
  }

  return (
    <Dialog
      ref={ref}
      isOpen={isOpen}
      isInline={isInline}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
      width={width}
      maxHeight={maxHeight}
      purpose="info"
      aria-label={label}
      {...rest}>
      <CommandPaletteContext value={contextValue}>
        <Layout
          defaultHasDividers
          header={
            <LayoutHeader hasDivider padding={0}>
              <BusyStartSettleContext value={registerBusyAnnouncementSettle}>
                {input ?? <CommandPaletteInput />}
              </BusyStartSettleContext>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={0}>
              <CommandPaletteList onMouseOver={handleListMouseOver}>
                {listContent}
              </CommandPaletteList>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider padding={0}>
              {footer ?? <CommandPaletteFooter />}
            </LayoutFooter>
          }
        />
      </CommandPaletteContext>
    </Dialog>
  );
}

CommandPalette.displayName = 'CommandPalette';
