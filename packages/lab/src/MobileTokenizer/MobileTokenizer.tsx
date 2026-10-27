// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileTokenizer.tsx
 * @input Uses public @astryxdesign/core components only (AlertDialog,
 *   BottomSheet, Button, CheckboxIndicator, EmptyState,
 *   Field, Icon, Text, TextInput, Token)
 * @output Exports MobileTokenizer — Lab prototype of the touch Tokenizer
 *   flow with a single searchable sheet, stable in-session checkbox ordering,
 *   and progressive long-list rendering
 * @position Lab (canary) stack layer 1: validates the design before the
 *   Core promotion (Tokenizer presentation="bottom-sheet").
 *
 * API mirrors Core Tokenizer (label/isLabelHidden/searchSource/value/onChange/
 * change, renderItem, hasCreate, maxEntries) so graduation is an import swap. Differences from
 * Core are the Lab deltas: the filter is a bordered TextInput (Core's
 * PanelSearchInput is not exported), strings are literals (no i18n keys),
 * and there is no theming/spec contract yet.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Field} from '@astryxdesign/core/Field';
import {Icon} from '@astryxdesign/core/Icon';
import {CheckboxIndicator} from '@astryxdesign/core/Indicator';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {
  colorVars,
  radiusVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

export type MobileTokenizerChange<T extends SearchableItem> =
  | {item: T; type: 'add'}
  | {item: T; type: 'create'}
  | {item: T; type: 'remove'}
  | {type: 'reorder'};

export interface MobileTokenizerProps<T extends SearchableItem> extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  label: string;
  /**
   * Hide the visible field label; the trigger and the sheet keep `label` as
   * their accessible name. Mirrors Core Tokenizer.
   */
  isLabelHidden?: boolean;
  searchSource: SearchSource<T>;
  value: T[];
  onChange: (items: T[], change: MobileTokenizerChange<T>) => void;
  /**
   * Render function for a result row's content, shown beside the row's
   * checkbox. Default: the item's label. Mirrors Core Tokenizer.
   */
  renderItem?: (item: T) => ReactNode;
  placeholder?: string;
  description?: string;
  isOptional?: boolean;
  isDisabled?: boolean;
  hasCreate?: boolean;
  maxEntries?: number;
  maxMenuItems?: number;
  minQueryLength?: number;
  debounceMs?: number;
  emptySearchResultsText?: string;
  onChangeQuery?: (query: string) => void;
}

const CREATABLE_ID_PREFIX = '__xds_create__';
const LIST_RENDER_BATCH_SIZE = 50;
const LIST_LOAD_MORE_THRESHOLD_PX = 200;

function ListBulletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M8.5 6h11M8.5 12h11M8.5 18h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

const styles = stylex.create({
  trigger: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // An aria-disabled button gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there. Defaults repeat the
  // base values, since StyleX merges per property.
  triggerDisabled: {
    borderColor: {
      default: colorVars['--color-border'],
      '@media (forced-colors: active)': 'GrayText',
    },
    color: {
      default: null,
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  triggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
  triggerPlaceholderDisabled: {
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  sheetBody: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    paddingInline: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  // The manage sheet intentionally has no dedicated close button; the sheet
  // keeps its standard gesture, scrim, and Escape dismissal paths.
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    overflowY: 'auto',
    minHeight: 0,
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
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // A Token authors its own color, which forced colors replace with
  // CanvasText; GrayText marks the tokens of a disabled trigger as disabled.
  // The default repeats Token's own default color.
  tokenDisabled: {
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  // Same for the indicator's border: GrayText in forced colors, and the
  // default repeats the indicator's disabled border.
  indicatorDisabled: {
    borderColor: {
      default: colorVars['--color-border'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
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
  filterRow: {
    display: 'flex',
    alignItems: 'flex-end',
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  // TextInput renders Field (block, shrink-to-fit); xstyle lands on that
  // root, so it must fill the available search row width.
  filterInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: sizeVars['--size-element-lg'],
    minHeight: sizeVars['--size-element-lg'],
  },
  empty: {
    flexGrow: 1,
  },
});

export function MobileTokenizer<T extends SearchableItem>({
  label,
  isLabelHidden,
  searchSource,
  value,
  onChange,
  renderItem,
  placeholder,
  description,
  isOptional,
  isDisabled = false,
  hasCreate = false,
  maxEntries,
  maxMenuItems = 10,
  minQueryLength = 1,
  debounceMs = 150,
  emptySearchResultsText = 'No results found',
  onChangeQuery,
  xstyle,
}: MobileTokenizerProps<T>) {
  const triggerId = useId();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(value.map(v => v.id)), [value]);
  const isAtMax = maxEntries != null && value.length >= maxEntries;

  const handleAdd = (item: T) => {
    if (isAtMax || selectedIds.has(item.id)) {
      return;
    }
    if (
      hasCreate &&
      typeof item.id === 'string' &&
      item.id.startsWith(CREATABLE_ID_PREFIX)
    ) {
      const created = item.id.slice(CREATABLE_ID_PREFIX.length);
      if (selectedIds.has(created)) {
        return;
      }
      const createdItem: SearchableItem = {id: created, label: created};
      const real = createdItem as T;
      onChange([...value, real], {item: real, type: 'create'});
      return;
    }
    onChange([...value, item], {item, type: 'add'});
  };
  const handleRemove = (item: T) =>
    onChange(
      value.filter(v => v.id !== item.id),
      {item, type: 'remove'},
    );
  const handleClearAll = () => {
    if (value.length > 0) {
      onChange([], {item: value[value.length - 1], type: 'remove'});
    }
  };

  // ---- sheet search ----
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [renderedItemCount, setRenderedItemCount] = useState(
    LIST_RENDER_BATCH_SIZE,
  );
  const seqRef = useRef(0);
  const lastLoadScrollHeightRef = useRef<number | null>(null);
  const [selectedItemsAtOpen, setSelectedItemsAtOpen] = useState<T[]>(value);
  useEffect(() => {
    if (!isSheetOpen) {
      return;
    }
    const seq = ++seqRef.current;
    const run = async () => {
      setIsSearching(true);
      try {
        const trimmed = query.trim();
        let items: T[];
        if (trimmed === '') {
          items = searchSource.bootstrap
            ? await searchSource.bootstrap()
            : await searchSource.search('');
        } else if (trimmed.length < minQueryLength) {
          items = [];
        } else {
          items = await searchSource.search(query);
        }
        if (seqRef.current === seq) {
          setResults(items.slice(0, maxMenuItems));
        }
      } finally {
        if (seqRef.current === seq) {
          setIsSearching(false);
        }
      }
    };
    if (debounceMs > 0) {
      const timer = setTimeout(() => {
        void run();
      }, debounceMs);
      return () => clearTimeout(timer);
    }
    void run();
  }, [
    isSheetOpen,
    query,
    searchSource,
    minQueryLength,
    maxMenuItems,
    debounceMs,
  ]);

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

  const createItem = useMemo<T | null>(() => {
    const trimmed = query.trim();
    if (!hasCreate || trimmed === '' || isAtMax) {
      return null;
    }
    if (
      selectedIds.has(trimmed) ||
      value.some(item => item.label.toLowerCase() === trimmed.toLowerCase()) ||
      results.some(r => r.label.toLowerCase() === trimmed.toLowerCase())
    ) {
      return null;
    }
    return {
      id: `${CREATABLE_ID_PREFIX}${trimmed}`,
      label: `Create "${trimmed}"`,
    } as unknown as T;
  }, [hasCreate, query, results, selectedIds, isAtMax, value]);

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      isOptional={isOptional}
      isDisabled={isDisabled}
      inputID={triggerId}
      xstyle={xstyle}>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={isSheetOpen}
        aria-label={label}
        aria-disabled={isDisabled || undefined}
        onClick={() => {
          if (isDisabled) {
            return;
          }
          setSelectedItemsAtOpen(value);
          lastLoadScrollHeightRef.current = null;
          setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
          setIsSheetOpen(true);
        }}
        {...stylex.props(styles.trigger, isDisabled && styles.triggerDisabled)}>
        {value.length > 0 ? (
          value.map(item => (
            <Token
              key={item.id}
              label={item.label}
              isDisabled={isDisabled}
              xstyle={isDisabled ? styles.tokenDisabled : undefined}
            />
          ))
        ) : (
          <span
            {...stylex.props(
              styles.triggerPlaceholder,
              isDisabled && styles.triggerPlaceholderDisabled,
            )}>
            {placeholder ?? ''}
          </span>
        )}
      </button>

      {!isDisabled && (
        <BottomSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          label={label}
          height="tall"
          padding={0}>
          <div {...stylex.props(styles.sheetBody)}>
            <div {...stylex.props(styles.filterRow)}>
              <TextInput
                label={`Search ${label}`}
                isLabelHidden
                placeholder="Search..."
                startIcon="search"
                value={query}
                size="lg"
                width="100%"
                hasClear
                onChange={next => {
                  lastLoadScrollHeightRef.current = null;
                  setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
                  setQuery(next);
                  onChangeQuery?.(next);
                }}
                controlXstyle={styles.filterInput}
              />
            </div>
            <div
              {...stylex.props(styles.list)}
              role="group"
              aria-label={label}
              data-testid="mobile-tokenizer-list"
              data-rendered-count={renderedItems.length}
              data-total-count={visibleItems.length}
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
                    Math.min(
                      current + LIST_RENDER_BATCH_SIZE,
                      visibleItems.length,
                    ),
                  );
                }
              }}>
              {createItem != null && (
                <div
                  data-testid="mobile-tokenizer-create-row"
                  {...stylex.props(styles.createRow)}>
                  <span {...stylex.props(styles.createLabel)}>
                    <Text type="body">{createItem.label}</Text>
                  </span>
                  <Button
                    label="Add"
                    aria-label={`Add ${query.trim()}`}
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      handleAdd(createItem);
                      lastLoadScrollHeightRef.current = null;
                      setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
                      setQuery('');
                    }}
                  />
                </div>
              )}
              {!isSearching &&
              visibleItems.length === 0 &&
              createItem == null ? (
                <EmptyState
                  icon={
                    <Icon
                      icon={query.trim() === '' ? ListBulletIcon : 'search'}
                      size="lg"
                      color="secondary"
                    />
                  }
                  title={
                    query.trim() === ''
                      ? 'No items available'
                      : emptySearchResultsText
                  }
                  description={
                    query.trim() === ''
                      ? 'There are no items to choose from.'
                      : 'Try a different search.'
                  }
                  isCompact
                  xstyle={styles.empty}
                />
              ) : (
                renderedItems.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  const rowDisabled = !isSelected && isAtMax;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={item.label}
                      aria-disabled={rowDisabled || undefined}
                      onClick={() => {
                        if (rowDisabled) {
                          return;
                        }
                        if (isSelected) {
                          handleRemove(item);
                        } else {
                          handleAdd(item);
                        }
                      }}
                      {...stylex.props(
                        styles.row,
                        rowDisabled && styles.rowDisabled,
                      )}>
                      <span {...stylex.props(styles.rowLabel)}>
                        {renderItem ? (
                          renderItem(item)
                        ) : (
                          <Text
                            type="body"
                            color={rowDisabled ? 'inherit' : undefined}>
                            {item.label}
                          </Text>
                        )}
                      </span>
                      <CheckboxIndicator
                        state={isSelected ? 'checked' : 'unchecked'}
                        size="md"
                        isDisabled={rowDisabled}
                        xstyle={
                          rowDisabled ? styles.indicatorDisabled : undefined
                        }
                      />
                    </button>
                  );
                })
              )}
            </div>
            {query.trim() === '' && (
              <div {...stylex.props(styles.footer)}>
                <Button
                  label="Clear all"
                  variant="secondary"
                  size="lg"
                  isDisabled={value.length === 0}
                  onClick={() => setIsClearConfirmationOpen(true)}
                  xstyle={styles.footerAction}
                />
                <Button
                  label="Done"
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    setQuery('');
                    setIsSheetOpen(false);
                  }}
                  xstyle={styles.footerAction}
                />
              </div>
            )}
            <AlertDialog
              isOpen={isClearConfirmationOpen}
              onOpenChange={setIsClearConfirmationOpen}
              title="Clear all selected items?"
              description={`This removes all selected items from ${label}.`}
              actionLabel="Clear selection"
              onAction={() => {
                handleClearAll();
                setIsClearConfirmationOpen(false);
              }}
            />
          </div>
        </BottomSheet>
      )}
    </Field>
  );
}

MobileTokenizer.displayName = 'MobileTokenizer';
