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
  useCallback,
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
  ScrollWrapperRenderProps,
} from '../../types';
import {LayoutChangeSnapshot} from '../../../motion/LayoutChangeSnapshot';
import {
  applyLayoutChangeTransition,
  glideOf,
  playLayoutChange,
  reportLayoutChange,
  type AnimatedLayout,
  type LayoutChange,
} from '../../../motion/animatedLayout';
import {
  GLIDING_ATTRIBUTE,
  glidingDividerStyles,
  markGlidingRows,
  rowEdge,
  type BottomEdge,
} from '../../glidingDivider';

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
  /**
   * A handle from `useAnimatedLayout`. With it, opening or closing a row's
   * panel glides the rows after it to their new places instead of jumping,
   * and an opening panel plays its entrance on the same motion. Without it,
   * rows jump, as before.
   */
  animatedLayout?: AnimatedLayout;
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
    '--_table-row-divider-width': '0px',
    borderBottomWidth: 0,
  },
  // The row's divider, carried down: its row's themed or app-set border
  // reaches the panel through `--_table-panel-divider-*` on the panel's cell
  // (set after each commit, see ExpansionPanelCell), the tokens otherwise.
  panelCell: {
    // The width this divider draws, for its stand-in during a glide.
    '--_table-row-divider-width': {
      default: `var(--_table-panel-divider-width, ${borderVars['--border-width']})`,
      [stylex.when.ancestor(':last-child', tableRowMarker)]: '0px',
    },
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
      data-expansion-toggle=""
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
    const cell = cellRef.current;
    const row = cell?.parentElement?.previousElementSibling;
    if (cell == null || row == null || !hasRowDividers) {
      return;
    }
    if (!row.hasAttribute(GLIDING_ATTRIBUTE)) {
      carryPanelDivider(cell);
      return;
    }
    // A row a glide is moving has transparent cells until it ends: the
    // panel reads its row once the glide has let it go.
    let frame = 0;
    const carryWhenStill = () => {
      if (row.hasAttribute(GLIDING_ATTRIBUTE)) {
        frame = requestAnimationFrame(carryWhenStill);
        return;
      }
      carryPanelDivider(cell);
    };
    frame = requestAnimationFrame(carryWhenStill);
    return () => cancelAnimationFrame(frame);
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
        glidingDividerStyles.cell,
        hasRowDividers && glidingDividerStyles.panelCell,
      )}>
      {children}
    </td>
  );
}

/**
 * Measures each expansion change for the glide, except in a table with
 * column lines (`dividers` "columns" or "grid"): they are painted at the
 * cells' static places too, and only row dividers have a moving stand-in, so
 * such a table changes at once, panel, rows and chevron, as without a handle
 * (component:Table FR15).
 */
function ExpansionSnapshot({
  value,
  onBeforeChange,
  onColumnLines,
}: {
  value: Set<string>;
  onBeforeChange: (previous: Set<string>) => void;
  /** The chevrons drop a spring an earlier glide set on them. */
  onColumnLines: () => void;
}) {
  const ctx = useTableContext();
  const hasColumnLines =
    ctx?.dividers === 'grid' || ctx?.dividers === 'columns';
  useLayoutEffect(() => {
    if (hasColumnLines) {
      onColumnLines();
    }
  }, [hasColumnLines, onColumnLines]);
  if (hasColumnLines) {
    return null;
  }
  return <LayoutChangeSnapshot value={value} onBeforeChange={onBeforeChange} />;
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
    animatedLayout,
  } = config;

  const t = useTranslator();

  // Final rendered column count, captured in transformColumns (pipeline step
  // 1) and read in transformBodyRow for the detail panel's colSpan.
  const columnCountRef = useRef(1);
  // The open panels' cells, for the table's one colour-mode watch.
  const panelCellsRef = useRef(new Set<HTMLTableCellElement>());

  // With an `animatedLayout` handle, a panel opening or closing glides the
  // rows after it (`spec:AST-105`, `architecture:react-component-runtime`
  // INV12). LayoutChangeSnapshot measures each changed row in the commit,
  // before the DOM changes; the layout effect below runs the glide after it.
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);
  // The scroll wrapper's merged ref, kept while the inner ref is the same.
  const mergedScrollWrapperRef = useRef<{
    inner: ScrollWrapperRenderProps['htmlProps']['ref'] | null;
    merged: (node: HTMLDivElement | null) => void;
  } | null>(null);
  const pendingLayoutRef = useRef<
    {change: LayoutChange; key: string; isExpanding: boolean}[]
  >([]);
  // The height the closing panels gave up (read with the measurement), and
  // the height the scroll wrapper holds while rows glide up into it (see the
  // layout effect).
  const closedHeightRef = useRef(0);
  const heldHeightRef = useRef(0);
  const holdBaseRef = useRef<{padding: number; margin: number} | null>(null);
  // This table's own body rows only: a table nested in a panel can reuse the
  // same row keys. The first table in the wrapper is this one.
  const rowFor = useCallback(
    (key: string) =>
      scrollWrapperRef.current
        ?.querySelector('table')
        ?.querySelector<HTMLElement>(
          `:scope > tbody > tr[data-expansion-key="${CSS.escape(key)}"]`,
        ) ?? null,
    [],
  );
  const measureChanges = useCallback(
    (previous: Set<string>) => {
      if (animatedLayout == null) {
        return;
      }
      const changed = [
        ...[...previous].filter(key => !expandedKeys.has(key)),
        ...[...expandedKeys].filter(key => !previous.has(key)),
      ];
      for (const key of changed) {
        const row = rowFor(key);
        if (row == null) {
          continue;
        }
        const change = reportLayoutChange(animatedLayout, () => row);
        change.measureBefore();
        // A closing panel's height, read in the same layout the measurement
        // just read.
        const panel = row.nextElementSibling;
        if (
          !expandedKeys.has(key) &&
          panel?.hasAttribute('data-expansion-panel') === true
        ) {
          closedHeightRef.current += panel.getBoundingClientRect().height;
          // The wrapper's own bottom padding and margin (a container's
          // bleed), which the hold adds to rather than replaces.
          const wrapper = scrollWrapperRef.current;
          if (wrapper != null && holdBaseRef.current == null) {
            const style = getComputedStyle(wrapper);
            holdBaseRef.current = {
              padding: parseFloat(style.paddingBlockEnd) || 0,
              margin: parseFloat(style.marginBlockEnd) || 0,
            };
          }
        }
        // The chevron turns on the glide's motion (component:Table FR15);
        // written after the measurement so the read finds the layout clean.
        applyLayoutChangeTransition(
          animatedLayout,
          row.querySelector<HTMLElement>('[data-expansion-toggle] > *'),
        );
        pendingLayoutRef.current.push({
          change,
          key,
          isExpanding: expandedKeys.has(key),
        });
      }
    },
    [animatedLayout, expandedKeys, rowFor],
  );
  // The chevrons back on the theme's own turn: a spring a handle set stays
  // only while the glide runs (`spec:AST-105` FR2), so it goes without a
  // handle and in a table with column lines.
  const resetChevrons = useCallback(() => {
    const table = scrollWrapperRef.current?.querySelector('table');
    for (const glyph of table?.querySelectorAll<HTMLElement>(
      '[data-expansion-toggle] > *',
    ) ?? []) {
      // This table's chevrons, not a nested table's.
      if (glyph.closest('table') === table) {
        applyLayoutChangeTransition(null, glyph);
      }
    }
  }, []);
  useLayoutEffect(() => {
    if (animatedLayout == null) {
      resetChevrons();
    }
  }, [animatedLayout, resetChevrons]);

  useLayoutEffect(() => {
    const pendings = pendingLayoutRef.current;
    pendingLayoutRef.current = [];
    // The rows that changed, each with the panel it opened (if that panel
    // plays in) and the borders of the rows the glide may move.
    const moved: {
      row: HTMLElement;
      panel: HTMLElement | null;
      entrance: Animation | null;
      edges: Map<Element, BottomEdge>;
    }[] = [];
    for (const pending of pendings) {
      const row = rowFor(pending.key);
      if (row == null) {
        pending.change.animate();
        continue;
      }
      const next = row.nextElementSibling;
      // Filled in by beforeMove, during the glide's own microtask.
      const record = {
        row,
        panel:
          pending.isExpanding &&
          next instanceof HTMLElement &&
          next.hasAttribute('data-expansion-panel')
            ? next
            : null,
        entrance: null as Animation | null,
        edges: new Map<Element, BottomEdge>(),
      };
      // Read where the glide reads the layout, before anything moves: the
      // rows' borders, then the panel's entrance (it reads too).
      const isMeasured = pending.change.animate(candidates => {
        for (const candidate of candidates) {
          if (
            candidate instanceof HTMLTableRowElement &&
            candidate.parentElement === row.parentElement
          ) {
            const edge = rowEdge(candidate);
            if (edge != null) {
              record.edges.set(candidate, edge);
            }
          }
        }
        if (record.panel != null) {
          const edge = rowEdge(record.panel);
          if (edge != null) {
            record.edges.set(record.panel, edge);
          }
          record.entrance = playLayoutChange(animatedLayout, record.panel);
        }
      });
      if (isMeasured) {
        moved.push(record);
      }
    }
    // The table's scroll wrapper clips what it holds, and a panel that closed
    // shrank it at once: the rows gliding up into its place would be cut off
    // at its new bottom until they arrive. For the glide, it keeps the height
    // the panels gave up as bottom padding, given back with an equal negative
    // margin so the content after the table moves exactly as it would have;
    // both go together when the rows stop, which changes nothing outside.
    const wrapper = scrollWrapperRef.current;
    const held = moved.length > 0 ? closedHeightRef.current : 0;
    closedHeightRef.current = 0;
    if (heldHeightRef.current === 0 && held <= 0.5) {
      holdBaseRef.current = null;
    }
    if (moved.length === 0) {
      return;
    }
    // The glide starts in the microtask the module queued in animate(); this
    // one runs after it, before the frame paints, and only writes.
    queueMicrotask(() => {
      const stopped = Promise.all(
        moved.map(async ({row, panel, entrance, edges}) =>
          markGlidingRows(
            row,
            edges,
            panel != null && entrance != null
              ? {row: panel, animation: entrance}
              : null,
            glideOf,
          ),
        ),
      );
      if (held <= 0.5 || wrapper == null) {
        return;
      }
      const hold = (height: number) => {
        const base = holdBaseRef.current ?? {padding: 0, margin: 0};
        wrapper.style.paddingBlockEnd =
          height > 0 ? `${base.padding + height}px` : '';
        wrapper.style.marginBlockEnd =
          height > 0 ? `${base.margin - height}px` : '';
        if (height <= 0) {
          holdBaseRef.current = null;
        }
      };
      heldHeightRef.current += held;
      hold(heldHeightRef.current);
      void stopped.then(() => {
        heldHeightRef.current = Math.max(0, heldHeightRef.current - held);
        hold(heldHeightRef.current);
      });
    });
  }, [expandedKeys, animatedLayout, rowFor]);

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

      transformScrollWrapper(
        props: ScrollWrapperRenderProps,
      ): ScrollWrapperRenderProps {
        // One merged ref per inner ref, so React does not detach and
        // re-attach the wrapper's refs (a later plugin's listeners
        // included) on every render.
        const existingRef = props.htmlProps.ref ?? null;
        const cached = mergedScrollWrapperRef.current;
        const mergedRef =
          cached != null && cached.inner === existingRef
            ? cached.merged
            : (node: HTMLDivElement | null) => {
                scrollWrapperRef.current = node;
                if (typeof existingRef === 'function') {
                  existingRef(node);
                } else if (existingRef != null) {
                  existingRef.current = node;
                }
              };
        mergedScrollWrapperRef.current = {
          inner: existingRef,
          merged: mergedRef,
        };
        return {
          ...props,
          htmlProps: {...props.htmlProps, ref: mergedRef},
          beforeTable:
            animatedLayout == null ? (
              props.beforeTable
            ) : (
              <>
                {props.beforeTable}
                <ExpansionSnapshot
                  value={expandedKeys}
                  onBeforeChange={measureChanges}
                  onColumnLines={resetChevrons}
                />
              </>
            ),
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
        // The row a glide measures from, found again after the commit.
        const keyAttribute: Record<string, string> = {
          'data-expansion-key': key,
        };
        const keyed = {
          ...props,
          htmlProps: {...props.htmlProps, ...keyAttribute},
        };

        // Whole-row-click expansion (opt-in), applied before the collapsed
        // early-return: a collapsed row is precisely the one a click has to
        // reach, since opening it is the whole point.
        const withClick = hasRowClickExpansion
          ? {
              ...keyed,
              htmlProps: {
                ...keyed.htmlProps,
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
                  keyed.htmlProps.onClick?.(event);
                  onToggle(key);
                },
              },
              xstyle: [...keyed.xstyle, expansionStyles.clickableRow],
            }
          : keyed;

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
              glidingDividerStyles.row,
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
      animatedLayout,
      measureChanges,
      resetChevrons,
    ],
  );
}
