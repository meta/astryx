// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file EmojiPicker.tsx
 * @input Uses React, StyleX, theme tokens, useGridFocus, useTranslator,
 *   TextInput, ScrollableArea, Text, Spinner, Icon, and the lazily loaded CLDR
 *   emoji set (emojiData.ts)
 * @output Exports EmojiPicker, EmojiPickerProps, EmojiOption, EmojiCategory,
 *   DEFAULT_FREQUENT_EMOJIS, and a persistent search-status announcement
 * @position Standalone emoji panel: a search field over every emoji by CLDR
 *   group. Hosts place it inline or inside a Popover; CommentComposer uses it
 *   for its emoji button.
 *
 * The full emoji set is the largest part of the picker, so it loads the first
 * time a picker mounts rather than with the page. Each group is a WAI-ARIA
 * grid of eight columns; one roving tab stop crosses every group through the
 * shared `useGridFocus` keyboard model. Enter in the search field picks the
 * first match, and a footer names the emoji under the pointer or focus.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/EmojiPicker/index.ts (exports)
 * - /packages/lab/src/EmojiPicker/EmojiPicker.doc.mjs
 * - /packages/lab/blocks/EmojiPickerShowcase.tsx
 * - /packages/core/locales/en.json (@astryx.emojiPicker.*)
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps, SizeValue} from '@astryxdesign/core';
import {useGridFocus} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  focusOutlineStyles,
  isImeKeyEvent,
  mergeProps,
  themeProps,
} from '@astryxdesign/core/utils';
import {Center} from '@astryxdesign/core/Center';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

export interface EmojiOption {
  /** The emoji character, e.g. "🎉". */
  emoji: string;
  /** Its name, used for search and as its accessible label, e.g. "Party popper". */
  name: string;
  /** Other words search should match, e.g. ["celebration", "tada"]. */
  keywords?: readonly string[];
}

export interface EmojiCategory {
  /** The group's heading, e.g. "Smileys & emotion". */
  name: string;
  emojis: readonly EmojiOption[];
}

/** The emoji listed first, before the groups, when the host passes none. */
export const DEFAULT_FREQUENT_EMOJIS: readonly EmojiOption[] = Object.freeze([
  {emoji: '👍', name: 'Thumbs up'},
  {emoji: '❤️', name: 'Red heart'},
  {emoji: '😂', name: 'Face with tears of joy'},
  {emoji: '🎉', name: 'Party popper'},
  {emoji: '😮', name: 'Face with open mouth'},
  {emoji: '🙏', name: 'Folded hands'},
  {emoji: '👀', name: 'Eyes'},
  {emoji: '✅', name: 'Check mark button'},
]);

export interface EmojiPickerProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onSelect'
> {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLDivElement>;

  /** Called with the picked emoji character and its option. */
  onSelect: (emoji: string, option: EmojiOption) => void;

  /**
   * Emoji listed first, under "Frequently used": the host's own recent or
   * favorite emoji. Pass an empty array to leave the row out.
   * @default DEFAULT_FREQUENT_EMOJIS
   */
  frequentEmojis?: readonly EmojiOption[];

  /**
   * The emoji to offer, by group. Omit it to load the bundled set: every
   * emoji through Emoji 15 with English CLDR names, loaded the first time a
   * picker mounts. Pass your own groups for a localized or custom set.
   */
  categories?: readonly EmojiCategory[];

  /**
   * Height of the scrolling emoji list.
   * @default 'calc(var(--spacing-8) * 10)'
   */
  height?: SizeValue;

  /**
   * Focuses the search field when the picker mounts, for a picker shown
   * inline or in a Dialog. Inside a Popover, leave the Popover's own autofocus
   * on instead: it focuses the search field once the Popover shows.
   * @default false
   */
  hasAutoFocus?: boolean;

  /**
   * Accessible name of the emoji list. Defaults to the localized "Emoji".
   */
  label?: string;

  /**
   * Placeholder and hidden label of the search field. Defaults to the
   * localized "Search emoji".
   */
  searchLabel?: string;
}

/** Eight emoji a row, so arrow keys move through a fixed geometry. */
const COLUMNS = 8;

type LoadState = readonly EmojiCategory[] | 'loading' | 'failed';

/* The catalog keys of the bundled groups' headings, by group. */
const bundledLabelKeys = new WeakMap<EmojiCategory, string>();
const BUNDLED_GROUP_KEYS: Readonly<Record<string, string>> = {
  'Smileys & emotion': '@astryx.emojiPicker.groupSmileysEmotion',
  'People & body': '@astryx.emojiPicker.groupPeopleBody',
  'Animals & nature': '@astryx.emojiPicker.groupAnimalsNature',
  'Food & drink': '@astryx.emojiPicker.groupFoodDrink',
  'Travel & places': '@astryx.emojiPicker.groupTravelPlaces',
  Activities: '@astryx.emojiPicker.groupActivities',
  Objects: '@astryx.emojiPicker.groupObjects',
  Symbols: '@astryx.emojiPicker.groupSymbols',
  Flags: '@astryx.emojiPicker.groupFlags',
};

/* The bundled set, shared by every picker once one has loaded it. */
let bundledCategories: Promise<readonly EmojiCategory[]> | null = null;

function loadBundledCategories(): Promise<readonly EmojiCategory[]> {
  bundledCategories ??= import('./emojiData').then(
    ({EMOJI_GROUPS}) =>
      EMOJI_GROUPS.map(group => {
        const category: EmojiCategory = {
          name: group.name,
          emojis: group.emojis.map(([emoji, name, keywords]) => ({
            emoji,
            name,
            keywords: keywords === '' ? undefined : keywords.split(' '),
          })),
        };
        const labelKey = BUNDLED_GROUP_KEYS[group.name];
        if (labelKey != null) {
          bundledLabelKeys.set(category, labelKey);
        }
        return category;
      }),
    error => {
      // Let the next picker try again.
      bundledCategories = null;
      throw error;
    },
  );
  return bundledCategories;
}

function useCategories(categories: readonly EmojiCategory[] | undefined) {
  const [loaded, setLoaded] = useState<LoadState>('loading');
  // Loading is I/O: the module arrives after the first render.
  useEffect(() => {
    if (categories != null) {
      return;
    }
    let isCurrent = true;
    loadBundledCategories().then(
      result => {
        if (isCurrent) {
          setLoaded(result);
        }
      },
      () => {
        if (isCurrent) {
          setLoaded('failed');
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [categories]);
  return categories ?? loaded;
}

/**
 * Whether an emoji's name or keywords hold every word of a search, each as
 * the start of a word: `cat` finds Cat face, not Vacation.
 */
function emojiMatches(option: EmojiOption, queryWords: readonly string[]) {
  const words = [option.name, ...(option.keywords ?? [])]
    .join(' ')
    .toLowerCase()
    .split(/[\s:,()-]+/);
  return queryWords.every(query => words.some(word => word.startsWith(query)));
}

type Section = {key: string; label: string; emojis: readonly EmojiOption[]};

/** A section's emoji in rows of eight; the last row is padded with empty
 *  cells so every row has the grid's full geometry. */
function toRows(emojis: readonly EmojiOption[]): (EmojiOption | null)[][] {
  const rows: (EmojiOption | null)[][] = [];
  for (let start = 0; start < emojis.length; start += COLUMNS) {
    const row: (EmojiOption | null)[] = emojis.slice(start, start + COLUMNS);
    while (row.length < COLUMNS) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}

/* A group's heading stays at the top of the list while its emoji scroll
   under it, on the popover surface the picker usually sits on. */
const styles = stylex.create({
  categoryLabel: {
    position: 'sticky',
    insetBlockStart: 0,
    zIndex: 1,
    backgroundColor: colorVars['--color-background-popover'],
  },
  row: {
    display: 'grid',
    gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
    columnGap: spacingVars['--spacing-0-5'],
  },
  gridCell: {
    display: 'flex',
    minWidth: 0,
  },
  cell: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '1',
    padding: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        default: 'transparent',
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    fontSize: typeScaleVars['--text-large-size'],
    lineHeight: 1,
    // Inset: the cells sit edge to edge, so an outset ring would overlap
    // their neighbors.
    outlineOffset: {default: '0', ':focus-visible': '-2px'},
    transitionProperty: 'background-color',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  preview: {
    minHeight: spacingVars['--spacing-8'],
  },
  previewEmoji: {
    fontSize: typeScaleVars['--text-large-size'],
    lineHeight: 1,
  },
});

const DEFAULT_LIST_HEIGHT = 'calc(var(--spacing-8) * 10)';

/**
 * A standalone emoji panel: a search field over every emoji by group, with
 * the host's frequent emoji first. Picking one calls `onSelect`; the picker
 * keeps no selection of its own.
 *
 * @example
 * ```
 * <Card padding={0} width={352}>
 *   <EmojiPicker onSelect={emoji => insert(emoji)} />
 * </Card>
 * ```
 */
export function EmojiPicker({
  onSelect,
  frequentEmojis = DEFAULT_FREQUENT_EMOJIS,
  categories: categoriesProp,
  height = DEFAULT_LIST_HEIGHT,
  hasAutoFocus = false,
  label: labelProp,
  searchLabel: searchLabelProp,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: EmojiPickerProps) {
  const t = useTranslator();
  const label = labelProp ?? t('@astryx.emojiPicker.label');
  const searchLabel = searchLabelProp ?? t('@astryx.emojiPicker.searchLabel');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<EmojiOption | null>(null);
  const categories = useCategories(categoriesProp);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const {gridRef, handleKeyDown, handleFocus, focusFirst} =
    useGridFocus<HTMLDivElement>({
      columns: COLUMNS,
      cellSelector: '[role="gridcell"]',
      isCellFocusable: cell => cell.querySelector('button') !== null,
      getFocusTarget: cell => cell.querySelector<HTMLElement>('button'),
      hasRovingTabIndex: true,
      // Up from the first row returns to the search field.
      onNavigateBefore: (_column, offset) => {
        if (offset === COLUMNS) {
          searchRef.current?.focus();
        }
      },
    });

  const queryWords = useMemo(
    () => query.toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );
  const isLoading = categories === 'loading';
  const groups = useMemo(
    () => (Array.isArray(categories) ? categories : []),
    [categories],
  );
  const frequentLabel = t('@astryx.emojiPicker.frequentlyUsed');
  const searchResultsLabel = t('@astryx.emojiPicker.searchResults');
  const sections = useMemo<Section[]>(() => {
    if (queryWords.length === 0) {
      return [
        ...(frequentEmojis.length > 0
          ? [{key: 'frequent', label: frequentLabel, emojis: frequentEmojis}]
          : []),
        ...groups.map((group, index) => {
          const labelKey = bundledLabelKeys.get(group);
          return {
            key: `group-${index}`,
            label: labelKey != null ? t(labelKey) : group.name,
            emojis: group.emojis,
          };
        }),
      ];
    }
    const seen = new Set<string>();
    // Match before de-duplicating: a frequent emoji may carry no keywords, so
    // its group's entry is often the one that matches.
    const matches = [frequentEmojis, ...groups.map(group => group.emojis)]
      .flat()
      .filter(option => emojiMatches(option, queryWords))
      .filter(option => {
        if (seen.has(option.emoji)) {
          return false;
        }
        seen.add(option.emoji);
        return true;
      });
    return matches.length > 0
      ? [{key: 'results', label: searchResultsLabel, emojis: matches}]
      : [];
  }, [
    frequentEmojis,
    frequentLabel,
    groups,
    queryWords,
    searchResultsLabel,
    t,
  ]);
  const firstMatch = sections[0]?.emojis[0];
  const noResultsMessage =
    !isLoading && queryWords.length > 0 && sections.length === 0
      ? t('@astryx.emojiPicker.noResults', {query: query.trim()})
      : undefined;

  const pick = (option: EmojiOption) => onSelect(option.emoji, option);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // While an IME is composing, the arrows move through its candidates.
    if (isImeKeyEvent(event.nativeEvent)) {
      return;
    }
    if (event.key === 'ArrowDown' && firstMatch != null) {
      event.preventDefault();
      focusFirst();
    }
  };

  const renderSection = (section: Section, sectionIndex: number) => {
    // An id holds no spaces: aria-labelledby splits on them.
    const labelId = `${baseId}-group-${sectionIndex}`;
    return (
      <VStack key={section.key} gap={1} width="100%">
        <HStack
          paddingInline={3}
          paddingBlock={1}
          xstyle={styles.categoryLabel}>
          <Text type="label" id={labelId}>
            {section.label}
          </Text>
        </HStack>
        <VStack
          role="grid"
          aria-labelledby={labelId}
          gap={0.5}
          width="100%"
          paddingInline={3}>
          {toRows(section.emojis).map((row, rowIndex) => (
            <div key={rowIndex} role="row" {...stylex.props(styles.row)}>
              {row.map((option, column) => (
                <div
                  key={option?.emoji ?? `empty-${column}`}
                  role="gridcell"
                  {...stylex.props(styles.gridCell)}>
                  {option != null && (
                    <button
                      type="button"
                      aria-label={option.name}
                      {...stylex.props(
                        focusOutlineStyles.focusVisible,
                        styles.cell,
                      )}
                      onClick={() => pick(option)}
                      onFocus={() => setPreview(option)}
                      onMouseEnter={() => setPreview(option)}>
                      <span aria-hidden="true">{option.emoji}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </VStack>
      </VStack>
    );
  };

  return (
    <VStack
      ref={ref}
      gap={2}
      width="100%"
      // The picker owns its insets, so it sits edge to edge in a Popover or
      // Card with no padding, its group headings spanning the full width.
      paddingBlockStart={3}
      {...rest}
      {...mergeProps(
        themeProps('emoji-picker'),
        stylex.props(xstyle),
        className,
        style,
      )}>
      <VStack paddingInline={3} width="100%">
        <TextInput
          ref={searchRef}
          label={searchLabel}
          isLabelHidden
          placeholder={searchLabel}
          startIcon={<Icon icon="search" size="sm" color="secondary" />}
          hasClear
          hasAutoFocus={hasAutoFocus}
          value={query}
          onChange={value => {
            setQuery(value);
            setPreview(null);
          }}
          onEnter={() => {
            if (queryWords.length > 0 && firstMatch != null) {
              pick(firstMatch);
            }
          }}
          onKeyDown={handleSearchKeyDown}
        />
      </VStack>
      <ScrollableArea label={label} height={height} overscroll="contain">
        <VStack
          ref={gridRef}
          gap={3}
          width="100%"
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onMouseLeave={() => setPreview(null)}>
          {sections.map(renderSection)}
          {queryWords.length > 0 && sections.length === 0 && isLoading ? (
            <Center>
              <Spinner size="sm" label={t('@astryx.emojiPicker.loading')} />
            </Center>
          ) : queryWords.length === 0 && isLoading ? (
            <Center>
              <Spinner size="sm" label={t('@astryx.emojiPicker.loading')} />
            </Center>
          ) : null}
          <HStack
            role="status"
            aria-atomic="true"
            paddingInline={3}
            data-emoji-picker-search-status="true">
            {queryWords.length === 0 && categories === 'failed' ? (
              <Text type="supporting" color="secondary">
                {t('@astryx.emojiPicker.loadFailed')}
              </Text>
            ) : (
              noResultsMessage != null && (
                <Text type="supporting" color="secondary">
                  {noResultsMessage}
                </Text>
              )
            )}
          </HStack>
        </VStack>
      </ScrollableArea>
      <HStack
        gap={2}
        align="center"
        paddingInline={3}
        paddingBlockEnd={2}
        xstyle={styles.preview}
        // The cell's own name already reaches assistive tech.
        aria-hidden="true">
        {preview != null ? (
          <>
            <span {...stylex.props(styles.previewEmoji)}>{preview.emoji}</span>
            <Text type="supporting" color="secondary" maxLines={1}>
              {preview.name}
            </Text>
          </>
        ) : (
          <Text type="supporting" color="secondary" maxLines={1}>
            {label}
          </Text>
        )}
      </HStack>
    </VStack>
  );
}

EmojiPicker.displayName = 'EmojiPicker';
