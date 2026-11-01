// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Pagination.tsx
 * @input Uses React, StyleX, Button, Icon, Selector, Text; page number buttons delegate to Button.
 *   Compact first/last buttons cancel the inside control gap with logical token margins.
 *   Prev/next and first/last chevrons mirror under RTL via the shared rtlStyles.mirror
 *   (CSS scaleX), not a JS direction read. The input and compact variants use the
 *   chevronsLeft/chevronsRight (first/last) icons.
 * @output Exports Pagination component, PaginationProps, PaginationVariant, PaginationSize types
 * @position Core implementation; consumed by index.ts, tested by Pagination.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Pagination/Pagination.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Pagination/index.ts (exports if types change)
 * - /apps/storybook/stories/Pagination.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Pagination/ (showcase blocks)
 *
 * Last synced props: page, onChange, changeAction, totalItems, totalPages, hasMore,
 *   pageSize, pageSizeOptions, onPageSizeChange, variant, pageLabel,
 *   hasFirstLast, step, siblingCount, size, isDisabled, label, data-testid, xstyle
 */

import {useOptimistic, useTransition} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  fontWeightVars,
  sizeVars,
  spacingVars,
  durationVars,
  easeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {NumberInput} from '../NumberInput';
import {Selector} from '../Selector';
import {Text} from '../Text';
import {useAnnounce} from '../hooks/useAnnounce';
import {useListFocus} from '../hooks/useListFocus';
import {mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useTranslator} from '../i18n/useTranslator';
import type {PaginationVariantMap} from './index';

// =============================================================================
// Types
// =============================================================================

/** Visual variant controlling what appears between prev/next buttons.
 * Extensible via module augmentation of PaginationVariantMap.
 */
export type PaginationVariant = keyof PaginationVariantMap;

/** Size of the pagination controls. */
export type PaginationSize = 'sm' | 'md';

export interface PaginationProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  // --- Core (required) ---
  /** Current page number (1-based). Page 1 is the first page. */
  page: number;
  /** Called when the page changes. */
  onChange: (page: number) => void;
  /**
   * Async action on page change. Fires after onChange.
   * Uses React transitions for built-in loading state.
   */
  changeAction?: (page: number) => void | Promise<void>;

  // --- Data shape (provide one) ---
  /**
   * Total number of items. Used to calculate page count.
   * Takes precedence over totalPages if both provided.
   */
  totalItems?: number;
  /**
   * Total number of pages. Use when you know page count but not item count.
   */
  totalPages?: number;
  /**
   * Whether more pages exist after the current one.
   * Use for cursor-based pagination where total is unknown.
   */
  hasMore?: boolean;

  // --- Page size ---
  /** Number of items per page. @default 10 */
  pageSize?: number;
  /** Available page size options. Shows a page size selector when provided. */
  pageSizeOptions?: number[];
  /** Called when the page size changes. */
  onPageSizeChange?: (pageSize: number) => void;

  // --- Display ---
  /**
   * Visual variant controlling what appears between prev/next buttons.
   * - pages: Page number buttons with ellipsis (default)
   * - count: "X–Y of Z" text
   * - compact: "Page X of Y" text. First/last buttons are opt-in (see
   *   hasFirstLast).
   * - dots: Dot indicators
   * - input: An editable number box rendering "Page [ n ] / N". The leading
   *   noun is controlled by `pageLabel`. First/last double-chevron buttons
   *   flank prev/next by default (see hasFirstLast).
   * - none: Just prev/next buttons
   * @default 'pages'
   */
  variant?: PaginationVariant;
  /**
   * The noun rendered before the editable box in the `input` variant, e.g.
   * "Page" or "Row". Navigation is always page-based (via `onChange`); this
   * only relabels the box. @default the localized "Page"
   */
  pageLabel?: string;
  /**
   * Whether to show first/last («/») double-chevron buttons flanking
   * prev/next. Applies to the `input` variant (shown unless false) and the
   * `compact` variant (shown only when true); other variants ignore it.
   * The last button needs a known total — both are omitted when the page count
   * is unknown (cursor/hasMore pagination).
   * @default true for `input`, false for `compact`
   */
  hasFirstLast?: boolean;
  /**
   * Number of pages the previous/next («‹ ›») buttons advance per click.
   * Clamped to the valid page range, so a step that would overshoot lands on
   * the first/last page. When greater than 1, the buttons' accessible names
   * reflect the stride (e.g. "Go forward 5 pages"). Non-integer or values < 1
   * fall back to 1. @default 1
   */
  step?: number;
  /**
   * Number of page buttons to show on each side of the current page.
   * Only applies when variant='pages'. @default 1
   */
  siblingCount?: number;
  /**
   * Size of the pagination controls.
   * @default 'md'
   */
  size?: PaginationSize;

  // --- Behavior ---
  /** Whether the component is disabled. @default false */
  isDisabled?: boolean;

  // --- Accessibility ---
  /**
   * Accessible label for the navigation landmark.
   * @default 'Pagination'
   */
  label?: string;

  // --- Standard Astryx ---
  /** Test ID for automated testing. */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

/** Width (px) of the page-size Selector field. */
const PAGE_SIZE_SELECTOR_WIDTH = 80;

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-4'],
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  compactFirst: {
    marginInlineEnd: `calc(-1 * ${spacingVars['--spacing-1']})`,
  },
  compactLast: {
    marginInlineStart: `calc(-1 * ${spacingVars['--spacing-1']})`,
  },
  ellipsis: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: sizeVars['--size-element-md'],
    height: sizeVars['--size-element-md'],
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-label-size'],
    userSelect: 'none',
  },
  ellipsisSm: {
    minWidth: sizeVars['--size-element-sm'],
    height: sizeVars['--size-element-sm'],
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  infoText: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  dotsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  dot: {
    width: spacingVars['--spacing-2'],
    height: spacingVars['--spacing-2'],
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    borderRadius: '50%',
    backgroundColor: colorVars['--color-neutral'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  dotSm: {
    width: spacingVars['--spacing-1-5'],
    height: spacingVars['--spacing-1-5'],
  },
  dotActive: {
    backgroundColor: colorVars['--color-accent'],
  },
  dotDisabled: {
    cursor: 'default',
    opacity: 0.5,
  },
  activePage: {
    backgroundColor: colorVars['--color-neutral'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  inputGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    whiteSpace: 'nowrap',
  },
  inputLabel: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-label-size'],
    userSelect: 'none',
  },
  inputLabelSm: {
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  inputTotal: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-label-size'],
    userSelect: 'none',
  },
  inputTotalSm: {
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  pageSizeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generates the range of page numbers to display, including ellipsis markers.
 * Returns an array of page numbers and '...' strings.
 *
 * @example
 * ```
 * generatePageRange(5, 10, 1) → [1, '...', 4, 5, 6, '...', 10]
 * generatePageRange(1, 10, 1) → [1, 2, 3, '...', 10]
 * generatePageRange(1, 5, 1)  → [1, 2, 3, 4, 5]
 * ```
 */
export function generatePageRange(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
): (number | '...')[] {
  // Total page number slots (excluding ellipses):
  // first + last + current + 2*siblings = 3 + 2*siblings
  // With 2 potential ellipsis slots: 5 + 2*siblings
  const totalSlots = 5 + 2 * siblingCount;

  // If total pages fit within slots, show all pages
  if (totalPages <= totalSlots) {
    return Array.from({length: totalPages}, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    // Near the start: show more pages on the left
    const leftRange = 3 + 2 * siblingCount;
    const pages: (number | '...')[] = Array.from(
      {length: leftRange},
      (_, i) => i + 1,
    );
    pages.push('...', totalPages);
    return pages;
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    // Near the end: show more pages on the right
    const rightRange = 3 + 2 * siblingCount;
    const pages: (number | '...')[] = [1, '...'];
    for (let i = totalPages - rightRange + 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  // In the middle: show ellipsis on both sides
  const pages: (number | '...')[] = [1, '...'];
  for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
    pages.push(i);
  }
  pages.push('...', totalPages);
  return pages;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Standalone pagination controls for navigating through pages of content.
 *
 * Supports multiple display variants: page numbers, count text, compact text,
 * dot indicators, or minimal prev/next navigation. Works with known totals
 * or cursor-based pagination.
 *
 * @example
 * ```
 * <Pagination
 *   page={page}
 *   onChange={setPage}
 *   totalItems={200}
 *   pageSize={20}
 * />
 * ```
 */
export function Pagination({
  page,
  onChange,
  changeAction,
  totalItems,
  totalPages: totalPagesProp,
  hasMore,
  pageSize: pageSizeProp = 10,
  pageSizeOptions,
  onPageSizeChange,
  variant = 'pages',
  pageLabel,
  hasFirstLast: hasFirstLastProp,
  step: stepProp = 1,
  siblingCount = 1,
  size = 'md',
  isDisabled = false,
  label: labelFromProps,
  'data-testid': testId,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: PaginationProps) {
  const [, startTransition] = useTransition();

  // Resolve system strings once per render. Prop overrides win.
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.pagination.label');
  const firstLabel = t('@astryx.pagination.first');
  const lastLabel = t('@astryx.pagination.last');

  const pageIndicatorsLabel = t('@astryx.pagination.pageIndicators');
  const itemsPerPageLabel = t('@astryx.pagination.itemsPerPage');
  const goToPageLabel = t('@astryx.pagination.goToPageInput');
  const inputLabelText = pageLabel ?? t('@astryx.pagination.pageLabel');

  // pageSize is typed as number, so 0, NaN, and negatives are valid at the
  // type level but yield Infinity/NaN page counts, and
  // Array.from({length: Infinity}) crashes the dots variant. Coerce to a
  // positive integer; non-finite values fall back to the default.
  const pageSize = Number.isFinite(pageSizeProp)
    ? Math.max(1, Math.floor(pageSizeProp))
    : 10;

  // Prev/next stride. Same guard as pageSize: non-integer or < 1 falls back to
  // a single-page step so a bad value never freezes or reverses navigation.
  const step = Number.isInteger(stepProp) && stepProp >= 1 ? stepProp : 1;

  // The prev/next buttons advance `step` pages, so their accessible names must
  // reflect the stride: a plain "previous/next page" for the default single
  // step, or an explicit "back/forward N pages" so a screen reader never
  // announces a single-page move for a multi-page jump.
  const previousLabel =
    step > 1
      ? t('@astryx.pagination.previousBy', {step})
      : t('@astryx.pagination.previous');
  const nextLabel =
    step > 1
      ? t('@astryx.pagination.nextBy', {step})
      : t('@astryx.pagination.next');

  // Announce page changes politely (navigation-10). The controls carry no
  // live region, so page transitions were previously silent to screen readers.
  // Only user-driven changes go through handlePageChange, so initial mount is
  // never announced.
  const announce = useAnnounce();

  // Track the page optimistically so rapid prev/next clicks advance from the
  // in-flight target instead of stalling on the last committed page.
  const [optimisticPage, setOptimisticPage] = useOptimistic(page);

  // Roving-tabindex + arrow/Home/End keyboard nav for the dots variant, owned
  // by the shared useListFocus primitive (mirrors SegmentedControl). It stamps a
  // single tab stop across the dots and moves focus horizontally; selection
  // follows focus via handleDotsFocus so arrow keys move the active page.
  const {
    listRef: dotsListRef,
    handleKeyDown: handleDotsKeyDown,
    handleFocus: handleDotsRovingFocus,
  } = useListFocus<HTMLDivElement>({
    itemSelector: 'button',
    hasRovingTabIndex: true,
    wrap: true,
    orientation: 'horizontal',
  });

  const computedTotalPages =
    totalPagesProp ??
    (totalItems != null ? Math.ceil(totalItems / pageSize) : undefined);

  const hasPrevious = optimisticPage > 1;
  const hasNext =
    computedTotalPages != null
      ? optimisticPage < computedTotalPages
      : (hasMore ?? false);

  if (totalItems != null && totalItems <= 0) {
    return null;
  }
  if (computedTotalPages != null && computedTotalPages <= 0) {
    return null;
  }

  // Interruptible: re-clicking before the transition settles starts a fresh one
  // with the next optimistic page rather than being dropped, so there is no
  // re-entry guard.
  const handlePageChange = (newPage: number) => {
    if (isDisabled) {
      return;
    }
    // Keep onChange urgent so controlled page state updates in the same commit
    // as the click; only the optimistic indicator and changeAction defer.
    onChange(newPage);
    announce(
      computedTotalPages != null
        ? t('@astryx.pagination.pageOfTotal', {
            current: newPage,
            total: computedTotalPages,
          })
        : t('@astryx.pagination.pageAnnounce', {current: newPage}),
    );
    startTransition(async () => {
      setOptimisticPage(newPage);
      await changeAction?.(newPage);
    });
  };

  // Selection-follows-focus for the dots (APG radiogroup pattern): useListFocus
  // only *moves* focus, so when focus lands on a dot -- via arrow/Home/End, or a
  // click that focuses it -- we select that dot's page. handleDotsRovingFocus
  // keeps the roving tab stop in sync. The current page is skipped so tabbing
  // into the group is a no-op.
  const handleDotsFocus = (e: React.FocusEvent) => {
    handleDotsRovingFocus(e);
    if (isDisabled) {
      return;
    }
    const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      'button[data-page]',
    );
    if (!focused) {
      return;
    }
    const nextPage = Number(focused.dataset.page);
    if (Number.isFinite(nextPage) && nextPage !== optimisticPage) {
      handlePageChange(nextPage);
    }
  };

  // Clamp a target page into the valid range. The lower bound is always 1; the
  // upper bound only exists when the page count is known (cursor/hasMore mode
  // leaves it open-ended).
  const clampPage = (target: number): number => {
    const lower = Math.max(target, 1);
    return computedTotalPages != null
      ? Math.min(lower, computedTotalPages)
      : lower;
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      handlePageChange(clampPage(optimisticPage - step));
    }
  };

  const handleNext = () => {
    if (hasNext) {
      handlePageChange(clampPage(optimisticPage + step));
    }
  };

  const handleFirst = () => {
    if (hasPrevious) {
      handlePageChange(1);
    }
  };

  const handleLast = () => {
    if (hasNext && computedTotalPages != null) {
      handlePageChange(computedTotalPages);
    }
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = Number(value);
    onPageSizeChange?.(newSize);
    // Reset to page 1 when page size changes.
    handlePageChange(1);
  };

  // The value currently shown in the input box is the committed page number.
  const inputCommittedValue = optimisticPage;

  // NumberInput owns the typing/pending state and clamps to [min, max] with
  // integer-only semantics, so it only ever hands back a valid page here.
  // Navigation is page-based via onChange.
  const handleInputCommit = (nextPage: number) => {
    if (isDisabled || nextPage === optimisticPage) {
      return;
    }
    handlePageChange(nextPage);
  };

  // Item range for count display
  const rangeStart = (optimisticPage - 1) * pageSize + 1;
  const rangeEnd =
    totalItems != null
      ? Math.min(optimisticPage * pageSize, totalItems)
      : optimisticPage * pageSize;

  const buttonSize = size === 'sm' ? 'sm' : 'md';
  const isSm = size === 'sm';

  // First/last buttons are on by default in the input variant and opt-in for
  // compact; other variants never render them. They also need a known page
  // count (the last button would have no target otherwise).
  const hasFirstLast =
    variant === 'input'
      ? (hasFirstLastProp ?? true)
      : variant === 'compact' && hasFirstLastProp === true;
  const showFirstLast = hasFirstLast && computedTotalPages != null;

  const renderIndicator = () => {
    switch (variant) {
      case 'pages': {
        if (computedTotalPages == null) {
          return null;
        }
        const pageRange = generatePageRange(
          optimisticPage,
          computedTotalPages,
          siblingCount,
        );
        return (
          <>
            {pageRange.map((item, index) => {
              if (item === '...') {
                const previousPage = pageRange[index - 1];
                const nextPage = pageRange[index + 1];
                return (
                  <span
                    key={`ellipsis-${previousPage}-${nextPage}`}
                    aria-hidden="true"
                    {...stylex.props(
                      styles.ellipsis,
                      isSm && styles.ellipsisSm,
                    )}>
                    …
                  </span>
                );
              }
              const isActive = item === optimisticPage;
              return (
                <Button
                  key={item}
                  label={t('@astryx.pagination.goToPage', {page: item})}
                  aria-label={t('@astryx.pagination.goToPage', {
                    page: item,
                  })}
                  variant="ghost"
                  size={buttonSize}
                  onClick={() => handlePageChange(item)}
                  isDisabled={isDisabled}
                  aria-current={isActive ? 'page' : undefined}
                  xstyle={isActive && styles.activePage}>
                  {item}
                </Button>
              );
            })}
          </>
        );
      }

      case 'count': {
        if (totalItems == null) {
          return null;
        }
        return (
          <span {...stylex.props(styles.infoText)}>
            <Text type="body" size="sm" color="secondary">
              {t('@astryx.pagination.count', {
                from: rangeStart,
                to: rangeEnd,
                total: totalItems,
              })}
            </Text>
          </span>
        );
      }

      case 'compact': {
        if (computedTotalPages == null) {
          return null;
        }
        return (
          <span {...stylex.props(styles.infoText)}>
            <Text type="body" size="sm" color="secondary">
              {t('@astryx.pagination.pageOfTotal', {
                current: optimisticPage,
                total: computedTotalPages,
              })}
            </Text>
          </span>
        );
      }

      case 'dots': {
        if (computedTotalPages == null) {
          return null;
        }

        return (
          <div
            ref={dotsListRef}
            {...stylex.props(styles.dotsContainer)}
            role="group"
            aria-label={pageIndicatorsLabel}
            onKeyDown={handleDotsKeyDown}
            onFocus={handleDotsFocus}>
            {Array.from({length: computedTotalPages}, (_, i) => {
              const isActive = i + 1 === optimisticPage;
              return (
                <button
                  key={i + 1}
                  type="button"
                  data-page={i + 1}
                  aria-label={t('@astryx.pagination.goToPage', {
                    page: i + 1,
                  })}
                  aria-current={isActive ? 'page' : undefined}
                  // The active dot is the single roving tab stop; useListFocus
                  // maintains it as focus and the active page move.
                  tabIndex={isActive ? 0 : -1}
                  // Selection is driven by focus (handleDotsFocus); clicking only
                  // needs to focus the dot, which some browsers (Safari) skip for
                  // buttons, so focus it explicitly.
                  onClick={e => e.currentTarget.focus()}
                  // Disabled dots stay focusable (spec:AST-085 FR1); the page
                  // only follows focus while enabled (handleDotsFocus).
                  aria-disabled={isDisabled || undefined}
                  {...mergeProps(
                    themeProps('pagination-dot', {
                      active: isActive ? 'active' : null,
                      size,
                    }),
                    focusOutlineProps.focusVisible(
                      styles.dot,
                      isSm && styles.dotSm,
                      isActive && styles.dotActive,
                      isDisabled && styles.dotDisabled,
                    ),
                  )}
                />
              );
            })}
          </div>
        );
      }

      case 'input': {
        // The editable box needs a known page count to clamp against; in
        // cursor/hasMore mode (no total) there is no valid range, so the box is
        // disabled rather than accepting entries it can't resolve — matching the
        // convention that a typeable page box requires a known total.
        const isInputDisabled = isDisabled || computedTotalPages == null;

        const inputNode = (
          <NumberInput
            label={goToPageLabel}
            isLabelHidden
            value={inputCommittedValue}
            onChange={handleInputCommit}
            min={1}
            max={computedTotalPages ?? undefined}
            isIntegerOnly
            size={size}
            width={
              isSm
                ? sizeVars['--size-element-sm']
                : sizeVars['--size-element-md']
            }
            isDisabled={isInputDisabled}
            data-testid={testId != null ? `${testId}-input` : undefined}
          />
        );

        // Label wording: "Page [ n ] / N". The leading noun comes from
        // `pageLabel`; the trailing "/ N" total is omitted when unknown.
        return (
          <span {...stylex.props(styles.inputGroup)}>
            <span
              aria-hidden="true"
              {...mergeProps(
                themeProps('pagination-input-label', {size}),
                stylex.props(styles.inputLabel, isSm && styles.inputLabelSm),
              )}>
              {inputLabelText}
            </span>
            {inputNode}
            {computedTotalPages != null && (
              <span
                {...mergeProps(
                  themeProps('pagination-input-total', {size}),
                  stylex.props(styles.inputTotal, isSm && styles.inputTotalSm),
                )}>
                {t('@astryx.pagination.ofTotalPages', {
                  total: computedTotalPages,
                })}
              </span>
            )}
          </span>
        );
      }

      case 'none':
      default:
        return null;
    }
  };

  return (
    <nav
      ref={ref}
      {...mergeProps(
        themeProps('pagination', {variant, size}),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...rest}
      aria-label={label}
      data-testid={testId}>
      {pageSizeOptions != null && pageSizeOptions.length > 0 && (
        <div {...stylex.props(styles.pageSizeSelector)}>
          <Selector
            label={itemsPerPageLabel}
            isLabelHidden
            options={pageSizeOptions.map(opt => String(opt))}
            value={String(pageSize)}
            onChange={handlePageSizeChange}
            size={buttonSize}
            isDisabled={isDisabled}
            // `width`, not `xstyle`: Selector's xstyle lands on the trigger
            // box, while `width` sizes the whole field — which is what the
            // removed wrapper did.
            width={PAGE_SIZE_SELECTOR_WIDTH}
          />
        </div>
      )}
      <div {...stylex.props(styles.controls)}>
        {showFirstLast && (
          <Button
            label={firstLabel}
            tooltip={isDisabled || !hasPrevious ? undefined : firstLabel}
            variant="ghost"
            size={buttonSize}
            icon={
              <Icon
                icon="chevronsLeft"
                size={isSm ? 'sm' : 'md'}
                xstyle={rtlStyles.mirror}
              />
            }
            onClick={handleFirst}
            isDisabled={isDisabled || !hasPrevious}
            isIconOnly
            xstyle={variant === 'compact' && styles.compactFirst}
          />
        )}

        <Button
          label={previousLabel}
          tooltip={isDisabled || !hasPrevious ? undefined : previousLabel}
          variant="ghost"
          size={buttonSize}
          icon={
            <Icon
              icon="chevronLeft"
              size={isSm ? 'sm' : 'md'}
              xstyle={rtlStyles.mirror}
            />
          }
          onClick={handlePrevious}
          isDisabled={isDisabled || !hasPrevious}
          isIconOnly
        />

        {renderIndicator()}

        <Button
          label={nextLabel}
          tooltip={isDisabled || !hasNext ? undefined : nextLabel}
          variant="ghost"
          size={buttonSize}
          icon={
            <Icon
              icon="chevronRight"
              size={isSm ? 'sm' : 'md'}
              xstyle={rtlStyles.mirror}
            />
          }
          onClick={handleNext}
          isDisabled={isDisabled || !hasNext}
          isIconOnly
        />

        {showFirstLast && (
          <Button
            label={lastLabel}
            tooltip={isDisabled || !hasNext ? undefined : lastLabel}
            variant="ghost"
            size={buttonSize}
            icon={
              <Icon
                icon="chevronsRight"
                size={isSm ? 'sm' : 'md'}
                xstyle={rtlStyles.mirror}
              />
            }
            onClick={handleLast}
            isDisabled={isDisabled || !hasNext}
            isIconOnly
            xstyle={variant === 'compact' && styles.compactLast}
          />
        )}
      </div>
    </nav>
  );
}

Pagination.displayName = 'Pagination';
