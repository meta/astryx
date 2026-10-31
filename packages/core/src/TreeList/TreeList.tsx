// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TreeList.tsx
 * @input Uses React, StyleX, theme tokens, TreeListItem, TreeListTypes, useTreeFocus
 * @output Exports TreeList component, TreeListProps type
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TreeList/TreeList.doc.mjs
 * - /packages/core/src/TreeList/index.ts
 * - /apps/storybook/stories/TreeList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/TreeList/ (showcase blocks)
 */

import {
  useId,
  useState,
  useMemo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {TreeListItem} from './TreeListItem';
import type {
  TreeListItemData,
  TreeListDensity,
  TreeListVariant,
} from './TreeListTypes';
import {themeProps} from '../utils/themeProps';
import {useTreeFocusInternal} from '../hooks/useTreeFocus';
import {LayoutChangeSnapshot} from '../motion/LayoutChangeSnapshot';
import {
  applyLayoutChangeTransition,
  holdLayoutExit,
  playLayoutChange,
  releaseLayoutExit,
  reportLayoutChange,
  type AnimatedLayout,
  type LayoutChange,
} from '../motion/animatedLayout';

// =============================================================================
// Types
// =============================================================================

export {type TreeListDensity, type TreeListVariant} from './TreeListTypes';

export interface TreeListProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * The handle from `useAnimatedLayout({containerRef})`. With it, expanding
   * or collapsing a row glides the rows and content after it, up to that
   * container, instead of jumping, and the chevron turns on the same timing.
   */
  animatedLayout?: AnimatedLayout;

  /**
   * Tree items as a recursive data structure.
   * Each item can have nested `children` arrays.
   */
  items: TreeListItemData[];

  /**
   * Spacing density for tree list items.
   * - 'compact': Tighter spacing for dense UIs
   * - 'balanced': Standard spacing
   * - 'spacious': Extra spacing for readability
   * @default 'balanced'
   */
  density?: TreeListDensity;

  /**
   * Visual treatment of the hierarchy guide (connector) lines.
   * - `lineGuides`: connector lines between parent and child rows
   * - `noGuides`: no connector lines; indentation alone conveys nesting
   *
   * Orthogonal to `density` (which controls spacing) — the two compose.
   * @default 'lineGuides'
   */
  variant?: TreeListVariant;

  /**
   * Header content rendered above the tree list.
   * Semantically associated via aria-labelledby.
   */
  header?: ReactNode;

  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    position: 'relative',
    // Contain the guides' and focused rows' `z-index` (TreeListBranches,
    // TreeListItem) inside the tree, so they never climb over a sticky header
    // or other positioned content outside the list.
    isolation: 'isolate',
    // Per-level indentation step. Public, themeable lever: a theme can retune
    // the tree's indent metric (e.g. to `var(--spacing-5)`) via `defineTheme`
    // on the `tree-list` target, and both the row indents (TreeListItem) and
    // the guide-line offsets (TreeListBranches) read it so they stay aligned.
    '--tree-list-indent': spacingVars['--spacing-4'],
    // Vertical gap between adjacent rows. Public, themeable lever (default
    // `--spacing-0-5` = 2px for a subtle separation between rows). A theme sets
    // it on the `tree-list` target to widen or close the gap; the guide
    // connector spans the gap natively (see TreeListBranches) so the line stays
    // continuous and does not overhang the last row — no consumer-side guide
    // tuning needed.
    '--tree-list-row-gap': spacingVars['--spacing-0-5'],
  },
  list: {
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  header: {
    marginBottom: spacingVars['--spacing-2'],
  },
});

// =============================================================================
// Helpers
// =============================================================================

/** Recursively collect IDs of items marked as `isExpanded`. */
function collectExpandedKeys(items: TreeListItemData[]): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if (item.isExpanded && item.children != null && item.children.length > 0) {
      keys.push(item.id);
    }
    if (item.children != null) {
      keys.push(...collectExpandedKeys(item.children));
    }
  }
  return keys;
}

/**
 * Compute the initial roving-tabindex seed: the first selected enabled item in
 * document order, else the first enabled item, else the first item. The hook
 * (useTreeFocus with hasRovingTabIndex) takes ownership after mount — it
 * preserves this seeded `tabindex="0"` on its repair pass and moves the stop
 * with keyboard navigation.
 */
function findInitialTabbableId(items: TreeListItemData[]): string | undefined {
  let firstEnabled: string | undefined;
  const walk = (list: TreeListItemData[]): string | undefined => {
    for (const item of list) {
      if (item.isSelected && item.isDisabled !== true) {
        return item.id;
      }
      if (firstEnabled == null && item.isDisabled !== true) {
        firstEnabled = item.id;
      }
      if (item.children != null && item.children.length > 0) {
        const selected = walk(item.children);
        if (selected != null) {
          return selected;
        }
      }
    }
    return undefined;
  };
  return walk(items) ?? firstEnabled ?? items[0]?.id;
}

// =============================================================================
// Component
// =============================================================================

/**
 * A data-driven tree list component for rendering hierarchical data.
 *
 * Accepts an `items` array of recursive config objects. Expansion state is
 * managed internally — seed initial state by setting `isExpanded: true` on
 * individual items in the data.
 * Positional data (nestedLevel, isLast, ancestorsIsLast) is computed during
 * rendering — no context, no cloneElement, no force-update mechanism.
 *
 * @example
 * ```
 * <TreeList
 *   items={[
 *     { id: 'src', label: 'src', isExpanded: true, children: [
 *       { id: 'app', label: 'App.tsx' },
 *       { id: 'index', label: 'index.tsx' },
 *     ]},
 *     { id: 'pkg', label: 'package.json' },
 *   ]}
 * />
 * ```
 */
/** Whether two sets of row ids hold the same rows. */
function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }
  return true;
}

export function TreeList({
  items,
  density = 'balanced',
  variant = 'lineGuides',
  header,
  xstyle,
  className,
  style,
  'data-testid': testId,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ref,
  onKeyDown: onKeyDownProp,
  animatedLayout,
  ...restProps
}: TreeListProps) {
  const headerId = useId();

  // Expanded keys from data: recomputed whenever items change.
  const expandedKeysFromProps = useMemo(
    () => new Set(collectExpandedKeys(items)),
    [items],
  );

  // User overrides: only stores IDs the user has explicitly toggled.
  const [expandedKeysOverride, setExpandedKeysOverride] = useState<
    Map<string, boolean>
  >(() => new Map());

  // With an `animatedLayout` handle, a row's size change (its children shown
  // or hidden) animates up to the handle's container: the rows and content after it glide, and
  // the shown group plays its own entrance on the same timing
  // (`architecture:react-component-runtime` INV12). Read through a ref
  // because the tree element comes from the focus hook below.
  const treeElementRef = useRef<HTMLUListElement | null>(null);
  // The rows expanded now, whatever expanded them (a click, the keyboard, or
  // `isExpanded` changed in `items`).
  const expandedIds = useMemo(() => {
    const out = new Set<string>();
    const walk = (list: ReadonlyArray<TreeListItemData>) => {
      for (const item of list) {
        if (item.children == null || item.children.length === 0) {
          continue;
        }
        const isExpanded = expandedKeysOverride.has(item.id)
          ? (expandedKeysOverride.get(item.id) ?? false)
          : expandedKeysFromProps.has(item.id);
        if (isExpanded) {
          out.add(item.id);
          walk(item.children);
        }
      }
    };
    walk(items);
    return out;
  }, [items, expandedKeysOverride, expandedKeysFromProps]);
  // Rows whose collapse is still playing its exit: their child group stays
  // rendered (the exit makes it inert and gives up its space) until it ends
  // (`spec:AST-105` FR4). Derived from the expanded rows as they change,
  // during render, so the collapsing commit already keeps the group.
  const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [renderedExpandedIds, setRenderedExpandedIds] = useState(expandedIds);
  if (!sameIds(renderedExpandedIds, expandedIds)) {
    setRenderedExpandedIds(expandedIds);
    if (animatedLayout != null) {
      const next = new Set(exitingIds);
      for (const id of renderedExpandedIds) {
        if (!expandedIds.has(id)) {
          next.add(id);
        }
      }
      for (const id of expandedIds) {
        next.delete(id);
      }
      setExitingIds(next);
    }
  }
  const endExit = useCallback((id: string) => {
    // Called from the exit effect: holdLayoutExit decides from layout read
    // in the collapsing commit (the group's place in the area's visible part,
    // Reduce Motion and the pointer, and whether an end margin frees its
    // space); a group it does not hold goes before the frame paints.
    setExitingIds(prev => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  // Every expansion change is measured before it lands (`spec:AST-105` FR1):
  // LayoutChangeSnapshot calls this in the commit, before the DOM changes,
  // for each row whose expansion changed. The row's own chevron (the Icon in
  // its toggle, the first one in the row) turns on the glide's motion.
  const pendingLayoutRef = useRef<
    {
      change: LayoutChange;
      id: string;
      isExpanding: boolean;
      /** Changed rows inside this one: they move and exit with it. */
      nested: string[];
    }[]
  >([]);
  const measureChanges = useCallback(
    (previous: ReadonlySet<string>) => {
      const changed = [
        ...[...previous].filter(id => !expandedIds.has(id)),
        ...[...expandedIds].filter(id => !previous.has(id)),
      ];
      const rows = new Map<string, HTMLElement>();
      for (const id of changed) {
        const row = treeElementRef.current?.querySelector<HTMLElement>(
          `[data-tree-id="${CSS.escape(id)}"]`,
        );
        if (row != null) {
          rows.set(id, row);
        }
      }
      // A changed row inside another changed row (a child left expanded when
      // its parent collapses) is not a change of its own: its group goes with
      // the outer one, so the content after them moves once (`spec:AST-105`
      // FR3).
      const outerOf = (row: HTMLElement): string | undefined =>
        [...rows].find(
          ([, other]) => other !== row && other.contains(row),
        )?.[0];
      const nested = new Map<string, string[]>();
      for (const [id, row] of rows) {
        const outer = outerOf(row);
        if (outer != null) {
          nested.set(outer, [...(nested.get(outer) ?? []), id]);
        }
      }
      for (const [id, row] of rows) {
        if (outerOf(row) != null) {
          continue;
        }
        applyLayoutChangeTransition(
          animatedLayout,
          row.querySelector<HTMLElement>('[data-tree-toggle] > .astryx-icon'),
        );
        const change = reportLayoutChange(animatedLayout, () => row);
        change.measureBefore();
        pendingLayoutRef.current.push({
          change,
          id,
          isExpanding: expandedIds.has(id),
          nested: nested.get(id) ?? [],
        });
      }
    },
    [animatedLayout, expandedIds],
  );
  // Without a handle the chevrons keep the theme's own turn: a spring a
  // handle set stays only while it is passed (`spec:AST-105` FR2).
  useLayoutEffect(() => {
    if (animatedLayout != null) {
      return;
    }
    for (const chevron of treeElementRef.current?.querySelectorAll<HTMLElement>(
      '[data-tree-toggle] > .astryx-icon',
    ) ?? []) {
      applyLayoutChangeTransition(null, chevron);
    }
  }, [animatedLayout]);
  const handleToggle = useCallback(
    (id: string) => {
      setExpandedKeysOverride(prev => {
        const next = new Map(prev);
        const isCurrentlyExpanded = prev.has(id)
          ? (prev.get(id) ?? false)
          : expandedKeysFromProps.has(id);
        next.set(id, !isCurrentlyExpanded);
        return next;
      });
    },
    [expandedKeysFromProps],
  );

  // ---------------------------------------------------------------------------
  // Roving tabindex + APG tree keyboard model (via useTreeFocus)
  // ---------------------------------------------------------------------------

  // The hook (hasRovingTabIndex) owns the tree's single tab stop: it repairs
  // the stop on mount and moves it with keyboard navigation. We only seed the
  // initially-tabbable treeitem in the render (selected item or first enabled);
  // the hook's repair pass preserves that seeded `tabindex="0"`.
  const initialTabbableId = useMemo(
    () => findInitialTabbableId(items),
    [items],
  );

  // Enter/Space activation: prefer the treeitem's own inner action (link or
  // button); return true when handled so the hook does not also toggle. Scoped
  // to this treeitem's own row — never a descendant treeitem's action inside an
  // expanded group.
  const activateItem = useCallback((current: HTMLElement): boolean => {
    // The chevron toggle is marked with `data-tree-toggle` (set by
    // TreeListItem) so this filter stays stable across locales — matching by
    // aria-label would break under any locale where "Toggle children" is
    // translated.
    const candidates = current.querySelectorAll<HTMLElement>(
      'a[href], button:not([data-tree-toggle])',
    );
    for (const candidate of candidates) {
      if (candidate.closest('[role="treeitem"]') === current) {
        candidate.click();
        return true;
      }
    }
    return false;
  }, []);

  useLayoutEffect(() => {
    const pendings = pendingLayoutRef.current;
    pendingLayoutRef.current = [];
    for (const pending of pendings) {
      const isMeasured = pending.change.animate();
      const group = treeElementRef.current?.querySelector<HTMLElement>(
        `[data-tree-id="${CSS.escape(pending.id)}"] > [role="group"]`,
      );
      if (pending.isExpanding) {
        if (group != null) {
          // Expanded again mid-exit: the group takes its place in flow.
          releaseLayoutExit(group);
          if (isMeasured) {
            playLayoutChange(animatedLayout, group);
          }
        }
        continue;
      }
      // The rows nested in it leave with it, once its exit ends.
      const endAll = () => {
        endExit(pending.id);
        for (const id of pending.nested) {
          endExit(id);
        }
      };
      const isHeld =
        isMeasured &&
        group != null &&
        holdLayoutExit(animatedLayout, group, endAll);
      if (!isHeld) {
        // An exit holdLayoutExit did not hold (out of view, Reduce Motion
        // with a fine pointer, or no margin frees its space): the group goes
        // before this frame paints.
        endAll();
      }
    }
  }, [expandedIds, animatedLayout, endExit]);

  const {treeRef, handleKeyDown, handleFocus} =
    useTreeFocusInternal<HTMLUListElement>({
      onToggleExpand: handleToggle,
      onActivate: activateItem,
      hasRovingTabIndex: true,
      // Rows are named by their label (AR1); typeahead matches that label, not
      // the chevron toggle, start content or description.
      matchLabelledBy: true,
      // Rows of a group still playing its collapse are gone already.
      itemSelector: '[role="treeitem"]:not([data-tree-exiting] *)',
    });
  useLayoutEffect(() => {
    treeElementRef.current = treeRef.current;
  });

  const handleRootKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      if (
        treeRef.current != null &&
        e.target instanceof Node &&
        treeRef.current.contains(e.target)
      ) {
        handleKeyDown(e);
      }
    },
    [onKeyDownProp, handleKeyDown, treeRef],
  );

  const hasExpandableItems = items.some(
    item => item.children != null && item.children.length > 0,
  );

  function renderItems(
    items: TreeListItemData[],
    nestedLevel: number,
    ancestorsIsLast: ReadonlyArray<boolean>,
  ): ReactNode {
    // A leaf reserves the chevron column (so its label lines up under a parent's
    // caret) whenever the tree contains ANY expandable item — i.e. whenever a
    // caret exists somewhere to align under. This is a whole-tree property, not
    // a per-group one: a leaf nested under an expandable ancestor must still
    // reserve the column so it stays indented past its parent's label, even if
    // its own immediate group happens to be all leaves. Only a fully flat tree
    // (no expandable items anywhere) has no caret to align under, so its rows
    // sit flush. Because any expandable descendant forces its whole ancestor
    // chain to be expandable, "the tree has an expandable item" is equivalent to
    // "the root group has an expandable item" — checked once at the root.
    return items.map((item, index) => {
      const isLast = index === items.length - 1;
      const isExpanded = expandedKeysOverride.has(item.id)
        ? (expandedKeysOverride.get(item.id) ?? false)
        : expandedKeysFromProps.has(item.id);
      const hasChildren = item.children != null && item.children.length > 0;

      const ancestorsIsLastForChildren = hasChildren
        ? [...ancestorsIsLast, isLast]
        : ancestorsIsLast;

      const isExiting = exitingIds.has(item.id);
      const renderedChildren =
        (isExpanded || isExiting) && hasChildren
          ? renderItems(
              item.children ?? [],
              nestedLevel + 1,
              ancestorsIsLastForChildren,
            )
          : undefined;

      return (
        <TreeListItem
          key={item.id}
          id={item.id}
          label={item.label}
          description={item.description}
          startContent={item.startContent}
          endContent={item.endContent}
          xstyle={item.xstyle}
          className={item.className}
          style={item.style}
          hasChildren={hasChildren}
          hasExpandableItems={hasExpandableItems}
          onClick={item.onClick}
          href={item.href}
          target={item.target}
          isDisabled={item.isDisabled}
          isSelected={item.isSelected}
          nestedLevel={nestedLevel}
          isLast={isLast}
          ancestorsIsLast={ancestorsIsLast}
          isExpanded={isExpanded}
          isExiting={isExiting && !isExpanded}
          onToggle={handleToggle}
          density={density}
          variant={variant}
          renderedChildren={renderedChildren}
          posInSet={index + 1}
          setSize={items.length}
          isTabbable={item.id === initialTabbableId}
        />
      );
    });
  }

  return (
    <div
      ref={ref}
      data-testid={testId}
      onKeyDown={handleRootKeyDown}
      {...mergeProps(
        themeProps('tree-list', {density, variant}),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...restProps}>
      {header != null && (
        <div id={headerId} {...stylex.props(styles.header)}>
          {header}
        </div>
      )}
      {animatedLayout != null && (
        <LayoutChangeSnapshot
          value={expandedIds}
          onBeforeChange={measureChanges}
        />
      )}
      <ul
        ref={treeRef}
        role="tree"
        aria-label={header != null ? undefined : ariaLabel}
        aria-labelledby={header != null ? headerId : ariaLabelledby}
        onFocus={handleFocus}
        {...stylex.props(styles.list)}>
        {renderItems(items, 0, [])}
      </ul>
    </div>
  );
}

TreeList.displayName = 'TreeList';
