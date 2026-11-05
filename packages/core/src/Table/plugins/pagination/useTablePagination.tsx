// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTablePagination.tsx
 * @input React, Pagination, Table plugin types
 * @output Exports useTablePagination hook and config type
 * @position Pagination plugin; consumed by Table via plugins prop
 *
 * Returns a `TablePlugin` directly (same pattern as useTableSortable,
 * useTableSelection, useTableColumnSettings).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/plugins/pagination/index.ts (exports)
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../../../theme/tokens.stylex';
import {Pagination} from '../../../Pagination';
import type {PaginationProps} from '../../../Pagination';
import type {TablePlugin} from '../../types';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../../../i18n/useComponentTranslator';
import english from '../../../i18n/generated-english/Table/plugins/pagination/useTablePagination.generated';

registerEnglishFallback(english);

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    display: 'flex',
  },
  marginTop: {
    marginTop: spacingVars['--spacing-2'],
  },
  marginBottom: {
    marginBottom: spacingVars['--spacing-2'],
  },
  alignStart: {
    justifyContent: 'flex-start',
  },
  alignCenter: {
    justifyContent: 'center',
  },
  alignEnd: {
    justifyContent: 'flex-end',
  },
});

// =============================================================================
// Config Type
// =============================================================================

/**
 * Configuration for useTablePagination.
 *
 * The consumer owns all state. This hook renders pagination controls
 * around the table via `transformTableContext`.
 *
 * @example
 * ```
 * const [page, setPage] = useState(1);
 * const plugin = useTablePagination({
 *   page,
 *   onPageChange: setPage,
 *   totalItems: data.length,
 *   pageSize: 10,
 * });
 * <Table data={pageData} columns={columns} plugins={{ pagination: plugin }} />
 * ```
 */
export interface UseTablePaginationConfig {
  // --- Core (required) ---

  /** Current page number (1-based). */
  page: number;

  /** Called when the page changes. Consumer updates their own state. */
  onPageChange: (page: number) => void;

  // --- Data shape (provide one) ---

  /**
   * Total number of items across all pages.
   * Used to calculate total page count and "X\u2013Y of Z" display.
   * Takes precedence over `totalPages` if both are provided.
   */
  totalItems?: number;

  /**
   * Total number of pages. Use when you know the page count but not item count.
   */
  totalPages?: number;

  /**
   * Whether more pages exist after the current one.
   * Use for cursor-based pagination where the total is unknown.
   * Mutually exclusive with totalItems/totalPages.
   */
  hasMore?: boolean;

  // --- Page size ---

  /**
   * Number of items per page.
   * @default 10
   */
  pageSize?: number;

  /**
   * Called when the user changes the page size via the page size selector.
   * When provided alongside `pageSizeOptions`, a page size dropdown is shown.
   */
  onPageSizeChange?: (pageSize: number) => void;

  /**
   * Available page size options. Shows a page size selector when provided.
   * @example
   * ```
   * [10, 25, 50, 100]
   * ```
   */
  pageSizeOptions?: number[];

  // --- Display ---

  /**
   * Visual variant for the pagination controls.
   * Passed through to Pagination.
   * @default 'pages'
   */
  variant?: 'pages' | 'count' | 'compact' | 'dots' | 'none';

  /**
   * Size of the pagination controls.
   * @default 'md'
   */
  size?: 'sm' | 'md';

  /**
   * Where to render the pagination controls relative to the table.
   * - 'below' \u2014 renders pagination after the table (default)
   * - 'above' \u2014 renders pagination before the table
   * - 'both' \u2014 renders pagination above and below the table
   * - 'none' \u2014 does not auto-render; use Pagination manually
   *
   * @default 'below'
   */
  position?: 'below' | 'above' | 'both' | 'none';

  /**
   * Horizontal alignment of the pagination controls within their container.
   * - 'start' \u2014 left-aligned
   * - 'center' \u2014 centered (default)
   * - 'end' \u2014 right-aligned
   *
   * @default 'center'
   */
  align?: 'start' | 'center' | 'end';

  // --- Accessibility ---

  /**
   * Accessible label for the pagination nav landmark.
   * When `position` is 'both', the two navs get distinct names by suffixing
   * this label — "{label} (top)" above and "{label} (bottom)" below — so
   * same-type landmarks stay distinguishable to assistive technology.
   * @default 'Table pagination'
   */
  label?: string;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Pagination table plugin \u2014 renders Pagination controls around the table.
 *
 * Returns a `TablePlugin` directly (same pattern as `useTableSortable`,
 * `useTableSelection`, `useTableColumnSettings`).
 *
 * @example
 * ```
 * const [page, setPage] = useState(1);
 * const plugin = useTablePagination({
 *   page,
 *   onPageChange: setPage,
 *   totalItems: data.length,
 *   pageSize: 10,
 * });
 * <Table data={pageData} plugins={{ pagination: plugin }} />
 * ```
 */
export function useTablePagination<T extends Record<string, unknown>>(
  config: UseTablePaginationConfig,
): TablePlugin<T> {
  const t = useComponentTranslator();
  const {
    page,
    onPageChange,
    totalItems,
    totalPages: totalPagesProp,
    hasMore,
    pageSize: pageSizeConfig = 10,
    onPageSizeChange,
    pageSizeOptions,
    variant = 'pages',
    size = 'md',
    position = 'below',
    align = 'center',
    label: labelFromProps,
  } = config;
  const label = labelFromProps ?? t('@astryx.table.pagination.label');
  // position='both' renders two nav landmarks; suffix the base label so each
  // gets a unique accessible name (axe landmark-unique).
  const labelAbove = t('@astryx.table.pagination.labelAbove', {label});
  const labelBelow = t('@astryx.table.pagination.labelBelow', {label});

  // Same guard as Pagination itself: 0/NaN/negative pageSize would produce an
  // Infinity/NaN totalPages here, which bypasses Pagination's own coercion
  // because it is passed down as the explicit totalPages prop.
  const pageSize = Number.isFinite(pageSizeConfig)
    ? Math.max(1, Math.floor(pageSizeConfig))
    : 10;

  const computedTotalPages =
    totalPagesProp ??
    (totalItems != null ? Math.ceil(totalItems / pageSize) : undefined);

  // Build Pagination props
  const paginationProps: PaginationProps = {
    page,
    onChange: onPageChange,
    totalItems,
    totalPages: computedTotalPages,
    hasMore,
    pageSize,
    onPageSizeChange,
    pageSizeOptions,
    variant,
    size,
    label,
  };

  // Keep current config in a ref so the plugin can read the latest values
  // without needing to recreate the plugin object on every change.
  const configRef = useRef({
    paginationProps,
    position,
    align,
    labelAbove,
    labelBelow,
  });
  configRef.current = {
    paginationProps,
    position,
    align,
    labelAbove,
    labelBelow,
  };

  // Stable plugin object \u2014 created once, reads config via ref.
  return useMemo(
    (): TablePlugin<T> => ({
      transformTableContext(children: ReactNode): ReactNode {
        const {
          position: pos,
          paginationProps: props,
          align: a,
          labelAbove: above,
          labelBelow: below,
        } = configRef.current;
        if (pos === 'none') {
          return children;
        }

        // Don't render pagination when there's only one page and no more data.
        const resolvedTotalPages =
          props.totalPages ??
          (props.totalItems != null && props.pageSize != null
            ? Math.ceil(props.totalItems / props.pageSize)
            : undefined);
        const isSinglePage = resolvedTotalPages === 1 && props.hasMore !== true;
        if (isSinglePage) {
          return children;
        }

        const makeWrapper = (side: 'above' | 'below') => (
          <div
            {...stylex.props(
              styles.wrapper,
              side === 'below' && styles.marginTop,
              side === 'above' && styles.marginBottom,
              a === 'center' && styles.alignCenter,
              a === 'end' && styles.alignEnd,
              a === 'start' && styles.alignStart,
            )}>
            <Pagination
              {...props}
              // Two navs with the same name are indistinguishable landmarks;
              // give each side a unique name when both render.
              label={
                pos === 'both'
                  ? side === 'above'
                    ? above
                    : below
                  : props.label
              }
            />
          </div>
        );

        return (
          <>
            {(pos === 'above' || pos === 'both') && makeWrapper('above')}
            {children}
            {(pos === 'below' || pos === 'both') && makeWrapper('below')}
          </>
        );
      },
    }),
    [],
  );
}
