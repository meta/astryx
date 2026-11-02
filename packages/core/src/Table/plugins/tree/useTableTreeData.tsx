// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableTreeData.tsx
 * @input React, StyleX, Icon, Table types, theme tokens, i18n (useTranslator)
 * @output Exports useTableTreeData hook + config/meta types
 * @position Tree plugin; consumed by Table via plugins prop.
 *   Pairs with useTableTreeState (owns expansion state + flattening).
 *
 * ## Architecture (mirrors useTableSelection)
 *
 * The tree affordance decorates the tree column's cells in place — no
 * synthetic column. `transformColumns` wraps the tree column's renderCell
 * with a flex wrapper carrying per-level indentation and an expander
 * button (or a fixed-width spacer on leaves). Other columns get zero
 * extra DOM.
 *
 * Expansion state flows through an external store (TreeStore) so each
 * row's expander subscribes independently — a toggle re-renders only the
 * affected cells, not the whole body. Row ARIA (aria-level,
 * aria-expanded) is applied imperatively via a ref callback on each
 * <tr>, exactly like selection's row styling; each subscription
 * self-cleans when the row disconnects.
 *
 * When `hasExpandableRows` is false (flat data), every transform is a
 * pass-through: adopting the plugin ahead of hierarchical data is a
 * no-op.
 */

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars, spacingVars} from '../../../theme/tokens.stylex';
import {Icon} from '../../../Icon';
import {mergeRefs} from '../../../utils';
import {
  hasInteractiveAncestor,
  hasTextSelection,
} from '../../../hooks/useClickableContainer';
import type {
  TablePlugin,
  TableColumn,
  BodyRowRenderProps,
  HeaderCellRenderProps,
} from '../../types';
import {useTranslator} from '../../../i18n';

// =============================================================================
// Types
// =============================================================================

/** Structural position of one visible row within the tree. */
export interface TableTreeRowMeta {
  /** The row's id (from `idKey`). */
  id: string;
  /** 0-based depth: roots are level 0. */
  level: number;
  /** Whether the row shows an expander. */
  hasChildren: boolean;
  /** Whether the row is currently expanded. */
  isExpanded: boolean;
}

/**
 * Configuration for useTableTreeData. `useTableTreeState` returns a
 * ready-made value (`treeConfig`); consumers with server-driven or
 * pre-flattened trees can construct one directly.
 */
export interface UseTableTreeDataConfig<T extends Record<string, unknown>> {
  /** Structural meta for a visible row; undefined for unknown rows. */
  getRowMeta: (item: T) => TableTreeRowMeta | undefined;
  /** Toggle a row's expansion. */
  onToggleItem: (item: T) => void;
  /**
   * Derive a human-readable row identity for the expander's accessible name.
   * The plugin combines it with localized expand/collapse wording. Blank labels
   * fall back to the generic row label.
   *
   * @example
   * ```
   * getRowLabel: item => item.name
   * ```
   */
  getRowLabel?: (item: T) => string;
  /**
   * Whether any row in the dataset is expandable. When false the plugin is
   * a no-op: no expanders, no indent, no tree ARIA — flat data renders
   * identically to a Table without the plugin.
   */
  hasExpandableRows: boolean;
  /**
   * Aggregate expansion state across every expandable row. When provided
   * together with `onExpandAll`/`onCollapseAll`, the tree column header shows
   * an expand-all toggle. `useTableTreeState` supplies all three.
   */
  isAllExpanded?: boolean | 'indeterminate';
  /** Expand every expandable row. Wired to the header expand-all control. */
  onExpandAll?: () => void;
  /** Collapse every row. Wired to the header expand-all control. */
  onCollapseAll?: () => void;
  /**
   * Show the expand-all/collapse-all toggle in the tree column header. Needs
   * `isAllExpanded` and `onExpandAll`/`onCollapseAll` to be present.
   * @default false
   */
  hasExpandAllControl?: boolean;
  /**
   * Indent step per level, as spacing tokens.
   * @default 'md'
   */
  indent?: 'sm' | 'md' | 'lg';
  /** Column that carries the indent + expander. @default the first column */
  treeColumnKey?: string;
  /**
   * When true, clicking anywhere on an expandable row toggles its expansion,
   * in addition to the chevron. Leaf rows stay inert. No-op on flat data.
   *
   * This is a pointer-only convenience layered over the chevron: keyboard and
   * assistive-tech users toggle via the chevron button (which stays the
   * accessible control). Clicks originating from interactive cell content
   * (buttons, links, form controls) or a text selection do not toggle.
   * @default false (only the chevron toggles expansion).
   */
  hasRowClickExpansion?: boolean;
}

// =============================================================================
// Tree Store (external store for fine-grained row subscriptions)
// =============================================================================

interface TreeStore<T extends Record<string, unknown>> {
  subscribe: (listener: () => void) => () => void;
  notify: () => void;
  getConfig: () => UseTableTreeDataConfig<T>;
}

function createTreeStore<T extends Record<string, unknown>>(
  configRef: React.RefObject<UseTableTreeDataConfig<T>>,
): TreeStore<T> {
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      for (const listener of listeners) {
        listener();
      }
    },
    getConfig() {
      return configRef.current;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TreeStoreContext = createContext<TreeStore<any> | null>(null);
TreeStoreContext.displayName = 'TreeStoreContext';

/** Indent token -> index, for the primitive row snapshot. */
const INDENT_INDEX = {sm: 0, md: 1, lg: 2} as const;

/**
 * Encode a row's tree meta and optional accessible label as a primitive for
 * useSyncExternalStore — object snapshots would tear. The numeric fast path is
 * retained when getRowLabel is absent. When it is present, the derived label
 * participates so config-only label changes re-render the affected cells.
 * Encoding: level * 16 + indentIndex * 4 + hasChildren * 2 + isExpanded;
 * -1 = no meta.
 */
function getRowSnapshot<T extends Record<string, unknown>>(
  config: UseTableTreeDataConfig<T>,
  item: T,
): number | string {
  const meta = config.getRowMeta(item);
  if (!meta) {
    return -1;
  }
  const metaSnapshot =
    meta.level * 16 +
    INDENT_INDEX[config.indent ?? 'md'] * 4 +
    (meta.hasChildren ? 2 : 0) +
    (meta.isExpanded ? 1 : 0);
  if (!config.getRowLabel) {
    return metaSnapshot;
  }
  return `${metaSnapshot}\u0000${config.getRowLabel(item)?.trim() ?? ''}`;
}

function useRowSnapshot<T extends Record<string, unknown>>(
  store: TreeStore<T>,
  item: T,
): number | string {
  const getSnapshot = useCallback(
    () => getRowSnapshot(store.getConfig(), item),
    [store, item],
  );

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

// =============================================================================
// Row ARIA (imperative, mirrors selection's row styling)
// =============================================================================

function applyRowTreeAria(
  el: HTMLTableRowElement,
  meta: TableTreeRowMeta | undefined,
): void {
  if (!meta) {
    el.removeAttribute('aria-level');
    el.removeAttribute('aria-expanded');
    return;
  }
  el.setAttribute('aria-level', String(meta.level + 1));
  if (meta.hasChildren) {
    el.setAttribute('aria-expanded', String(meta.isExpanded));
  } else {
    el.removeAttribute('aria-expanded');
  }
}

// =============================================================================
// Styles
// =============================================================================

/** Indent step per level, by the `indent` config token. */
const INDENT_STEP = {
  sm: spacingVars['--spacing-3'],
  md: spacingVars['--spacing-4'],
  lg: spacingVars['--spacing-6'],
} as const;

const treeStyles = stylex.create({
  cell: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  indent: (paddingInlineStart: string) => ({
    paddingInlineStart,
  }),
  expanderButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-inner'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: colorVars['--color-icon-secondary'],
    transitionProperty: 'color, background-color',
    transitionDuration: '150ms',
    padding: 0,
    flexShrink: '0',
    // Match IconButton ghost hover: subtle overlay background
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
  chevronIcon: {
    transitionProperty: 'transform',
    transitionDuration: '150ms',
  },
  // The RTL mirror is folded into each state's transform rather than living on
  // a parent span. Both are `transform`, so on one element the later value
  // would win — spelling out `scaleX(-1) rotate(...)` per state composes them
  // exactly as the nested elements did, while leaving a single element to
  // carry the glyph's theme target.
  chevronIconCollapsed: {
    transform: {
      default: 'rotate(0deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(0deg)',
    },
  },
  chevronIconExpanded: {
    transform: {
      default: 'rotate(90deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(90deg)',
    },
  },
  /** Keeps leaf content aligned with expandable siblings. */
  leafSpacer: {
    display: 'inline-block',
    width: '24px',
    height: '24px',
    flexShrink: '0',
  },
  /** Header expand-all toggle: same affordance as a row expander. */
  headerCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
  },
  /** Whole-row-click expansion: signal the row is interactive. */
  clickableRow: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

// =============================================================================
// Cell content
// =============================================================================

function TreeExpander({
  isExpanded,
  onToggle,
  rowLabel,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  rowLabel?: string;
}) {
  const t = useTranslator();
  const normalizedRowLabel = rowLabel?.trim();
  const ariaLabel = normalizedRowLabel
    ? isExpanded
      ? t('@astryx.tableTree.collapseRowNamed', {label: normalizedRowLabel})
      : t('@astryx.tableTree.expandRowNamed', {label: normalizedRowLabel})
    : isExpanded
      ? t('@astryx.tableTree.collapseRow')
      : t('@astryx.tableTree.expandRow');

  return (
    <button
      type="button"
      {...stylex.props(treeStyles.expanderButton)}
      onClick={e => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={ariaLabel}
      aria-expanded={isExpanded}>
      <Icon
        icon="chevronRight"
        size="xsm"
        // The rotation rides on the glyph rather than a wrapper span so the
        // theme target below reaches both the mark and its open/closed
        // transform.
        xstyle={[
          treeStyles.chevronIcon,
          isExpanded
            ? treeStyles.chevronIconExpanded
            : treeStyles.chevronIconCollapsed,
        ]}
      />
    </button>
  );
}

/**
 * Header expand-all/collapse-all toggle. Rendered in the tree column header
 * when `hasExpandAllControl` is set and the state hook supplies the aggregate
 * `isAllExpanded` plus `onExpandAll`/`onCollapseAll`. Shares the chevron
 * affordance with the per-row expander; the chevron points down (expanded)
 * only when every expandable row is expanded, matching the row expander.
 */
function TreeExpandAllToggle({
  isAllExpanded,
  onExpandAll,
  onCollapseAll,
}: {
  isAllExpanded: boolean | 'indeterminate';
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const t = useTranslator();
  const allExpanded = isAllExpanded === true;
  return (
    <button
      type="button"
      {...stylex.props(treeStyles.expanderButton)}
      onClick={e => {
        e.stopPropagation();
        if (allExpanded) {
          onCollapseAll();
        } else {
          onExpandAll();
        }
      }}
      aria-label={
        allExpanded
          ? t('@astryx.tableTree.collapseAllRows')
          : t('@astryx.tableTree.expandAllRows')
      }
      aria-expanded={allExpanded}>
      <Icon
        icon="chevronRight"
        size="xsm"
        // Same one-element treatment as the row expander: the glyph carries
        // both the rotation and the theme target.
        xstyle={[
          treeStyles.chevronIcon,
          allExpanded
            ? treeStyles.chevronIconExpanded
            : treeStyles.chevronIconCollapsed,
        ]}
      />
    </button>
  );
}

function TreeCellContent<T extends Record<string, unknown>>({
  item,
  children,
}: {
  item: T;
  children: ReactNode;
}) {
  const store = use(TreeStoreContext);
  if (!store) {
    return <>{children}</>;
  }

  return (
    <TreeCellContentInner store={store} item={item}>
      {children}
    </TreeCellContentInner>
  );
}

function TreeCellContentInner<T extends Record<string, unknown>>({
  store,
  item,
  children,
}: {
  store: TreeStore<T>;
  item: T;
  children: ReactNode;
}) {
  // Subscribe to this row's structural meta and derived label so only affected
  // cells re-render when either changes.
  useRowSnapshot(store, item);

  const config = store.getConfig();
  const meta = config.getRowMeta(item);
  if (!meta) {
    return <>{children}</>;
  }

  const step = INDENT_STEP[config.indent ?? 'md'];
  const indent = `calc(${meta.level} * ${step})`;

  return (
    <div
      {...stylex.props(
        treeStyles.cell,
        meta.level > 0 && treeStyles.indent(indent),
      )}>
      {meta.hasChildren ? (
        <TreeExpander
          isExpanded={meta.isExpanded}
          onToggle={() => store.getConfig().onToggleItem(item)}
          rowLabel={config.getRowLabel?.(item)}
        />
      ) : (
        <span {...stylex.props(treeStyles.leafSpacer)} />
      )}
      {children}
    </div>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useTableTreeData<T extends Record<string, unknown>>(
  config: UseTableTreeDataConfig<T>,
): TablePlugin<T> {
  const configRef = useRef(config);
  configRef.current = config;

  const storeRef = useRef<TreeStore<T> | null>(null);
  if (storeRef.current == null) {
    storeRef.current = createTreeStore(configRef);
  }
  const store = storeRef.current;

  // Notify subscribers on every render — useSyncExternalStore only
  // re-renders cells whose snapshot actually changed. Row ref subscribers
  // apply imperative ARIA independently.
  useEffect(() => {
    store.notify();
  });

  // transformColumns runs on every table render; wrapped column objects
  // must keep their identity across renders or the per-row memo breaks
  // and a toggle re-renders the whole body. Earlier plugins may rebuild
  // structurally-identical arrays each render, so the cache compares
  // input columns by shallow equality, not array identity. Held in a ref
  // (like rowExpansion's column tracking) — transforms run during
  // BaseTable's render, where a closure variable reassignment trips the
  // react-compiler lint.
  const columnsCacheRef = useRef<{
    input: TableColumn<T>[];
    treeKey: string | undefined;
    wrapped: boolean;
    output: TableColumn<T>[];
  } | null>(null);

  // The resolved tree column key, written by transformColumns (pipeline step 1)
  // and read by transformHeaderCell (step 4) to place the expand-all toggle on
  // the same column that carries the row expanders.
  const treeKeyRef = useRef<string | undefined>(undefined);

  // The plugin object is created once per store and never changes shape:
  // every transform reads the live config through the store, and
  // internally no-ops when hasExpandableRows is false. Swapping between
  // an empty and a context-wrapping plugin would change the element tree
  // and remount the whole table when flat data turns nested.
  return useMemo((): TablePlugin<T> => {
    const getCachedColumns = (
      columns: TableColumn<T>[],
      treeKey: string | undefined,
      wrapped: boolean,
    ): TableColumn<T>[] | null => {
      const cache = columnsCacheRef.current;
      if (!cache || cache.treeKey !== treeKey || cache.wrapped !== wrapped) {
        return null;
      }
      const prev = cache.input;
      if (prev !== columns) {
        if (prev.length !== columns.length) {
          return null;
        }
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] !== columns[i]) {
            return null;
          }
        }
      }
      return cache.output;
    };

    return {
      transformTableContext(children: ReactNode) {
        return <TreeStoreContext value={store}>{children}</TreeStoreContext>;
      },

      transformColumns(columns: TableColumn<T>[]) {
        const {hasExpandableRows, treeColumnKey} = store.getConfig();

        // Resolve the tree column: the configured key when present, else
        // the first non-synthetic column (a configured column may have
        // been hidden by columnSettings — the expander must not vanish).
        const configuredExists =
          treeColumnKey != null && columns.some(c => c.key === treeColumnKey);
        const treeKey = configuredExists
          ? treeColumnKey
          : (columns.find(c => !c.key.startsWith('__'))?.key ??
            columns[0]?.key);
        treeKeyRef.current = treeKey;

        // Migration guarantee: flat data renders identically to a Table
        // without the plugin.
        const wrapped = hasExpandableRows;
        const cached = getCachedColumns(columns, treeKey, wrapped);
        if (cached) {
          return cached;
        }
        const output = !wrapped
          ? columns
          : columns.map(col => {
              if (col.key !== treeKey) {
                return col;
              }
              const originalRenderCell = col.renderCell;
              return {
                ...col,
                renderCell: (item: T): ReactNode => (
                  <TreeCellContent item={item}>
                    {originalRenderCell
                      ? originalRenderCell(item)
                      : String(
                          (item[col.key] as
                            string | number | null | undefined) ?? '',
                        )}
                  </TreeCellContent>
                ),
              };
            });
        columnsCacheRef.current = {input: columns, treeKey, wrapped, output};
        return output;
      },

      transformHeaderCell(
        props: HeaderCellRenderProps,
        column: TableColumn<T>,
      ): HeaderCellRenderProps {
        const {
          hasExpandableRows,
          hasExpandAllControl,
          isAllExpanded,
          onExpandAll,
          onCollapseAll,
        } = store.getConfig();

        // Only the tree column carries the toggle, and only when the control
        // is enabled, the data is actually hierarchical, and the state hook
        // supplied the aggregate state plus both handlers. Otherwise this is a
        // pass-through (flat data stays a no-op).
        if (
          !hasExpandAllControl ||
          !hasExpandableRows ||
          column.key !== treeKeyRef.current ||
          isAllExpanded === undefined ||
          !onExpandAll ||
          !onCollapseAll
        ) {
          return props;
        }

        // Wrap the header label + the toggle in one inline-flex row so the
        // chevron sits to the LEFT of the title on the same line. BaseTable
        // only applies its own flex row for the `after` slot, so a bare
        // `before` would stack above the label in the block-level <th>.
        return {
          ...props,
          content: (
            <span {...stylex.props(treeStyles.headerCell)}>
              <TreeExpandAllToggle
                isAllExpanded={isAllExpanded}
                onExpandAll={onExpandAll}
                onCollapseAll={onCollapseAll}
              />
              {props.content}
            </span>
          ),
        };
      },

      transformBodyRow(props: BodyRowRenderProps, item: T) {
        // Attach a ref that subscribes to the store for imperative row
        // ARIA. The ref returns a cleanup so React unsubscribes on
        // detach — without it, every row re-render would leak one
        // subscription (toggles shift rowIndex and re-render rows, so
        // the listener set would grow on every toggle). The ref is
        // attached even when no row is expandable so tree ARIA is
        // removed if the data turns flat.
        const treeRef: React.RefCallback<HTMLTableRowElement> = el => {
          if (!el) {
            return;
          }
          const apply = () => {
            const cfg = store.getConfig();
            applyRowTreeAria(
              el,
              cfg.hasExpandableRows ? cfg.getRowMeta(item) : undefined,
            );
          };
          apply();
          const unsub = store.subscribe(apply);
          return () => {
            unsub();
          };
        };

        const withRef = {
          ...props,
          ref: props.ref ? mergeRefs(props.ref, treeRef) : treeRef,
        };

        // Whole-row-click expansion (opt-in). Only expandable rows are
        // clickable; leaves and flat data stay inert. `hasExpandableRows` is
        // the feature-level flag (short-circuits the whole feature when off);
        // `hasChildren` is the per-row check — both are intentional.
        const cfg = store.getConfig();
        const rowClickExpandable =
          cfg.hasRowClickExpansion === true &&
          cfg.hasExpandableRows &&
          cfg.getRowMeta(item)?.hasChildren === true;
        if (!rowClickExpandable) {
          return withRef;
        }

        return {
          ...withRef,
          htmlProps: {
            ...withRef.htmlProps,
            onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
              // Don't hijack clicks on interactive cell content (the chevron
              // already stops propagation, but a composed selection checkbox,
              // link, or action button does not) or a text selection. Shared
              // with `useClickableContainer` and the row-expansion plugin, so
              // the three surfaces cannot drift apart on what counts as
              // "this click belongs to something else".
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
              cfg.onToggleItem(item);
            },
          },
          xstyle: [...withRef.xstyle, treeStyles.clickableRow],
        };
      },
    };
  }, [store]);
}
