// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableInfinityVirtualization.tsx
 * @input A fixed-size table with row and column providers indexed by position
 * @output Bounded data and an ordinary Table plugin with two logical scroll axes
 * @position Experimental Table windowing in Lab; stable Table stays unchanged
 */
import {useCallback, useId, useMemo, useRef, type ComponentProps} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  pixel,
  type TableColumn,
  type TablePlugin,
  type TableProps,
} from '@astryxdesign/core/Table';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import {InfinityScrollbar} from './InfinityScrollbar';
import {
  endPosition,
  jumpToItem,
  scrollFraction,
  type ScrollGeometry,
} from './scrollWindow';
import {useTableInfinityScroll} from './useTableInfinityScroll';

const styles = stylex.create({
  frame: {
    display: 'grid',
    gridTemplateColumns: `minmax(0, 1fr) ${spacingVars['--spacing-3']}`,
    gridTemplateRows: 'minmax(0, 1fr) auto',
    justifySelf: 'start',
  },
  viewport: {overflow: 'clip'},
  height: (height: number) => ({blockSize: height}),
  frameWidth: (width: number) => ({
    inlineSize: `calc(${width}px + ${spacingVars['--spacing-3']})`,
  }),
  tableWidth: (width: number) => ({inlineSize: width}),
  cell: {boxSizing: 'border-box', paddingBlock: 0},
  header: {
    position: 'relative',
    zIndex: 1,
    backgroundColor: colorVars['--color-background-surface'],
  },
});

function Viewport({
  children,
  htmlProps,
  xstyle,
  beforeTable,
  afterTable,
}: ComponentProps<
  NonNullable<TableProps<Record<string, unknown>>['scrollWrapper']>
>) {
  const {style, className, ...props} = htmlProps ?? {};
  return (
    <div
      {...props}
      {...mergeProps(
        stylex.props(styles.viewport, ...(xstyle ?? [])),
        className,
        style,
      )}>
      {beforeTable}
      {children}
      {afterTable}
    </div>
  );
}

interface TableInfinityOptions<T extends Record<string, unknown>> {
  rowCount: number;
  columnCount: number;
  rowHeight: number;
  columnWidth: number;
  viewportWidth: number;
  /** Body viewport only; the header stays above it. */
  viewportHeight: number;
  headerHeight: number;
  direction?: 'ltr' | 'rtl';
  viewportLabel: string;
  rowScrollbarLabel: string;
  columnScrollbarLabel: string;
  getRow: (index: number) => T;
  getColumn: (index: number) => TableColumn<T>;
}

function validateAxis({itemCount, itemHeight, viewportHeight}: ScrollGeometry) {
  if (
    !Number.isInteger(itemCount) ||
    itemCount < 1 ||
    itemCount > 1_000_000_000 ||
    !Number.isInteger(itemHeight) ||
    itemHeight <= 0 ||
    itemHeight > 65_536 ||
    !Number.isInteger(viewportHeight) ||
    viewportHeight <= 0 ||
    viewportHeight > 65_536
  ) {
    throw new RangeError(
      'Table Infinity requires a positive count and fixed, whole-pixel geometry.',
    );
  }
}

function thumbSize({itemCount, itemHeight, viewportHeight}: ScrollGeometry) {
  return Math.min(
    viewportHeight,
    Math.max(24, viewportHeight ** 2 / (itemCount * itemHeight)),
  );
}

/** Lab prototype for a read-only, fixed-pitch Table. Keep geometry fixed for a mount. */
export function useTableInfinityVirtualization<
  T extends Record<string, unknown>,
>({
  rowCount,
  columnCount,
  rowHeight,
  columnWidth,
  viewportWidth,
  viewportHeight,
  headerHeight,
  direction = 'ltr',
  viewportLabel,
  rowScrollbarLabel,
  columnScrollbarLabel,
  getRow,
  getColumn,
}: TableInfinityOptions<T>) {
  const axes = useMemo(() => {
    const row = {itemCount: rowCount, itemHeight: rowHeight, viewportHeight};
    const column = {
      itemCount: columnCount,
      itemHeight: columnWidth,
      viewportHeight: viewportWidth,
    };
    validateAxis(row);
    validateAxis(column);
    const rows = Math.min(rowCount, Math.ceil(viewportHeight / rowHeight) + 9);
    const columns = Math.min(
      columnCount,
      Math.ceil(viewportWidth / columnWidth) + 9,
    );
    if ((rows + 1) * columns > 16_384) {
      throw new RangeError(
        'Table Infinity viewport exceeds the mounted cell budget.',
      );
    }
    return {row, column};
  }, [
    rowCount,
    columnCount,
    rowHeight,
    columnWidth,
    viewportHeight,
    viewportWidth,
  ]);
  if (
    !Number.isInteger(headerHeight) ||
    headerHeight <= 0 ||
    headerHeight > 65_536
  ) {
    throw new RangeError(
      'Table Infinity requires a positive whole-pixel header height.',
    );
  }

  const id = useId();
  const table = useRef<HTMLTableElement>(null);
  const rowThumb = useRef<HTMLDivElement>(null);
  const columnThumb = useRef<HTMLDivElement>(null);
  const rowSize = thumbSize(axes.row);
  const columnSize = thumbSize(axes.column);
  const sign = direction === 'rtl' ? -1 : 1;
  const paint: Parameters<typeof useTableInfinityScroll>[2] = useCallback(
    (position, range) => {
      const node = table.current;
      const body = node?.tBodies[0];
      if (!node || !body) {
        return;
      }
      const dx =
        (position.column.index - range.column.start) * columnWidth +
        position.column.offset;
      const dy =
        (position.row.index - range.row.start) * rowHeight +
        position.row.offset;
      node.style.translate = `${-sign * dx}px 0px`;
      body.style.translate = `0px ${-dy}px`;
      for (const [axis, thumb, size] of [
        ['row', rowThumb.current, rowSize],
        ['column', columnThumb.current, columnSize],
      ] as const) {
        if (thumb) {
          const geometry = axes[axis];
          const offset =
            scrollFraction(geometry, position[axis]) *
            (geometry.viewportHeight - size);
          thumb.style.setProperty(
            '--infinity-thumb-offset',
            `${axis === 'column' ? sign * offset : offset}px`,
          );
          const value = String(position[axis].index);
          if (thumb.getAttribute('aria-valuenow') !== value) {
            thumb.setAttribute('aria-valuenow', value);
          }
        }
      }
    },
    [axes, columnSize, columnWidth, rowHeight, rowSize, sign],
  );

  const {range, attach, navigate, navigateAxis, moveAxis, readPosition} =
    useTableInfinityScroll(axes, direction, paint);
  const data = useMemo(
    () =>
      Array.from({length: range.row.end - range.row.start}, (_, i) =>
        getRow(range.row.start + i),
      ),
    [getRow, range.row],
  );
  const columns = useMemo(
    () =>
      Array.from({length: range.column.end - range.column.start}, (_, i) => ({
        ...getColumn(range.column.start + i),
        width: pixel(columnWidth),
      })),
    [getColumn, range.column, columnWidth],
  );

  const plugin = useMemo<TablePlugin<T>>(
    () => ({
      rowModel: 'flat',
      transformTable: render => ({
        ...render,
        htmlProps: {...render.htmlProps, 'aria-colcount': columnCount},
        xstyle: [
          ...render.xstyle,
          styles.tableWidth(columns.length * columnWidth),
        ],
      }),
      transformHeaderRow: render => ({
        ...render,
        htmlProps: {...render.htmlProps, 'aria-rowindex': 1},
        xstyle: [...render.xstyle, styles.header, styles.height(headerHeight)],
      }),
      transformHeaderCell: (render, _column, index) => ({
        ...render,
        htmlProps: {
          ...render.htmlProps,
          'aria-colindex': range.column.start + index + 1,
        },
        xstyle: [...render.xstyle, styles.cell],
      }),
      transformBodyCell: (render, _column, _row, index) => ({
        ...render,
        htmlProps: {
          ...render.htmlProps,
          'aria-colindex': range.column.start + index + 1,
        },
        xstyle: [...render.xstyle, styles.cell],
      }),
      transformBodyRow: render => ({
        ...render,
        xstyle: [...render.xstyle, styles.height(rowHeight)],
      }),
      transformScrollWrapper: render => ({
        ...render,
        htmlProps: {
          ...render.htmlProps,
          id,
          role: 'group',
          'aria-label': viewportLabel,
        },
        xstyle: [
          ...render.xstyle,
          styles.height(viewportHeight + headerHeight),
        ],
      }),
      transformTableContext: content => (
        <div
          dir={direction}
          ref={attach}
          {...stylex.props(styles.frame, styles.frameWidth(viewportWidth))}>
          {content}
          {(['row', 'column'] as const).map(axis => {
            const end = endPosition(axes[axis]);
            const vertical = axis === 'row';
            if (end.index === 0 && end.offset === 0) {
              return <div key={axis} aria-hidden="true" />;
            }
            return (
              <InfinityScrollbar
                key={axis}
                orientation={vertical ? 'vertical' : 'horizontal'}
                direction={direction}
                geometry={axes[axis]}
                controls={id}
                label={vertical ? rowScrollbarLabel : columnScrollbarLabel}
                thumbHeight={vertical ? rowSize : columnSize}
                thumbRef={vertical ? rowThumb : columnThumb}
                navigate={next => navigateAxis(axis, next)}
                move={delta => moveAxis(axis, delta)}
                readFraction={() =>
                  scrollFraction(axes[axis], readPosition(axis))
                }
              />
            );
          })}
        </div>
      ),
    }),
    [
      attach,
      axes,
      columnCount,
      columnScrollbarLabel,
      columnSize,
      columnWidth,
      columns.length,
      direction,
      headerHeight,
      id,
      moveAxis,
      navigateAxis,
      range.column.start,
      readPosition,
      rowHeight,
      rowScrollbarLabel,
      rowSize,
      viewportHeight,
      viewportLabel,
      viewportWidth,
    ],
  );

  const tableProps = {
    ref: table,
    data,
    columns,
    rowCount: rowCount + 1,
    rowIndexStart: range.row.start + 2,
    plugins: {infinity: plugin},
    scrollWrapper: Viewport,
    textOverflow: 'truncate',
    dividers: 'none',
  } satisfies Partial<TableProps<T>>;
  return {
    tableProps,
    scrollToCell(rowIndex: number, columnIndex: number) {
      if (Number.isSafeInteger(rowIndex) && Number.isSafeInteger(columnIndex)) {
        navigate({
          row: jumpToItem(axes.row, rowIndex),
          column: jumpToItem(axes.column, columnIndex),
        });
      }
    },
  };
}
