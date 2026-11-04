// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file OverflowList.tsx
 * @input Uses React, StyleX, useOverflow hook
 * @output Exports OverflowList component and OverflowListProps type
 * @position Core implementation; consumed by index.ts
 *
 * Renders a horizontal list of items, hiding those that don't fit in the
 * available width and optionally showing an overflow indicator. Supports an
 * optional item cap (`maxVisibleItems`) and bounded multi-row wrapping
 * (`maxRows`). Uses a hidden measurement container to avoid flickering.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/OverflowList/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/OverflowList/ (showcase blocks)
 */

import {
  type ReactNode,
  type ReactElement,
  Children,
  useCallback,
  useRef,
  useState,
} from 'react';
import type {BaseProps} from '../BaseProps';
import {isRenderable} from '../utils/isRenderable';
import type {SpacingStep} from '../utils/types';
import * as stylex from '@stylexjs/stylex';
import {mergeProps} from '../utils';
import {useOverflow} from '../hooks/useOverflow';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {spacingVars} from '../theme/tokens.stylex';
import {themeProps} from '../utils/themeProps';

import {useMergedRefs} from '../hooks/useMergedRefs';
const styles = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  containerMultiRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    overflow: 'hidden',
    whiteSpace: 'normal',
    minWidth: 0,
  },
  fillParent: {
    width: '100%',
  },
  measureContainer: {
    position: 'absolute',
    visibility: 'hidden',
    height: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  measureIndicator: {
    display: 'inline-flex',
  },
});

const multiRowHeight = stylex.create({
  height: (maxRows: number, rowHeight: number, gapPx: number) => ({
    maxHeight: `calc(${rowHeight}px * ${maxRows} + ${gapPx}px * ${maxRows - 1})`,
  }),
});

const gapStyles = stylex.create({
  0: {gap: spacingVars['--spacing-0']},
  0.5: {gap: spacingVars['--spacing-0-5']},
  1: {gap: spacingVars['--spacing-1']},
  1.5: {gap: spacingVars['--spacing-1-5']},
  2: {gap: spacingVars['--spacing-2']},
  3: {gap: spacingVars['--spacing-3']},
  4: {gap: spacingVars['--spacing-4']},
  5: {gap: spacingVars['--spacing-5']},
  6: {gap: spacingVars['--spacing-6']},
  8: {gap: spacingVars['--spacing-8']},
  10: {gap: spacingVars['--spacing-10']},
});

/**
 * Maps spacing token steps to pixel values for overflow calculations.
 */
const spacingToPx: Record<SpacingStep, number> = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
};

export interface OverflowItem {
  /** The React element for this item */
  child: ReactElement;
  /** The index of this item in the original children list */
  index: number;
}

export interface OverflowListProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the visible container element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * The items to render. Each child should be a single element.
   */
  children: ReactNode;

  /**
   * Gap between items as a spacing token step.
   * Accepts: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10
   * @default 2
   */
  gap?: SpacingStep;

  /**
   * Minimum number of items to always show.
   * @default 0
   */
  minVisibleItems?: number;

  /**
   * Maximum number of items to ever show, even when they all fit. The ceiling
   * partner to `minVisibleItems`; extra items collapse into the overflow
   * indicator. Leave undefined for no cap. If it is less than
   * `minVisibleItems`, the floor wins (and a dev-only warning is logged).
   * @default undefined
   */
  maxVisibleItems?: number;

  /**
   * Wrap items across up to this many rows before collapsing the remainder
   * into the overflow indicator. Leave undefined (or set `1`) for the default
   * single-line behavior. A number, not a boolean — unbounded wrapping is a
   * plain flex-wrap layout, not overflow collapse. Assumes uniform row height.
   * @default undefined
   */
  maxRows?: number;

  /**
   * Which end to collapse items from.
   * @default 'end'
   */
  collapseFrom?: 'start' | 'end';

  /**
   * Which element to observe for overflow calculations.
   * - `'observeSelf'`: uses the container's own width (default)
   * - `'observeParent'`: observes the parent element's content width
   *   for overflow calculations. This keeps the overflow list
   *   content-sized while still detecting available space for
   *   grow-back. Siblings that don't fit can wrap and be clipped by
   *   the parent's overflow.
   * @default 'observeSelf'
   */
  behavior?: 'observeParent' | 'observeSelf';

  /**
   * Render function for the overflow indicator. Receives the list of
   * items that are not visible, each with its original index. Only called
   * when there are overflowing items.
   *
   * The indicator is automatically measured in a hidden container to
   * reserve the correct amount of space.
   *
   * @example
   * ```
   * const labels = ['Save', 'Edit', 'Share'];
   * <OverflowList
   *   overflowRenderer={(overflowItems) => (
   *     <DropdownMenu
   *       button={{label: `+${overflowItems.length}`, variant: 'ghost'}}
   *       items={overflowItems.map(({index}) => ({ label: labels[index] }))}
   *     />
   *   )}>
   *   {labels.map(l => <Button key={l} label={l} />)}
   * </OverflowList>
   * ```
   */
  overflowRenderer?: (overflowItems: OverflowItem[]) => ReactNode;

  /**
   * Called with the items that are currently collapsed, whenever that set
   * changes.
   *
   * Use it when the collapsed items belong in a menu the surrounding UI
   * already renders (a row that already has its own "…" button), so the list
   * does not grow a second anchor beside it. `overflowRenderer` cannot serve
   * that case: it is only rendered while items overflow, and its measurement
   * copy always receives every item.
   *
   * The contract:
   * - It fires once measurement has collapsed something, and again with an
   *   empty array once the row widens back out and everything fits.
   * - It is **silent while nothing overflows** — including on mount, so a list
   *   that fits from the start never calls it. There is no report of the
   *   pre-measurement state, which would always be an empty set whether or not
   *   the row actually overflows. Hold the collapsed set in state initialised
   *   to `[]` and it is correct at every moment; if you remount the list while
   *   keeping that state, reset it yourself.
   * - Reports are keyed on the collapsed items' original indices and React
   *   keys. Membership and order changes report even when the count stays the
   *   same; unrelated re-renders and callback identity changes do not.
   *
   * Give dynamic children stable React keys. Items include their current
   * original `index`; use it to look up your own data rather than storing
   * `child`.
   *
   * @example
   * ```
   * const [hidden, setHidden] = useState<OverflowItem[]>([]);
   * <>
   *   <OverflowList onOverflowChange={setHidden}>{items}</OverflowList>
   *   <DropdownMenu
   *     button={{label: 'More', variant: 'ghost'}}
   *     items={[...alwaysThere, ...hidden.map(({index}) => actions[index])]}
   *   />
   * </>
   * ```
   */
  onOverflowChange?: (overflowItems: OverflowItem[]) => void;
}

/**
 * A horizontal list that hides items that don't fit and shows an overflow indicator.
 *
 * Uses a hidden measurement container to determine which items fit without
 * causing visual flickering. The overflow indicator is also measured
 * automatically so no manual width value is needed.
 *
 * @example
 * ```
 * <OverflowList
 *   gap={2}
 *   overflowRenderer={(items) => (
 *     <Button label={`+${items.length} more`} variant="ghost" />
 *   )}>
 *   <Button label="Action 1" />
 *   <Button label="Action 2" />
 *   <Button label="Action 3" />
 *   <Button label="Action 4" />
 * </OverflowList>
 * ```
 */
export function OverflowList({
  children,
  gap = 2,
  minVisibleItems = 0,
  maxVisibleItems,
  maxRows,
  collapseFrom = 'end',
  behavior = 'observeSelf',
  overflowRenderer,
  onOverflowChange,
  xstyle,
  className,
  style,
  ref,
  ...props
}: OverflowListProps) {
  const childArray = Children.toArray(children) as ReactElement[];
  const itemCount = childArray.length;

  const gapPx = spacingToPx[gap];

  const observeParent = behavior === 'observeParent';
  const isMultiRow = maxRows != null && maxRows > 1;

  const {containerRef, measureRef, visibleCount, hasOverflow, rowHeight} =
    useOverflow(itemCount, {
      gap: gapPx,
      minVisibleItems,
      maxVisibleItems,
      maxRows,
      collapseFrom,
      behavior,
    });

  const allItems: OverflowItem[] = childArray.map((child, index) => ({
    child,
    index,
  }));

  let visibleItems: OverflowItem[];
  let overflowItems: OverflowItem[];

  if (collapseFrom === 'end') {
    visibleItems = allItems.slice(0, visibleCount);
    overflowItems = allItems.slice(visibleCount);
  } else {
    visibleItems = allItems.slice(itemCount - visibleCount);
    overflowItems = allItems.slice(0, itemCount - visibleCount);
  }

  // Render a placeholder for measurement — uses all items as overflow
  // so the indicator renders at its maximum possible width.
  const measureIndicator = overflowRenderer?.(allItems);

  // Re-run measurement when keyed children change without resizing the row.
  // The measured key delays reporting until that measurement has committed.
  // Lists without the callback skip all identity work.
  const measurementKey = onOverflowChange
    ? JSON.stringify({
        children: childArray.map((child, index) => [index, child.key]),
        gap,
        minVisibleItems,
        maxVisibleItems,
        maxRows,
        collapseFrom,
        behavior,
      })
    : '';
  const [measuredKey, setMeasuredKey] = useState(measurementKey);
  const reportMeasureRef = useCallback(
    (element: HTMLElement | null) => {
      measureRef(element);
      if (element) {
        setMeasuredKey(measurementKey);
      }
    },
    [measureRef, measurementKey],
  );

  // Report after measurement, before paint, so a standing menu updates in the
  // same frame as the visible row. Keys distinguish membership and order while
  // suppressing callback-only or unrelated re-renders. The initial empty key
  // suppresses the optimistic pre-measurement render.
  const overflowKey = onOverflowChange
    ? JSON.stringify(overflowItems.map(({child, index}) => [index, child.key]))
    : '[]';
  const reportedKeyRef = useRef('[]');
  const overflowItemsRef = useRef(overflowItems);
  overflowItemsRef.current = overflowItems;

  useIsomorphicLayoutEffect(() => {
    if (
      !onOverflowChange ||
      measuredKey !== measurementKey ||
      reportedKeyRef.current === overflowKey
    ) {
      return;
    }
    reportedKeyRef.current = overflowKey;
    onOverflowChange(overflowItemsRef.current);
  }, [measuredKey, measurementKey, overflowKey, onOverflowChange]);

  return (
    <>
      {/* Hidden measurement container */}
      <div
        ref={reportMeasureRef}
        aria-hidden="true"
        inert
        {...stylex.props(styles.measureContainer, gapStyles[gap])}>
        {childArray}
        {isRenderable(measureIndicator) && (
          <div {...stylex.props(styles.measureIndicator)}>
            {measureIndicator}
          </div>
        )}
      </div>

      {/* Visible container */}
      <div
        ref={useMergedRefs(ref, containerRef)}
        {...mergeProps(
          themeProps('overflow-list'),
          stylex.props(
            isMultiRow ? styles.containerMultiRow : styles.container,
            gapStyles[gap],
            isMultiRow &&
              rowHeight > 0 &&
              maxRows != null &&
              multiRowHeight.height(maxRows, rowHeight, gapPx),
            observeParent && hasOverflow && styles.fillParent,
            xstyle,
          ),
          className,
          style,
        )}
        {...props}>
        {collapseFrom === 'start' &&
          hasOverflow &&
          overflowRenderer?.(overflowItems)}
        {visibleItems.map(({child}) => child)}
        {collapseFrom === 'end' &&
          hasOverflow &&
          overflowRenderer?.(overflowItems)}
      </div>
    </>
  );
}

OverflowList.displayName = 'OverflowList';
