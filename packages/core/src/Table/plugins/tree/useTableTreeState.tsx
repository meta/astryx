// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableTreeState.tsx
 * @input React
 * @output Exports useTableTreeState hook and config/result types
 * @position Tree state helper; owns the expanded set + flattens nested data.
 *   Pairs with useTableTreeData (the headless tree plugin).
 *
 * Modeled after useTableSortableState — a convenience layer that owns state
 * (controlled or uncontrolled) and produces both the visible flattened rows
 * and a ready-to-use config for the headless plugin. Data shaping stays
 * outside the render pipeline: Table always receives exactly the rows it
 * renders, so collapsed subtrees are unmounted, not hidden.
 */

import {useCallback, useMemo, useRef, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import type {
  TableTreeRowMeta,
  UseTableTreeDataConfig,
} from './useTableTreeData';

// =============================================================================
// Config
// =============================================================================

export interface UseTableTreeStateConfig<T extends Record<string, unknown>> {
  /** Nested data: rows may carry child rows under `childrenKey`. */
  data: T[];
  /** Row ID accessor: property name, or a function returning a unique id. */
  idKey: (keyof T & string) | ((item: T) => string | number);
  /**
   * Property holding each row's children array.
   * @default 'children'
   */
  childrenKey?: string;
  /** Initial expanded row ids for uncontrolled mode. Ignored when `expandedIds` is provided. */
  defaultExpandedIds?: Iterable<string>;
  /**
   * Controlled set of expanded row ids. When provided, the hook uses this
   * instead of internal state. Pair with `onExpandedIdsChange`.
   */
  expandedIds?: ReadonlySet<string>;
  /** Called with the next expanded set whenever expansion changes. */
  onExpandedIdsChange?: (ids: ReadonlySet<string>) => void;
  /**
   * Should this row show an expander? Overrides the default
   * "has a non-empty children array" check — use for lazy loading, where a
   * row is expandable before its children have been fetched.
   */
  isItemExpandable?: (item: T) => boolean;
  /**
   * Sort each sibling group independently during flattening. Children always
   * stay directly under their parent — sorting never crosses levels. Pass
   * `applySort` from `useTableSortableState` to compose with column sorting.
   */
  sortSiblings?: (siblings: T[]) => T[];
  /** Indent step per level, forwarded to useTableTreeData. */
  indent?: 'sm' | 'md' | 'lg';
  /** Column that carries the tree affordance, forwarded to useTableTreeData. */
  treeColumnKey?: string;
}

// =============================================================================
// Result
// =============================================================================

export interface UseTableTreeStateResult<T extends Record<string, unknown>> {
  /** The flattened, currently-visible rows. Pass to `<Table data>`. */
  visibleData: T[];
  /** Ready-to-use config for useTableTreeData. */
  treeConfig: UseTableTreeDataConfig<T>;
  /** The current expanded row ids. */
  expandedIds: ReadonlySet<string>;
  /**
   * Aggregate expansion state across every expandable row: `true` when all are
   * expanded, `false` when none are, `'indeterminate'` when some but not all
   * are. Drives the header expand-all control. Reports `false` for flat data.
   */
  isAllExpanded: boolean | 'indeterminate';
  /** Expand every expandable row in the tree. */
  expandAll: () => void;
  /** Collapse every row. */
  collapseAll: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useTableTreeState<T extends Record<string, unknown>>(
  config: UseTableTreeStateConfig<T>,
): UseTableTreeStateResult<T> {
  const {
    data,
    idKey,
    childrenKey = 'children',
    defaultExpandedIds,
    expandedIds: controlledExpandedIds,
    onExpandedIdsChange,
    isItemExpandable,
    sortSiblings,
    indent,
    treeColumnKey,
  } = config;

  const getId = useCallback(
    (item: T): string =>
      typeof idKey === 'function' ? String(idKey(item)) : String(item[idKey]),
    [idKey],
  );

  const getChildren = useCallback(
    (item: T): T[] => {
      const children = item[childrenKey];
      return Array.isArray(children) ? (children as T[]) : [];
    },
    [childrenKey],
  );

  const getIsExpandable = useCallback(
    (item: T): boolean =>
      isItemExpandable ? isItemExpandable(item) : getChildren(item).length > 0,
    [isItemExpandable, getChildren],
  );

  // Internal state (used in uncontrolled mode)
  const [internalExpandedIds, setInternalExpandedIds] = useState<
    ReadonlySet<string>
  >(() => new Set(defaultExpandedIds));

  // Resolve controlled vs uncontrolled
  const isControlled = controlledExpandedIds !== undefined;
  const expandedIds = isControlled
    ? controlledExpandedIds
    : internalExpandedIds;

  // Stable refs so callbacks don't churn on inline-prop identity changes
  const expandedIdsRef = useRef(expandedIds);
  const onExpandedIdsChangeRef = useRef(onExpandedIdsChange);
  // Syncs the refs with the committed render. A render that React discards,
  // as a suspended transition does, must not leave its rows or callback
  // behind.
  useIsomorphicLayoutEffect(() => {
    expandedIdsRef.current = expandedIds;
    onExpandedIdsChangeRef.current = onExpandedIdsChange;
  });

  const commitExpandedIds = useCallback(
    (next: ReadonlySet<string>) => {
      // Advance the ref immediately so a second commit in the same React
      // batch (e.g. two onToggleItem calls in one event handler) builds
      // on this one instead of the pre-batch set. The ref re-syncs from
      // the resolved state at the next commit either way.
      expandedIdsRef.current = next;
      if (!isControlled) {
        setInternalExpandedIds(next);
      }
      onExpandedIdsChangeRef.current?.(next);
    },
    [isControlled],
  );

  // Flatten: depth-first walk emitting only visible rows, collecting per-row
  // meta ({level, hasChildren, isExpanded}) in the same pass. Children mount
  // only when their parent is expanded, so collapsed subtrees stay unmounted.
  // `path` holds the ids on the current ancestor chain: an edge pointing back
  // at an ancestor is skipped instead of recursing forever. Sibling arrays
  // are copied before sortSiblings so an in-place sorter can't reorder the
  // consumer's data.
  const {visibleData, metaMap} = useMemo(() => {
    const rows: T[] = [];
    const meta = new Map<string, TableTreeRowMeta>();
    const path = new Set<string>();
    const walk = (items: T[], level: number) => {
      const siblings = sortSiblings ? sortSiblings([...items]) : items;
      for (const item of siblings) {
        const id = getId(item);
        if (path.has(id)) {
          continue; // cyclic edge — this row is its own ancestor
        }
        const hasChildren = getIsExpandable(item);
        const isExpanded = hasChildren && expandedIds.has(id);
        rows.push(item);
        meta.set(id, {id, level, hasChildren, isExpanded});
        if (isExpanded) {
          path.add(id);
          walk(getChildren(item), level + 1);
          path.delete(id);
        }
      }
    };
    walk(data, 0);
    return {visibleData: rows, metaMap: meta};
  }, [data, expandedIds, getId, getChildren, getIsExpandable, sortSiblings]);

  // Every expandable row id across the whole tree, including collapsed
  // subtrees (drives expandAll and the migration no-op flag). Same
  // ancestor-chain guard as the flatten walk.
  const allExpandableIds = useMemo(() => {
    const idsAcc: string[] = [];
    const path = new Set<string>();
    const walk = (items: T[]) => {
      for (const item of items) {
        const id = getId(item);
        if (path.has(id)) {
          continue;
        }
        if (getIsExpandable(item)) {
          idsAcc.push(id);
        }
        path.add(id);
        walk(getChildren(item));
        path.delete(id);
      }
    };
    walk(data);
    return idsAcc;
  }, [data, getId, getChildren, getIsExpandable]);

  const hasExpandableRows = allExpandableIds.length > 0;

  // Aggregate state for the header expand-all control. Only expandable ids
  // count toward the total, so expanded ids that match a leaf or no row at
  // all never skew the tally.
  const isAllExpanded: boolean | 'indeterminate' = useMemo(() => {
    if (!hasExpandableRows) {
      return false;
    }
    const expandedCount = allExpandableIds.filter(id =>
      expandedIds.has(id),
    ).length;
    if (expandedCount === 0) {
      return false;
    }
    if (expandedCount === allExpandableIds.length) {
      return true;
    }
    return 'indeterminate';
  }, [hasExpandableRows, allExpandableIds, expandedIds]);

  const onToggleItem = useCallback(
    (item: T) => {
      const id = getId(item);
      const next = new Set(expandedIdsRef.current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      commitExpandedIds(next);
    },
    [getId, commitExpandedIds],
  );

  const expandAll = useCallback(() => {
    commitExpandedIds(new Set(allExpandableIds));
  }, [commitExpandedIds, allExpandableIds]);

  const collapseAll = useCallback(() => {
    commitExpandedIds(new Set());
  }, [commitExpandedIds]);

  const getRowMeta = useCallback(
    (item: T): TableTreeRowMeta | undefined => metaMap.get(getId(item)),
    [metaMap, getId],
  );

  const treeConfig = useMemo(
    (): UseTableTreeDataConfig<T> => ({
      getRowMeta,
      onToggleItem,
      hasExpandableRows,
      isAllExpanded,
      onExpandAll: expandAll,
      onCollapseAll: collapseAll,
      indent,
      treeColumnKey,
    }),
    [
      getRowMeta,
      onToggleItem,
      hasExpandableRows,
      isAllExpanded,
      expandAll,
      collapseAll,
      indent,
      treeColumnKey,
    ],
  );

  return {
    visibleData,
    treeConfig,
    expandedIds,
    isAllExpanded,
    expandAll,
    collapseAll,
  };
}
