// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file BaseTable.tsx
 * @input React, canonical identity/admission, private window planning and tracked row context
 * @output Exports BaseTable component and passes immutable transform contexts
 * @position Core structural component; wrapped by Table.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/Table.doc.mjs (component description, props)
 * - /packages/core/src/Table/Table.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Table/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/Table/ (showcase blocks)
 */

import {
  memo,
  useId,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  createTableRuntime,
  TableRuntimeContext,
  isTableScrollWrapperOwned,
} from './tableRuntime';
import {resolveTableIdentity, resolveTableAdmission} from './tableIdentity';
import {useTableWindow} from './plugins/virtualization/useTableWindow';
import {getTableVirtualizationConfig} from './plugins/virtualization/useTableRowsVirtualization';
import {TableContext} from './TableContext';
import {use} from 'react';
import {
  isFixedHeightColumn,
  getLogicalPositionExtraVar,
  getLogicalPositionRenderer,
  withLogicalPositionWidths,
} from './tableColumnAdmission';
import {isRenderable} from '../utils/isRenderable';
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
  TableRenderContext,
  TableRowContext,
  TableRowComponentProps,
  TableCellComponentProps,
  TableHeaderCellComponentProps,
} from './types';
import {
  generateColumns,
  defaultCellRenderer,
  resolveColumnFloorWidths,
  resolveColumnWidths,
  resolveTableMinWidth,
} from './columnUtils';
import {TableRow} from './TableRow';
import {TableCell} from './TableCell';
import {TableHeaderCell} from './TableHeaderCell';
import {TableHeader} from './TableHeader';
import {TableBody} from './TableBody';
import {mergeProps} from '../utils';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {
  readsRowCount,
  readsRowIndex,
  runPluginTransform,
  trackRowContext,
} from './tableRowContextUsage';
import {devError} from '../utils/devWarning';
import {useDevWarningPerMessage} from '../hooks/useDevWarning';
import {EmptyState} from '../EmptyState';
import {Text} from '../Text';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Table/BaseTable.generated';

registerEnglishFallback(english);

const styles = stylex.create({
  spacer: (height: number) => ({
    height,
    padding: 0,
    borderWidth: 0,
    lineHeight: 0,
  }),
  fixedRow: (height: number) => ({height}),
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

function applyRowPlugins<
  T extends Record<string, unknown>,
  TProps,
  TArgs extends unknown[],
>(
  plugins: TablePlugin<T>[],
  getter: (
    plugin: TablePlugin<T>,
  ) =>
    | ((props: TProps, ...args: [...TArgs, TableRowContext?]) => TProps)
    | undefined,
  initial: TProps,
  context: TableRowContext,
  ...args: TArgs
): TProps {
  return applyPlugins(
    plugins,
    plugin => {
      const transform = getter(plugin);
      return transform == null
        ? undefined
        : (props: TProps, ...values: TArgs) =>
            runPluginTransform(plugin, () =>
              transform(props, ...values, trackRowContext(plugin, context)),
            );
    },
    initial,
    ...args,
  );
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
  contextIdentity: {
    key: string | number | undefined;
    identityStatus: TableRowContext['identityStatus'];
  };
  renderContext: TableRenderContext;
  rowHeight?: number;
  onRowFocus?: (key: string | number, focusTarget?: HTMLElement) => void;
  onRowBlur?: () => void;
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
  columns,
  plugins,
  textOverflow,
  RowComponent,
  CellComponent,
  ariaRowIndex,
  contextIdentity,
  renderContext,
  rowHeight,
  onRowFocus,
  onRowBlur,
}: TableRowProps<T>): ReactElement {
  // Only mounted rows build a row context.
  const context = useMemo<TableRowContext>(
    () =>
      Object.freeze({
        key: contextIdentity.key,
        identityStatus: contextIdentity.identityStatus,
        kind: renderContext.rowModel === 'flat' ? 'product' : 'unknown',
        logicalIndex: rowIndex,
        logicalRowCount: renderContext.logicalRowCount,
        headerRowCount: renderContext.headerRowCount,
        render: renderContext,
      }),
    [contextIdentity, rowIndex, renderContext],
  );
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
    const cellRenderProps = applyRowPlugins(
      plugins,
      p => p.transformBodyCell,
      initialBodyCellRenderProps,
      context,
      col,
      item,
      columnIndex,
      columns,
    );

    const isDefaultRenderer = !col.renderCell;
    let rawContent: ReactNode = null;
    if (!cellRenderProps.isContentSuppressed) {
      const renderLogicalPosition =
        rowHeight == null ? undefined : getLogicalPositionRenderer(col);
      rawContent =
        renderLogicalPosition != null
          ? renderLogicalPosition(context.logicalIndex)
          : isDefaultRenderer
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
  const rowRenderProps = applyRowPlugins(
    plugins,
    p => p.transformBodyRow,
    {
      htmlProps: ariaRowIndex == null ? {} : {'aria-rowindex': ariaRowIndex},
      xstyle: [],
      children: <>{cells}</>,
    } satisfies BodyRowRenderProps,
    context,
    item,
    rowIndex,
  );

  const rowHtml = rowRenderProps.htmlProps;
  const row = (
    <RowComponent
      key={rowKey}
      ref={rowRenderProps.ref}
      {...rowHtml}
      data-table-logical-index={rowHeight == null ? undefined : rowIndex}
      data-table-final-row={
        rowHeight == null
          ? undefined
          : rowIndex === (context?.logicalRowCount ?? 0) - 1
            ? 'true'
            : 'false'
      }
      onFocus={
        onRowFocus == null
          ? rowHtml.onFocus
          : event => {
              rowHtml.onFocus?.(event);
              if (context?.key != null) {
                const view = event.currentTarget.ownerDocument.defaultView;
                const focusTarget =
                  view != null && event.target instanceof view.HTMLElement
                    ? event.target
                    : event.currentTarget;
                onRowFocus(context.key, focusTarget);
              }
            }
      }
      onBlur={
        onRowBlur == null
          ? rowHtml.onBlur
          : event => {
              rowHtml.onBlur?.(event);
              const leavesDocument =
                event.relatedTarget == null &&
                !event.currentTarget.ownerDocument.hasFocus();
              if (
                !leavesDocument &&
                !event.currentTarget.contains(event.relatedTarget)
              ) {
                onRowBlur();
              }
            }
      }
      xstyle={
        rowHeight == null
          ? rowRenderProps.xstyle
          : [...rowRenderProps.xstyle, styles.fixedRow(rowHeight)]
      }>
      {rowRenderProps.children}
    </RowComponent>
  );

  // A detail panel must not change the parent of an existing row.
  return (
    <>
      {row}
      {rowRenderProps.afterRow || null}
    </>
  );
}

/**
 * Compares TableRowProps to determine if re-render is needed.
 * Shallow compares the item object and checks if columns/plugins references changed.
 *
 * A windowed row and a transform that reads logical position need the current
 * row index. Otherwise a re-sort moves keyed rows without rebuilding cells.
 */
function areRowPropsEqual<T extends Record<string, unknown>>(
  prevProps: TableRowProps<T>,
  nextProps: TableRowProps<T>,
): boolean {
  if (
    prevProps.contextIdentity.key !== nextProps.contextIdentity.key ||
    prevProps.contextIdentity.identityStatus !==
      nextProps.contextIdentity.identityStatus ||
    (prevProps.renderContext !== nextProps.renderContext &&
      (prevProps.rowHeight != null ||
        nextProps.rowHeight != null ||
        prevProps.plugins.some(readsRowCount) ||
        prevProps.renderContext.mode !== nextProps.renderContext.mode ||
        prevProps.renderContext.rowModel !== nextProps.renderContext.rowModel ||
        prevProps.renderContext.headerRowCount !==
          nextProps.renderContext.headerRowCount ||
        prevProps.renderContext.viewport !==
          nextProps.renderContext.viewport)) ||
    prevProps.rowHeight !== nextProps.rowHeight ||
    prevProps.onRowFocus !== nextProps.onRowFocus ||
    prevProps.onRowBlur !== nextProps.onRowBlur
  ) {
    return false;
  }
  if (prevProps.rowKey !== nextProps.rowKey) {
    return false;
  }
  if (
    prevProps.rowIndex !== nextProps.rowIndex &&
    (prevProps.rowHeight != null ||
      nextProps.rowHeight != null ||
      nextProps.plugins.some(
        plugin => plugin.transformBodyRow != null || readsRowIndex(plugin),
      ))
  ) {
    return false;
  }
  const prevRender = prevProps.renderContext;
  const nextRender = nextProps.renderContext;
  if (
    prevRender !== nextRender &&
    (prevRender.mode !== nextRender.mode ||
      prevRender.rowModel !== nextRender.rowModel ||
      prevRender.headerRowCount !== nextRender.headerRowCount ||
      prevRender.viewport !== nextRender.viewport ||
      (prevRender.logicalRowCount !== nextRender.logicalRowCount &&
        nextProps.plugins.some(readsRowCount)))
  ) {
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
  textOverflow: textOverflowProp,
  virtualization,
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
  const t = useComponentTranslator();
  // Use stable empty array when no plugins provided
  const plugins = pluginsProp ?? (EMPTY_PLUGINS as TablePlugin<T>[]);

  // Admission is resolved before any section renders.
  const runtime = useMemo(() => createTableRuntime(), []);
  const admission = useMemo(() => resolveTableAdmission(plugins), [plugins]);
  const mode = children ? 'children' : 'data';
  const usesCanonicalIdentity = virtualization != null;
  const identityLength = data?.length ?? 0;
  const cachedIdentity = useMemo(
    () =>
      usesCanonicalIdentity && identityLength > 0
        ? resolveTableIdentity(data ?? [], idKey, true)
        : [],
    [data, identityLength, idKey, usesCanonicalIdentity],
  );
  const identity = usesCanonicalIdentity
    ? cachedIdentity
    : resolveTableIdentity(data ?? [], idKey, false);
  const keys = useMemo(
    () => identity.map((row, index) => row.key ?? index),
    [identity],
  );
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
  const headerRowCount = mode === 'data' && resolvedColumns.length > 0 ? 1 : 0;
  const config = getTableVirtualizationConfig(virtualization);
  const windowFallbackReason = useMemo(() => {
    if (virtualization != null && config == null) {
      return 'virtualization is not a value from useTableRowsVirtualization';
    }
    if (mode !== 'data') {
      return 'windowing requires data mode';
    }
    if (ScrollWrapper == null) {
      return 'windowing requires the Table scroll wrapper';
    }
    if (!isTableScrollWrapperOwned(ScrollWrapper)) {
      return 'windowing requires the Table-owned scroll wrapper';
    }
    if (admission.rowModel !== 'flat') {
      return "structural body modifiers must declare rowModel: 'flat' to admit windowing";
    }
    if (!identity.every(row => row.identityStatus === 'valid')) {
      return 'explicit unique valid row identity is required';
    }
    if (textOverflowProp === 'wrap') {
      return 'explicit wrapped content is not fixed-height';
    }
    if (rowIndexStart != null || rowCount != null) {
      return 'legacy row offsets or counts conflict with windowed metadata';
    }
    if (!resolvedColumns.every(isFixedHeightColumn)) {
      return 'a custom cell renderer has no fixed-height admission';
    }
    if (
      config == null ||
      !Number.isFinite(config.rowHeight) ||
      config.rowHeight <= 0 ||
      !Number.isFinite(config.initialViewportHeight) ||
      config.initialViewportHeight <= 0
    ) {
      return 'row and viewport geometry must be positive finite CSS pixels';
    }
    return undefined;
  }, [
    mode,
    ScrollWrapper,
    admission.rowModel,
    identity,
    textOverflowProp,
    rowIndexStart,
    rowCount,
    resolvedColumns,
    virtualization,
    config,
  ]);
  const windowAdmitted = windowFallbackReason === undefined;
  useDevWarningPerMessage(
    'Table',
    `Windowing disabled: ${windowFallbackReason}. Rendering all rows.`,
    virtualization != null && windowFallbackReason != null,
  );
  const logicalPositionColumns = useMemo(
    () =>
      new Set(
        resolvedColumns.flatMap((column, index) =>
          getLogicalPositionRenderer(column) == null ? [] : [index],
        ),
      ),
    [resolvedColumns],
  );
  const windowPlan = useTableWindow({
    capability: virtualization,
    data: data ?? [],
    keys,
    isAdmitted: windowAdmitted,
    logicalPositionColumns,
    viewport: runtime.viewport,
    body: runtime.body,
    table: runtime.table,
    geometry: runtime.geometry,
  });
  const renderContext = useMemo<TableRenderContext>(
    () =>
      Object.freeze({
        mode,
        rowModel: admission.rowModel,
        logicalRowCount: data?.length ?? 0,
        headerRowCount,
        viewport: runtime.viewport,
      }),
    [mode, admission, data?.length, headerRowCount, runtime],
  );
  const textOverflow =
    textOverflowProp ?? (windowPlan.isWindowed ? 'truncate' : 'wrap');

  // Resolve all column widths in a single pass — produces per-column
  // inline styles and the aggregate table min-width.
  // A windowed table widens its row-number columns to the width measured for
  // the last logical row, before that row mounts, so a number never clips.
  // Fixed layout sizes columns from the header, so rows keep their columns;
  // pinned offsets read the extra width from a table variable.
  const sizedColumns = withLogicalPositionWidths(
    resolvedColumns,
    windowPlan.logicalPositionWidths,
  );
  const resolvedWidths = resolveColumnWidths(sizedColumns);
  const logicalExtraStyle: Record<string, string> = {};
  if (sizedColumns !== resolvedColumns) {
    const floors = resolveColumnFloorWidths(resolvedColumns);
    const sizedFloors = resolveColumnFloorWidths(sizedColumns);
    sizedColumns.forEach((column, index) => {
      const extra =
        (sizedFloors.get(column.key) ?? 0) - (floors.get(column.key) ?? 0);
      if (extra > 0) {
        logicalExtraStyle[getLogicalPositionExtraVar(index)] = `${extra}px`;
      }
    });
  }

  // --- Plugin pipeline: table ---
  const tableRenderProps = applyPlugins(plugins, p => p.transformTable, {
    htmlProps: {},
    xstyle: children ? [styles.table, styles.tableAutoLayout] : [styles.table],
  } satisfies TableRenderProps);

  // --- Plugin pipeline: header cells ---
  const headerLabelIdBase = useId();
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

    const labelRow = isRenderable(after) ? (
      <div {...stylex.props(styles.headerLabelRow)}>
        {resolvedContent}
        {after}
      </div>
    ) : (
      resolvedContent
    );

    // The overlay is a control of its own. Keep its name and value out of the
    // header's name.
    const namesOwnHeader =
      isRenderable(overlay) &&
      mergedHtmlProps['aria-label'] == null &&
      mergedHtmlProps['aria-labelledby'] == null;
    const labelId = `${headerLabelIdBase}-label-${columnIndex}`;
    const belowId = `${headerLabelIdBase}-below-${columnIndex}`;
    const hasBelow = isRenderable(below);

    const headerInner = !hasSlots ? (
      resolvedContent
    ) : namesOwnHeader ? (
      <>
        {/* Inline, so the cell's text-overflow still reaches the label. */}
        <span id={labelId}>
          {before}
          {labelRow}
        </span>
        {overlay}
        {hasBelow && <div id={belowId}>{below}</div>}
      </>
    ) : (
      <>
        {before}
        {labelRow}
        {overlay}
        {below}
      </>
    );
    const headerNameProps = namesOwnHeader
      ? {'aria-labelledby': hasBelow ? `${labelId} ${belowId}` : labelId}
      : {};

    return (
      <HeaderCellComponent
        key={col.key}
        {...mergedHtmlProps}
        {...headerNameProps}
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
  const tableStyle: React.CSSProperties = {
    ...(resolvedWidths.tableMinWidth > 0
      ? {
          ...mergedStyle,
          minWidth: resolveTableMinWidth(
            mergedStyle.minWidth,
            resolvedWidths.tableMinWidth,
          ),
        }
      : mergedStyle),
    ...logicalExtraStyle,
  };

  let tableElement: ReactNode = (
    <table
      ref={useMergedRefs(ref, runtime.setTable)}
      {...(windowPlan.isWindowed
        ? {'aria-rowcount': headerRowCount + (data?.length ?? 0)}
        : ariaRowCount != null
          ? {'aria-rowcount': ariaRowCount}
          : null)}
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
                aria-rowindex={
                  windowPlan.isWindowed
                    ? 1
                    : headerRowRenderProps.htmlProps['aria-rowindex']
                }
                isHeaderRow
                xstyle={headerRowRenderProps.xstyle}>
                {headerRowRenderProps.children}
              </RowComponent>
            </TableHeader>
          )}
          <TableBody ref={runtime.setBody}>
            {hasData
              ? windowPlan.segments.flatMap<ReactNode>(segment => {
                  if (segment.type === 'gap') {
                    return [
                      <tr
                        key={`gap:${segment.start}:${segment.end}`}
                        aria-hidden="true">
                        <td
                          colSpan={resolvedColumns.length}
                          {...stylex.props(styles.spacer(segment.height))}
                        />
                      </tr>,
                    ];
                  }
                  const rows: ReactNode[] = [];
                  for (
                    let rowIndex = segment.start;
                    rowIndex < segment.end;
                    rowIndex++
                  ) {
                    const item = data[rowIndex];
                    const rowIdentity = identity[rowIndex];
                    rows.push(
                      <MemoizedTableRow<T>
                        key={rowIdentity.reactKey}
                        item={item}
                        rowIndex={rowIndex}
                        rowKey={rowIdentity.reactKey}
                        contextIdentity={rowIdentity}
                        renderContext={renderContext}
                        columns={resolvedColumns}
                        plugins={plugins}
                        textOverflow={textOverflow}
                        RowComponent={RowComponent}
                        CellComponent={CellComponent}
                        rowHeight={
                          windowPlan.isWindowed ? config?.rowHeight : undefined
                        }
                        onRowFocus={
                          windowPlan.isWindowed
                            ? windowPlan.onRowFocus
                            : undefined
                        }
                        onRowBlur={
                          windowPlan.isWindowed
                            ? windowPlan.onRowBlur
                            : undefined
                        }
                        ariaRowIndex={
                          windowPlan.isWindowed
                            ? headerRowCount + rowIndex + 1
                            : ariaRowIndexingEnabled
                              ? firstRowAriaIndex + rowIndex
                              : undefined
                        }
                      />,
                    );
                  }
                  return rows;
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
  const scrollWrapperRenderProps = ScrollWrapper
    ? applyPlugins(
        plugins,
        p => p.transformScrollWrapper,
        {
          htmlProps: {},
          xstyle: [],
        } satisfies ScrollWrapperRenderProps,
        renderContext,
      )
    : null;
  const scrollWrapperRef = useMergedRefs(
    runtime.setViewport,
    scrollWrapperRenderProps?.htmlProps.ref,
  );
  if (ScrollWrapper && scrollWrapperRenderProps) {
    tableElement = (
      <ScrollWrapper
        htmlProps={{
          ...scrollWrapperRenderProps.htmlProps,
          ref: scrollWrapperRef,
        }}
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

  const parentAppearance = use(TableContext);
  const effectiveAppearance = useMemo(
    () =>
      parentAppearance == null ? null : {...parentAppearance, textOverflow},
    [parentAppearance, textOverflow],
  );
  // A Table asked to window keeps its parent-sized scroll area when it falls
  // back, so a fallback costs rendering time, not layout. A caller-provided
  // scroll wrapper keeps its own sizing.
  const isBlockViewport =
    config != null &&
    ScrollWrapper != null &&
    isTableScrollWrapperOwned(ScrollWrapper);
  const runtimeValue = useMemo(
    () => ({...runtime, isBlockViewport}),
    [runtime, isBlockViewport],
  );
  return (
    <TableRuntimeContext value={runtimeValue}>
      {effectiveAppearance == null ? (
        tableElement
      ) : (
        <TableContext value={effectiveAppearance}>{tableElement}</TableContext>
      )}
    </TableRuntimeContext>
  );
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
