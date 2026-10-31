// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file BaseTable.tsx
 * @input React, types.ts, columnUtils.ts
 * @output Exports BaseTable component
 * @position Core structural component; wrapped by Table.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/Table.doc.mjs (component description, props)
 * - /packages/core/src/Table/Table.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Table/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/Table/ (showcase blocks)
 */

import {memo, useRef, type ReactElement, type ReactNode, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {
  BaseTableProps,
  TableColumn,
  TablePlugin,
  TableRenderProps,
  HeaderRowRenderProps,
  HeaderCellRenderProps,
  BodyRowRenderProps,
  BodyCellRenderProps,
  ScrollWrapperRenderProps,
  TableRowComponentProps,
  TableCellComponentProps,
  TableHeaderCellComponentProps,
} from './types';
import {
  generateColumns,
  defaultCellRenderer,
  resolveColumnWidths,
  resolveTableMinWidth,
} from './columnUtils';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import {TableHeaderCell} from './TableHeaderCell';
import {TableHeader} from './TableHeader';
import {TableBody} from './TableBody';
import {mergeProps} from '../utils';
import {devError} from '../utils/devWarning';
import {EmptyState} from '../EmptyState';
import {Text} from '../Text';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

const styles = stylex.create({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    borderSpacing: '0',
    tableLayout: 'fixed',
  },
  tableAutoLayout: {
    tableLayout: 'auto',
  },
  /**
   * Inline flex row that keeps the header label and any "after" slot content
   * (sort icons, filter buttons, etc.) on the same line with a small gap.
   * Applied only when `after` is present so plain cells are unaffected.
   */
  headerLabelRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
  },
});

/**
 * Run a value through a pipeline of plugin transform functions.
 * Wraps each transform in a try-catch so a single broken plugin
 * doesn't crash the entire table. In development, logs a warning
 * with the plugin index and error details.
 */
function applyPlugins<TPlugin, TProps, TArgs extends unknown[]>(
  plugins: TPlugin[],
  getter: (
    p: TPlugin,
  ) => ((props: TProps, ...args: TArgs) => TProps) | undefined,
  initial: TProps,
  ...args: TArgs
): TProps {
  return plugins.reduce<TProps>((acc, plugin, index) => {
    const transform = getter(plugin);
    if (!transform) {
      return acc;
    }
    try {
      return transform(acc, ...args);
    } catch (error) {
      devError('Table', `Plugin at index ${index} threw in transform:`, error);
      return acc;
    }
  }, initial);
}

// =============================================================================
// Memoized Table Row Component
// =============================================================================

// Stable empty array to avoid creating new reference on each render
const EMPTY_PLUGINS: TablePlugin<Record<string, unknown>>[] = [];

/**
 * Shallow-compare two arrays by element identity.
 * Used to stabilize the resolved columns array across renders.
 */
function areArraysShallowEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

interface TableRowProps<T extends Record<string, unknown>> {
  item: T;
  rowIndex: number;
  rowKey: string | number;
  /**
   * The resolved canonical key for plugin consumption (`transformBodyRow`'s
   * fourth argument). `undefined` when the table has no explicit `idKey` —
   * index-keyed rows carry no stable identity, so identity-dependent plugins
   * stay inert instead of keying by position.
   */
  resolvedRowKey: string | number | undefined;
  columns: TableColumn<T>[];
  plugins: TablePlugin<T>[];
  textOverflow: 'wrap' | 'truncate';
  RowComponent: React.ComponentType<TableRowComponentProps>;
  CellComponent: React.ComponentType<TableCellComponentProps>;
  /**
   * 1-based ARIA row index for this row's position in the full dataset.
   * `undefined` when the table hasn't opted into ARIA row indexing, in which
   * case no `aria-rowindex` is emitted (native table semantics).
   */
  ariaRowIndex?: number;
}

/**
 * Memoized table row component.
 * Only re-renders when the specific row's data changes.
 * Uses component props for context-based styling, with plugin support.
 */
function TableRowInner<T extends Record<string, unknown>>({
  item,
  rowIndex,
  rowKey,
  resolvedRowKey,
  columns,
  plugins,
  textOverflow,
  RowComponent,
  CellComponent,
  ariaRowIndex,
}: TableRowProps<T>): ReactElement {
  // Build cells first
  const cells = columns.map((col, columnIndex) => {
    // Apply column alignment to body cells
    const initialCellHtmlProps: Record<string, unknown> = {};
    if (col.align) {
      initialCellHtmlProps.style = {textAlign: col.align};
    }

    const initialBodyCellRenderProps: BodyCellRenderProps = {
      htmlProps: initialCellHtmlProps,
      xstyle: [],
      columnIndex,
      columns: columns as ReadonlyArray<TableColumn<Record<string, unknown>>>,
    };
    const cellRenderProps = applyPlugins(
      plugins,
      p => p.transformBodyCell,
      initialBodyCellRenderProps,
      col,
      item,
      columnIndex,
      columns,
    );

    const isDefaultRenderer = !col.renderCell;
    let rawContent: ReactNode = null;
    if (!cellRenderProps.isContentSuppressed) {
      rawContent = isDefaultRenderer
        ? defaultCellRenderer(item, col.key)
        : (col.renderCell?.(item) ?? null);
    }

    // In truncate mode, wrap default-rendered string content in
    // <Text maxLines={1}> for smart tooltips that only appear
    // when text is actually overflowing. In wrap mode (default),
    // content renders as-is — the cell's CSS handles wrapping.
    let content: ReactNode;
    if (
      isDefaultRenderer &&
      textOverflow === 'truncate' &&
      typeof rawContent === 'string' &&
      rawContent.length > 0
    ) {
      content = (
        <Text type="body" maxLines={1}>
          {rawContent}
        </Text>
      );
    } else {
      content = rawContent;
    }

    return (
      <CellComponent
        key={col.key}
        {...cellRenderProps.htmlProps}
        contextMenuActions={cellRenderProps.contextMenuActions}
        xstyle={cellRenderProps.xstyle}>
        {content}
      </CellComponent>
    );
  });

  // Apply plugin transforms for row (with pre-rendered children).
  // Seed `aria-rowindex` (when the table opts into ARIA row indexing) as a
  // base htmlProp so plugins compose over it and can still override.
  const rowRenderProps = applyPlugins(
    plugins,
    p => p.transformBodyRow,
    {
      htmlProps: ariaRowIndex == null ? {} : {'aria-rowindex': ariaRowIndex},
      xstyle: [],
      children: <>{cells}</>,
    } satisfies BodyRowRenderProps,
    item,
    rowIndex,
    resolvedRowKey,
  );

  const row = (
    <RowComponent
      key={rowKey}
      ref={rowRenderProps.ref}
      {...rowRenderProps.htmlProps}
      xstyle={rowRenderProps.xstyle}>
      {rowRenderProps.children}
    </RowComponent>
  );

  // afterRow: plugins (e.g. row expansion) can append a full-width detail
  // panel `<tr>` after the row. Rendered as a sibling fragment.
  if (rowRenderProps.afterRow) {
    return (
      <>
        {row}
        {rowRenderProps.afterRow}
      </>
    );
  }

  return row;
}

/**
 * Compares TableRowProps to determine if re-render is needed.
 * Shallow compares the item object and checks if columns/plugins references changed.
 *
 * Includes rowIndex in the comparison so that plugins using the index
 * (e.g. for row numbering or conditional formatting) get correct values
 * after insertions/deletions. This also future-proofs for tree grid
 * index paths where structural position matters.
 */
function areRowPropsEqual<T extends Record<string, unknown>>(
  prevProps: TableRowProps<T>,
  nextProps: TableRowProps<T>,
): boolean {
  if (prevProps.rowKey !== nextProps.rowKey) {
    return false;
  }
  if (prevProps.resolvedRowKey !== nextProps.resolvedRowKey) {
    return false;
  }
  if (prevProps.rowIndex !== nextProps.rowIndex) {
    return false;
  }
  if (prevProps.ariaRowIndex !== nextProps.ariaRowIndex) {
    return false;
  }

  if (prevProps.columns !== nextProps.columns) {
    return false;
  }
  if (prevProps.plugins !== nextProps.plugins) {
    return false;
  }
  if (prevProps.textOverflow !== nextProps.textOverflow) {
    return false;
  }
  if (prevProps.RowComponent !== nextProps.RowComponent) {
    return false;
  }
  if (prevProps.CellComponent !== nextProps.CellComponent) {
    return false;
  }

  // Shallow compare the item - if same reference, skip re-render
  if (prevProps.item === nextProps.item) {
    return true;
  }

  // Different object reference - compare values. This is intentionally a
  // one-level shallow compare: nested fields rely on reference identity.
  const prevItem = prevProps.item;
  const nextItem = nextProps.item;
  const keys = Object.keys(nextItem);

  // A key deleted from nextItem would never be visited by the loop below,
  // and the row would keep rendering the removed field's stale value.
  if (Object.keys(prevItem).length !== keys.length) {
    return false;
  }

  for (const key of keys) {
    if (prevItem[key] !== nextItem[key]) {
      return false;
    }
  }

  return true;
}

// Create the memoized component
const MemoizedTableRow = memo(TableRowInner, areRowPropsEqual) as <
  T extends Record<string, unknown>,
>(
  props: TableRowProps<T>,
) => ReactElement;

// =============================================================================
// BaseTable Component
// =============================================================================

/**
 * Inner BaseTable implementation (generic-preserving).
 */
function BaseTableInner<T extends Record<string, unknown>>({
  data,
  columns: columnsProp,
  idKey,
  plugins: pluginsProp,
  children,
  textOverflow = 'wrap',
  scrollWrapper: ScrollWrapper,
  emptyState,
  rowIndexStart,
  rowCount,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: BaseTableProps<T> & {ref?: Ref<HTMLTableElement>}): ReactElement {
  const t = useTranslator();
  // Use stable empty array when no plugins provided
  const plugins = pluginsProp ?? (EMPTY_PLUGINS as TablePlugin<T>[]);

  // ARIA row indexing. The row ordinal is an accessibility concern that is
  // independent of any visible index column: when the consumer opts in (by
  // passing rowIndexStart or rowCount), body rows carry `aria-rowindex`
  // reflecting their position in the full dataset, and the <table> carries
  // `aria-rowcount`. `aria-rowindex` is 1-based and counts data rows from
  // `rowIndexStart` (default 1); a windowed/paginated view passes the offset
  // of its first visible row. `aria-rowcount` is `rowCount` when known, or
  // `-1` (ARIA's "unknown count") for a windowed view with an unknown total.
  const ariaRowIndexingEnabled = rowIndexStart != null || rowCount != null;
  const firstRowAriaIndex = rowIndexStart ?? 1;
  const ariaRowCount = ariaRowIndexingEnabled ? (rowCount ?? -1) : undefined;

  const RowComponent = TableRow as React.ComponentType<TableRowComponentProps>;
  const CellComponent =
    TableCell as React.ComponentType<TableCellComponentProps>;
  const HeaderCellComponent =
    TableHeaderCell as React.ComponentType<TableHeaderCellComponentProps>;

  // Resolve columns: explicit > auto-generated from data.
  const baseColumns: TableColumn<T>[] =
    columnsProp ?? (data ? generateColumns(data) : []);

  // --- Plugin pipeline: transformColumns ---
  // Runs before any element-level transforms. Allows plugins to filter,
  // reorder, or inject synthetic columns (e.g. selection checkbox).
  const transformedColumns = applyPlugins(
    plugins,
    p => p.transformColumns,
    baseColumns,
  );

  // Stabilize the resolved columns array — transformColumns returns a
  // new array on every call, but if the contents haven't changed, we
  // reuse the previous reference. This prevents MemoizedTableRow from
  // re-rendering all rows when the column array is structurally identical.
  const resolvedColumnsRef = useRef(transformedColumns);
  if (!areArraysShallowEqual(resolvedColumnsRef.current, transformedColumns)) {
    resolvedColumnsRef.current = transformedColumns;
  }
  const resolvedColumns = resolvedColumnsRef.current;

  // Resolve all column widths in a single pass — produces per-column
  // inline styles and the aggregate table min-width.
  const resolvedWidths = resolveColumnWidths(resolvedColumns);

  // --- Plugin pipeline: table ---
  const tableRenderProps = applyPlugins(plugins, p => p.transformTable, {
    htmlProps: {},
    xstyle: children ? [styles.table, styles.tableAutoLayout] : [styles.table],
  } satisfies TableRenderProps);

  // --- Plugin pipeline: header cells ---
  const headerCells = resolvedColumns.map((col, columnIndex) => {
    const headerContent = col.header ?? col.key;

    // Build initial htmlProps with column alignment if specified.
    // `scope: 'col'` is the default so every column header associates its
    // data cells with the correct column for screen readers; a plugin's
    // transformHeaderCell can override it via htmlProps.scope.
    const initialHeaderHtmlProps: Record<string, unknown> = {
      'data-column-key': col.key,
      scope: 'col',
    };
    if (col.align) {
      initialHeaderHtmlProps.style = {textAlign: col.align};
    }

    const initialHeaderRenderProps: HeaderCellRenderProps = {
      htmlProps: initialHeaderHtmlProps,
      xstyle: [],
      content: headerContent,
      columnIndex,
      columns: resolvedColumns as ReadonlyArray<
        TableColumn<Record<string, unknown>>
      >,
    };
    const cellRenderProps = applyPlugins(
      plugins,
      p => p.transformHeaderCell,
      initialHeaderRenderProps,
      col,
      columnIndex,
      resolvedColumns,
    );

    // Apply pre-computed column width styles on the <th>.
    // With table-layout: fixed, header cell sizing controls column widths.
    const widthStyle = resolvedWidths.columns.get(col.key)?.style ?? {};

    const existingStyle = cellRenderProps.htmlProps.style;
    const mergedHtmlProps = {
      ...cellRenderProps.htmlProps,
      style: existingStyle ? {...widthStyle, ...existingStyle} : widthStyle,
    };

    // Resolve header content from slots — plugins write to named slots
    // to avoid conflicts (e.g. sort writes `after`, resize writes `overlay`)
    const resolvedContent = cellRenderProps.content ?? headerContent;
    const headerTitleProp =
      typeof resolvedContent === 'string' && resolvedContent.length > 0
        ? {title: resolvedContent}
        : {};
    const {before, after, overlay, below} = cellRenderProps;
    const hasSlots =
      before != null || after != null || overlay != null || below != null;

    const headerInner = hasSlots ? (
      <>
        {before}
        {after != null ? (
          <div {...stylex.props(styles.headerLabelRow)}>
            {resolvedContent}
            {after}
          </div>
        ) : (
          resolvedContent
        )}
        {overlay}
        {below}
      </>
    ) : (
      resolvedContent
    );

    return (
      <HeaderCellComponent
        key={col.key}
        {...mergedHtmlProps}
        {...headerTitleProp}
        contextMenuActions={cellRenderProps.contextMenuActions}
        xstyle={cellRenderProps.xstyle}>
        {headerInner}
      </HeaderCellComponent>
    );
  });

  // --- Plugin pipeline: header row ---
  const headerRowRenderProps = applyPlugins(
    plugins,
    p => p.transformHeaderRow,
    {
      htmlProps: {},
      xstyle: [],
      children: <>{headerCells}</>,
    } satisfies HeaderRowRenderProps,
  );

  // --- Render ---
  const hasData = data != null && data.length > 0;
  const hasColumns = resolvedColumns.length > 0;

  // The table is at least as wide as the column floors require and at least
  // as wide as any minWidth the consumer (or a plugin) set: whichever is
  // larger wins, so column floors never shrink a consumer's minimum.
  const mergedStyle: React.CSSProperties = {
    ...tableRenderProps.htmlProps.style,
    ...style,
  };
  const tableStyle: React.CSSProperties =
    resolvedWidths.tableMinWidth > 0
      ? {
          ...mergedStyle,
          minWidth: resolveTableMinWidth(
            mergedStyle.minWidth,
            resolvedWidths.tableMinWidth,
          ),
        }
      : mergedStyle;

  let tableElement: ReactNode = (
    <table
      ref={ref}
      {...(ariaRowCount != null ? {'aria-rowcount': ariaRowCount} : null)}
      {...tableRenderProps.htmlProps}
      {...mergeProps(
        themeProps('table'),
        stylex.props(...tableRenderProps.xstyle, xstyle),
        [tableRenderProps.htmlProps.className, className]
          .filter(Boolean)
          .join(' ') || undefined,
        tableStyle,
      )}
      {...rest}>
      {children ? (
        children
      ) : (
        <>
          {hasColumns && (
            <TableHeader>
              <RowComponent
                {...headerRowRenderProps.htmlProps}
                isHeaderRow
                xstyle={headerRowRenderProps.xstyle}>
                {headerRowRenderProps.children}
              </RowComponent>
            </TableHeader>
          )}
          <TableBody>
            {hasData
              ? data.map((item, rowIndex) => {
                  const rowKey =
                    idKey == null
                      ? rowIndex
                      : typeof idKey === 'function'
                        ? idKey(item)
                        : String(item[idKey]);
                  return (
                    <MemoizedTableRow<T>
                      key={rowKey}
                      item={item}
                      rowIndex={rowIndex}
                      rowKey={rowKey}
                      resolvedRowKey={idKey == null ? undefined : rowKey}
                      columns={resolvedColumns}
                      plugins={plugins}
                      textOverflow={textOverflow}
                      RowComponent={RowComponent}
                      CellComponent={CellComponent}
                      ariaRowIndex={
                        ariaRowIndexingEnabled
                          ? firstRowAriaIndex + rowIndex
                          : undefined
                      }
                    />
                  );
                })
              : data != null &&
                emptyState !== false && (
                  <tr>
                    <td colSpan={resolvedColumns.length}>
                      {emptyState ?? (
                        <EmptyState
                          title={t('@astryx.table.noData')}
                          isCompact
                        />
                      )}
                    </td>
                  </tr>
                )}
          </TableBody>
        </>
      )}
    </table>
  );

  // Wrap the <table> in a scroll container so it scrolls horizontally
  // when columns exceed the container width. This wrapper sits between
  // the <table> and transformTableContext, so plugin chrome (pagination,
  // toolbars) renders outside the scroll area.
  //
  // Before rendering the wrapper, run the plugin `transformScrollWrapper`
  // pipeline so plugins can attach a ref to the scroll container (scroll-aware
  // sticky shadows, virtualization) and inject before/after chrome.
  if (ScrollWrapper) {
    const scrollWrapperRenderProps = applyPlugins(
      plugins,
      p => p.transformScrollWrapper,
      {
        htmlProps: {},
        xstyle: [],
      } satisfies ScrollWrapperRenderProps,
    );

    tableElement = (
      <ScrollWrapper
        htmlProps={scrollWrapperRenderProps.htmlProps}
        xstyle={scrollWrapperRenderProps.xstyle}
        beforeTable={scrollWrapperRenderProps.beforeTable}
        afterTable={scrollWrapperRenderProps.afterTable}>
        {tableElement}
      </ScrollWrapper>
    );
  }

  // Apply transformTableContext from each plugin.
  // Iterates in reverse so the first plugin in the array wraps outermost,
  // matching the mental model: plugins are listed in priority order, and
  // the first plugin's context provider encompasses all others.
  for (let i = plugins.length - 1; i >= 0; i--) {
    const plugin = plugins[i];
    if (plugin.transformTableContext) {
      try {
        tableElement = plugin.transformTableContext(tableElement);
      } catch (error) {
        devError('Table', 'Plugin threw in transformTableContext:', error);
      }
    }
  }

  return tableElement as ReactElement;
}

/**
 * BaseTable — an unstyled, generic `<table>` component.
 *
 * Supports data-driven rendering (via `data` + `columns`) and children mode.
 * Applies plugins as a transform pipeline over render props.
 * Accepts a `components` prop to render styled components instead of raw elements.
 *
 * @example
 * ```
 * <BaseTable
 *   data={[{ name: 'Alice', age: 30 }]}
 *   columns={[
 *     { key: 'name', header: 'Name' },
 *     { key: 'age', header: 'Age', width: pixel(80) },
 *   ]}
 * />
 * ```
 */
export const BaseTable = BaseTableInner as <T extends Record<string, unknown>>(
  props: BaseTableProps<T> & {ref?: Ref<HTMLTableElement>},
) => ReactElement;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BaseTable as any).displayName = 'BaseTable';
