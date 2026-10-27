// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableRowExpansion.tsx
 * @input React, StyleX, Icon, Table types, table context (density), i18n
 *   (useTranslator)
 * @output Exports useTableRowExpansion hook + config type
 * @position Row-expansion plugin (detail panel); consumed by Table via plugins prop
 *
 * Expands a full-width detail panel below a row, rendered by the consumer's
 * `renderExpanded(item)`. For hierarchical/tree tables (child rows that reuse
 * the parent columns) use `useTableTreeData` + `useTableTreeState` instead.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/index.ts (exports)
 * - /packages/core/src/Table/useTableRowExpansion.doc.mjs
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  spacingVars,
  colorVars,
  radiusVars,
  borderVars,
  durationVars,
  easeVars,
} from '../../../theme/tokens.stylex';
import {tableRowMarker} from '../../table.stylex';
import {panelDividerFor} from '../../rowDivider';
import {useTheme, useThemeName} from '../../../theme/useTheme';
import {Icon} from '../../../Icon';
import {VisuallyHidden} from '../../../VisuallyHidden';
import {resolveContextActions} from '../../tableContextMenu';
import {useTableContext} from '../../useTableCellStyles';
import {useTranslator} from '../../../i18n';
import {rtlStyles} from '../../../utils';
import {
  hasInteractiveAncestor,
  hasTextSelection,
} from '../../../hooks/useClickableContainer';
import type {
  TablePlugin,
  TableColumn,
  BodyRowRenderProps,
  BodyCellRenderProps,
  HeaderCellRenderProps,
} from '../../types';

// =============================================================================
// Config
// =============================================================================

/**
 * Configuration for useTableRowExpansion (detail-panel mode).
 *
 * The consumer owns expansion state; the plugin provides the chevron UI, the
 * full-width detail panel rendered below an expanded row, and a right-click
 * "Expand/Collapse row" action.
 */
export interface UseTableRowExpansionConfig<T extends Record<string, unknown>> {
  /** Set of currently-expanded row keys. */
  expandedKeys: Set<string>;
  /** Called with a row key when its expansion is toggled. */
  onToggle: (key: string) => void;
  /** Derive a stable unique key from a row item. */
  getRowKey: (item: T) => string;
  /**
   * Render the detail content shown in a full-width panel below the row when
   * it is expanded. Receives the row's item.
   */
  renderExpanded: (item: T) => ReactNode;
  /**
   * Control which rows are expandable. Non-expandable rows show no chevron, no
   * context-menu action, and never render a panel. @default all rows expandable
   */
  getIsItemExpandable?: (item: T) => boolean;
  /**
   * Background behind the detail panel.
   *
   * - `transparent` (default): the panel paints nothing and takes whatever
   *   surface is behind the table. The panel is the row's own continuation,
   *   so it inherits the table's background the way the row does, and on a
   *   striped table the zebra reads on unchanged — a panel is not a row, and
   *   is not counted as one.
   * - `muted`: a wash marking the panel as commentary on the row above rather
   *   than another row of data. Reach for it in a bare table — no card, no
   *   dividers, no striping — where nothing else distinguishes the panel from
   *   the data around it. It is an opt-in, not the house style: a table on a
   *   Card gets a third surface out of it, and a striped table gets a band in
   *   the same token as the stripe, which reads as a data row.
   *
   * Worth knowing when choosing: the wash is a low-alpha near-black, so over a
   * dark card it is close to invisible. `muted` is largely a light-theme
   * effect, and dark themes look like `transparent` either way.
   * @default 'transparent'
   */
  panelVariant?: 'muted' | 'transparent';
  /**
   * Toggle a row by clicking anywhere on it, not only on its chevron.
   *
   * This is a pointer-only convenience layered over the chevron: keyboard and
   * assistive-tech users toggle via the chevron button (which stays the
   * accessible control). Clicks originating from interactive cell content
   * (buttons, links, form controls) or a text selection do not toggle.
   * Non-expandable rows stay inert.
   * @default false (only the chevron toggles expansion).
   */
  hasRowClickExpansion?: boolean;
}

// =============================================================================
// Styles
// =============================================================================

/**
 * The chevron column's width, in pixels.
 *
 * A column width is a number the layout does arithmetic on, not a CSS value,
 * so this stays a fixed pixel width at every root font size. The panel's
 * indent, which has to line up with the first real column, spells the same
 * pixels rather than a spacing token: spacing is rem and grows with the root
 * font size, which would push the panel past the column it lines up with. The
 * unit test pins the two together so neither can move without the other.
 */
const EXPANSION_COLUMN_WIDTH_PX = 40;
const EXPANSION_COLUMN_KEY = '__expansion';
/** The chevron button: the spacing step, never wider than its column. */
const CHEVRON_SIZE = `min(${spacingVars['--spacing-6']}, ${EXPANSION_COLUMN_WIDTH_PX}px)`;
const EXPANSION_COLUMN_WIDTH = {
  type: 'pixel' as const,
  value: EXPANSION_COLUMN_WIDTH_PX,
};

const expansionStyles = stylex.create({
  chevronButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-inner'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: colorVars['--color-icon-secondary'],
    // Colour only. The rotation belongs to the glyph, not to the button: the
    // button is the hit target and carries the hover chip, and turning that
    // swings the rounded rectangle and its highlight around with the arrow.
    transitionProperty: 'color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    padding: 0,
    // Match IconButton ghost hover: subtle overlay background.
    backgroundImage: {
      default: null,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': `linear-gradient(${colorVars['--color-overlay-hover']}, ${colorVars['--color-overlay-hover']})`,
      },
    },
    ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
      color: colorVars['--color-icon-primary'],
    },
  },
  chevron: {
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // The RTL mirror is folded into each state's transform rather than living
  // on a parent span, matching TreeListItem's chevron (both are `transform`,
  // so on one element the later value would win).
  chevronExpanded: {
    transform: {
      default: 'rotate(90deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(90deg)',
    },
  },
  chevronCollapsed: {
    transform: {
      default: 'rotate(0deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(0deg)',
    },
  },
  expandedRow: {
    backgroundColor: colorVars['--color-background-muted'],
  },
  expandedCell: {
    paddingBlock: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-5'],
  },
  /** Whole-row-click expansion: signal the row is interactive. */
  clickableRow: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

/**
 * An expanded row and its panel are one unit, so the row divider belongs after
 * the pair rather than between them — left alone, the row's own bottom border
 * draws a line cutting it off from the detail it just opened, and the panel
 * then runs flush into the next row, which is the wrong way round.
 *
 * So the row gives up its border and the panel takes one. On a table with no
 * row dividers the suppression is a no-op (there was no border to remove) and
 * the panel's is never applied, so neither needs to consult the divider mode.
 */
const dividerStyles = stylex.create({
  expandedRowCell: {
    borderBottomWidth: 0,
  },
  // The row's divider, carried down: its row's themed or app-set border
  // reaches the panel through `--_table-panel-divider-*` on the panel's cell
  // (set after each commit, see ExpansionPanelCell), the tokens otherwise.
  panelCell: {
    borderBottomWidth: {
      default: `var(--_table-panel-divider-width, ${borderVars['--border-width']})`,
      // Same rule TableCell uses: no trailing line under the last row of the
      // table. Scoped to the marker so <tbody>, also a :last-child, does not
      // match and suppress every panel's border.
      [stylex.when.ancestor(':last-child', tableRowMarker)]: '0',
    },
    borderBottomStyle: 'var(--_table-panel-divider-style, solid)',
    borderBottomColor: `var(--_table-panel-divider-color, ${colorVars['--color-border']})`,
  },
});

/**
 * Start inset for the detail panel, one per density.
 *
 * The panel is one cell spanning the whole row, so left to itself its content
 * starts at the row's edge — under the chevron, a column to the left of every
 * label it describes. These line it up with the first real column instead: the
 * chevron column's fixed width, plus the inline padding a cell of that density
 * gives its own content.
 *
 * Written as a logical property so RTL mirrors it, and kept in `calc` so the
 * padding half still tracks the spacing scale, as the cell's own padding does.
 */
const panelIndentStyles = stylex.create({
  compact: {
    paddingInlineStart: `calc(${EXPANSION_COLUMN_WIDTH_PX}px + ${spacingVars['--spacing-2']})`,
  },
  balanced: {
    paddingInlineStart: `calc(${EXPANSION_COLUMN_WIDTH_PX}px + ${spacingVars['--spacing-3']})`,
  },
  spacious: {
    paddingInlineStart: `calc(${EXPANSION_COLUMN_WIDTH_PX}px + ${spacingVars['--spacing-4']})`,
  },
});

/**
 * The chevron sits centered in its column, as the selection checkbox does.
 *
 * The column is a fixed pixel width, but its cells' insets follow the spacing
 * scale: the first column's edge inset, plus the density padding a body cell
 * moves onto its right-click trigger. Laid out after both, the button ran past
 * the column's edge, which clips its hover chip and, under a larger spacing
 * scale or root font size, pushes the glyph out of view; and the header cell's
 * insets alone outgrow 40px at a large root, widening the column. So the
 * header cell, which holds only a visually hidden label, drops its inline
 * insets, the body cell drops its inline-start inset, and the button cancels
 * the trigger's padding (the same density step the panel indent uses) and
 * centers itself.
 */
const chevronHeaderCellStyles = stylex.create({
  cell: {
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
  },
});

const chevronCellStyles = stylex.create({
  cell: {
    paddingInlineStart: 0,
  },
});

const chevronOffsetStyles = stylex.create({
  compact: {
    marginInlineStart: `calc((${EXPANSION_COLUMN_WIDTH_PX}px - ${CHEVRON_SIZE}) / 2 - ${spacingVars['--spacing-2']})`,
  },
  balanced: {
    marginInlineStart: `calc((${EXPANSION_COLUMN_WIDTH_PX}px - ${CHEVRON_SIZE}) / 2 - ${spacingVars['--spacing-3']})`,
  },
  spacious: {
    marginInlineStart: `calc((${EXPANSION_COLUMN_WIDTH_PX}px - ${CHEVRON_SIZE}) / 2 - ${spacingVars['--spacing-4']})`,
  },
});

// =============================================================================
// Chevron Cell
// =============================================================================

function ExpansionChevron({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslator();
  const ctx = useTableContext();
  return (
    <button
      type="button"
      {...stylex.props(
        expansionStyles.chevronButton,
        chevronOffsetStyles[ctx?.density ?? 'balanced'],
      )}
      onClick={e => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={
        isExpanded
          ? t('@astryx.tableRowExpansion.collapseRow')
          : t('@astryx.tableRowExpansion.expandRow')
      }
      aria-expanded={isExpanded}>
      <Icon
        icon="chevronRight"
        size="xsm"
        xstyle={[
          expansionStyles.chevron,
          isExpanded
            ? expansionStyles.chevronExpanded
            : expansionStyles.chevronCollapsed,
        ]}
      />
    </button>
  );
}

const PANEL_DIVIDER_PROPERTIES = [
  '--_table-panel-divider-width',
  '--_table-panel-divider-style',
  '--_table-panel-divider-color',
] as const;

/**
 * Carries the row's divider onto a panel cell where an override makes it
 * differ from what the panel paints on its own (the divider tokens, in CSS),
 * and carries nothing otherwise, so a later token or theme change reaches
 * the panel the way it reaches the row.
 */
function carryPanelDivider(cell: HTMLTableCellElement): void {
  const row = cell.parentElement?.previousElementSibling;
  const edge = row == null ? null : panelDividerFor(row);
  if (edge == null) {
    return;
  }
  // What the panel paints with nothing carried.
  const carried = PANEL_DIVIDER_PROPERTIES.map(name =>
    cell.style.getPropertyValue(name),
  );
  if (carried.some(value => value !== '')) {
    for (const name of PANEL_DIVIDER_PROPERTIES) {
      cell.style.removeProperty(name);
    }
  }
  const own = getComputedStyle(cell);
  const isOverride =
    edge.color !== own.borderBottomColor ||
    edge.style !== own.borderBottomStyle ||
    (edge.width !== 'initial' && edge.width !== own.borderBottomWidth);
  if (!isOverride) {
    return;
  }
  const next = [edge.width, edge.style, edge.color];
  PANEL_DIVIDER_PROPERTIES.forEach((name, index) => {
    cell.style.setProperty(name, next[index]);
  });
}

/**
 * One per table: when the colour mode or the theme changes (a Theme's, or
 * the operating system's mode under `system`) the open panels' carried
 * dividers are read again. The panels register their cells with the hook.
 */
function PanelDividerModeWatch({
  cellsRef,
}: {
  cellsRef: RefObject<Set<HTMLTableCellElement>>;
}) {
  const {mode} = useTheme();
  const themeName = useThemeName();
  const lastRef = useRef({mode, themeName});
  useLayoutEffect(() => {
    const last = lastRef.current;
    if (last.mode === mode && last.themeName === themeName) {
      return;
    }
    lastRef.current = {mode, themeName};
    for (const cell of cellsRef.current) {
      carryPanelDivider(cell);
    }
  }, [mode, themeName, cellsRef]);
  return null;
}

/**
 * The detail panel's cell. A component rather than a bare `<td>` so it can
 * read the table's density and divider mode off the context — to indent itself
 * to match the first column, and to carry the row divider its own row gave up.
 * The plugin builds this row outside the Table's own render, where that
 * context is not otherwise in hand.
 */
function ExpansionPanelCell({
  colSpan,
  cellsRef,
  children,
}: {
  colSpan: number;
  cellsRef: RefObject<Set<HTMLTableCellElement>>;
  children: ReactNode;
}) {
  const ctx = useTableContext();
  const hasRowDividers = ctx?.dividers === 'rows' || ctx?.dividers === 'grid';
  const cellRef = useRef<HTMLTableCellElement>(null);
  // The panel carries its row's divider (a theme's `table-cell` border or an
  // app's own never reach this cell, which is not one of the row's cells).
  // Read after each commit, and on a colour-mode change by the table's one
  // PanelDividerModeWatch.
  useLayoutEffect(() => {
    if (hasRowDividers && cellRef.current != null) {
      carryPanelDivider(cellRef.current);
    }
  });
  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (cell == null || !hasRowDividers) {
      return;
    }
    const cells = cellsRef.current;
    cells.add(cell);
    return () => {
      cells.delete(cell);
    };
  }, [cellsRef, hasRowDividers]);
  return (
    <td
      ref={cellRef}
      colSpan={colSpan}
      {...stylex.props(
        expansionStyles.expandedCell,
        panelIndentStyles[ctx?.density ?? 'balanced'],
        hasRowDividers && dividerStyles.panelCell,
      )}>
      {children}
    </td>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Returns a TablePlugin that expands a full-width detail panel below a row.
 *
 * The consumer owns the `expandedKeys` set (via `useState`); the plugin adds
 * a leading chevron column, a right-click expand/collapse action, and renders
 * `renderExpanded(item)` in a full-width panel below each expanded row.
 *
 * For hierarchical data (child rows sharing the parent columns) use
 * `useTableTreeData` + `useTableTreeState` instead.
 *
 * @example
 * ```
 * const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
 * const expansion = useTableRowExpansion({
 *   expandedKeys,
 *   onToggle: key =>
 *     setExpandedKeys(prev => {
 *       const next = new Set(prev);
 *       next.has(key) ? next.delete(key) : next.add(key);
 *       return next;
 *     }),
 *   getRowKey: item => item.id,
 *   renderExpanded: item => <OrderDetails order={item} />,
 * });
 * <Table data={data} columns={columns} idKey="id" plugins={{expansion}} />;
 * ```
 */
export function useTableRowExpansion<T extends Record<string, unknown>>(
  config: UseTableRowExpansionConfig<T>,
): TablePlugin<T> {
  const {
    expandedKeys,
    onToggle,
    getRowKey,
    renderExpanded,
    getIsItemExpandable,
    hasRowClickExpansion,
    panelVariant = 'transparent',
  } = config;

  const t = useTranslator();

  // Final rendered column count, captured in transformColumns (pipeline step
  // 1) and read in transformBodyRow for the detail panel's colSpan.
  const columnCountRef = useRef(1);
  // The open panels' cells, for the table's one colour-mode watch.
  const panelCellsRef = useRef(new Set<HTMLTableCellElement>());

  const expansionColumn = useMemo(
    (): TableColumn<T> => ({
      key: EXPANSION_COLUMN_KEY,
      // A `<th>` with no discernible text is announced as an unlabelled
      // column; the label is hidden because the column shows only chevrons.
      header: (
        <VisuallyHidden>
          {t('@astryx.tableRowExpansion.columnHeader')}
        </VisuallyHidden>
      ),
      width: EXPANSION_COLUMN_WIDTH,
      resizable: false,
      renderCell: (item: T) => {
        const expandable = getIsItemExpandable
          ? getIsItemExpandable(item)
          : true;
        if (!expandable) {
          return null;
        }
        const key = getRowKey(item);
        return (
          <ExpansionChevron
            isExpanded={expandedKeys.has(key)}
            onToggle={() => onToggle(key)}
          />
        );
      },
    }),
    [expandedKeys, onToggle, getRowKey, getIsItemExpandable, t],
  );

  return useMemo(
    (): TablePlugin<T> => ({
      // One colour-mode watch per table for the open panels' dividers.
      transformTableContext(children: ReactNode): ReactNode {
        return (
          <>
            {children}
            <PanelDividerModeWatch cellsRef={panelCellsRef} />
          </>
        );
      },
      transformColumns(columns: TableColumn<T>[]) {
        const withExpansion = [expansionColumn, ...columns];
        columnCountRef.current = withExpansion.length;
        return withExpansion;
      },

      transformHeaderCell(
        props: HeaderCellRenderProps,
        column: TableColumn<T>,
      ): HeaderCellRenderProps {
        // Keep the chevron column at its fixed width (chevronCellStyles).
        return column.key === EXPANSION_COLUMN_KEY
          ? {...props, xstyle: [...props.xstyle, chevronHeaderCellStyles.cell]}
          : props;
      },

      transformBodyCell(
        props: BodyCellRenderProps,
        column: TableColumn<T>,
        item: T,
      ): BodyCellRenderProps {
        // Contribute the expand/collapse action on every cell; BaseTable
        // aggregates them into one menu per row. Skip non-expandable rows.
        const expandable = getIsItemExpandable
          ? getIsItemExpandable(item)
          : true;
        if (!expandable) {
          return props;
        }
        const key = getRowKey(item);
        const isExpanded = expandedKeys.has(key);
        return {
          ...props,
          xstyle: [
            ...props.xstyle,
            // The chevron centers itself in its column (chevronCellStyles).
            ...(column.key === EXPANSION_COLUMN_KEY
              ? [chevronCellStyles.cell]
              : []),
            // Hand the row divider to the panel below, so the line closes the
            // row-plus-panel pair instead of splitting it.
            ...(isExpanded ? [dividerStyles.expandedRowCell] : []),
          ],
          contextMenuActions: () => [
            ...resolveContextActions(props.contextMenuActions),
            {
              id: 'row-expansion-toggle',
              group: 'row-expansion',
              label: isExpanded
                ? t('@astryx.tableRowExpansion.collapseRow')
                : t('@astryx.tableRowExpansion.expandRow'),
              icon: (
                <Icon
                  icon={isExpanded ? 'chevronDown' : 'chevronRight'}
                  size="xsm"
                  aria-hidden
                  // chevronDown needs no mirroring; chevronRight (collapsed,
                  // pointing toward the reveal direction) does.
                  xstyle={!isExpanded && rtlStyles.mirror}
                />
              ),
              onSelect: () => onToggle(key),
            },
          ],
        };
      },

      transformBodyRow(props: BodyRowRenderProps, item: T): BodyRowRenderProps {
        const expandable = getIsItemExpandable
          ? getIsItemExpandable(item)
          : true;
        if (!expandable) {
          return props;
        }
        const key = getRowKey(item);

        // Whole-row-click expansion (opt-in), applied before the collapsed
        // early-return: a collapsed row is precisely the one a click has to
        // reach, since opening it is the whole point.
        const withClick = hasRowClickExpansion
          ? {
              ...props,
              htmlProps: {
                ...props.htmlProps,
                onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
                  // Don't hijack clicks on interactive cell content (the
                  // chevron already stops propagation, but a composed
                  // selection checkbox, link, or action button does not) or a
                  // text selection. Both rules come from
                  // `useClickableContainer`, the same pair every clickable
                  // surface in the system uses — the hook itself wants a ref
                  // we have no way to hand it from inside `transformBodyRow`,
                  // so this shares its guards rather than its plumbing.
                  const row = event.currentTarget;
                  const target = event.target;
                  if (!(target instanceof Element)) {
                    return;
                  }
                  if (target !== row && hasInteractiveAncestor(target, row)) {
                    return;
                  }
                  // A click inside a contenteditable region is an edit
                  // action, not a row toggle. The shared guard does not
                  // include contenteditable (it would change ClickableCard
                  // and other consumers), so the Table row-click path
                  // checks it separately.
                  if (
                    target !== row &&
                    target.closest(
                      '[contenteditable]:not([contenteditable="false"])',
                    )
                  ) {
                    return;
                  }
                  if (hasTextSelection(row)) {
                    return;
                  }
                  props.htmlProps.onClick?.(event);
                  onToggle(key);
                },
              },
              xstyle: [...props.xstyle, expansionStyles.clickableRow],
            }
          : props;

        if (!expandedKeys.has(key)) {
          return withClick;
        }

        const panel = (
          <tr
            key={`${key}-expanded`}
            // A panel is its row's continuation, not a row of its own. Striping
            // counts `:nth-child(even of :not([data-expansion-panel]))`, so this
            // attribute is what keeps an open panel from inverting the zebra of
            // every row beneath it. Load-bearing, not diagnostic.
            data-expansion-panel=""
            {...stylex.props(
              // Carries the marker so the panel cell's divider can ask whether
              // this row is the table's last, the same way TableCell does.
              tableRowMarker,
              panelVariant === 'muted' && expansionStyles.expandedRow,
            )}>
            <ExpansionPanelCell
              colSpan={columnCountRef.current}
              cellsRef={panelCellsRef}>
              {renderExpanded(item)}
            </ExpansionPanelCell>
          </tr>
        );

        return {
          ...withClick,
          afterRow: withClick.afterRow ? (
            <>
              {withClick.afterRow}
              {panel}
            </>
          ) : (
            panel
          ),
        };
      },
    }),
    [
      expandedKeys,
      getRowKey,
      renderExpanded,
      getIsItemExpandable,
      hasRowClickExpansion,
      panelVariant,
      onToggle,
      t,
      expansionColumn,
    ],
  );
}
