// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemSwipeLayer.tsx
 * @input The row root (by ref), the swipe entries per side, the behavior;
 *   useSwipeAction, theme tokens
 * @output Exports ItemSwipeLayer (default) — the panels of a row's swipe
 *   actions and the gesture that uncovers them — and the ItemSwipeBridge type
 *   through which the root reaches the gesture's handlers
 * @position Internal to Item, reached only through a dynamic import from
 *   Item.tsx when `swipeActions` is set, so a row without them never loads
 *   the gesture. Tested through Item.test.tsx and Item.source-build.test.mjs.
 *
 * The row's root stays Item's: it carries the swipe root styles and forwards
 * its pointer, click-capture and key events into the bridge this layer fills.
 * This layer renders the two panels as out-of-flow children of that root and
 * runs the gesture against it, so the DOM is the one Item rendered before the
 * split — no element is added for the swipe (spec AST-057, FR2).
 */

import {useEffect, useRef, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  fontWeightVars,
  typographyVars,
  colorVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {
  useSwipeAction,
  type SwipeHandlers,
  type SwipeSide,
} from './useSwipeAction';
import type {ItemSwipeAction, ItemSwipeBehavior} from './Item';

// =============================================================================
// Types
// =============================================================================

/**
 * What the root needs from the gesture: the handlers it forwards its events
 * into, and the test for the click the browser synthesizes after a drag. The
 * layer writes it on every render; the root reads it on every event.
 */
export interface ItemSwipeBridge {
  handlers: SwipeHandlers;
  shouldSuppressClick: () => boolean;
}

export interface ItemSwipeLayerProps {
  /** The row root: the gesture's target and the element that translates. */
  rootRef: RefObject<HTMLElement | null>;
  /**
   * Called with the gesture for the root to forward into, after every render
   * of the layer, and with `null` when the layer leaves.
   */
  onBridge: (bridge: ItemSwipeBridge | null) => void;
  leading: ItemSwipeAction[];
  trailing: ItemSwipeAction[];
  behavior: ItemSwipeBehavior;
}

// =============================================================================
// Constants
// =============================================================================

// The custom properties the gesture writes on the root (see useSwipeAction;
// StyleX wants literals here, so the names are spelled out rather than imported).
/** The travel a drag writes on the row root, in physical px. */
const SWIPE_TRAVEL = 'var(--_item-swipe-travel, 0px)';
/** +1 when the inline end is to the right, -1 under RTL; written beside the travel. */
const SWIPE_DIR = 'var(--_item-swipe-dir, 1)';
/** The settle clock, `0s` while the finger drives the row. */
const SWIPE_DURATION = 'var(--_item-swipe-duration, 0s)';
/** The travel measured toward the inline end. */
const SWIPE_LOGICAL_TRAVEL = `calc(${SWIPE_TRAVEL} * ${SWIPE_DIR})`;

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // A side's panel: an out-of-flow child of the root at the inline start or
  // end, counter-translated so it appears fixed in the space the row
  // vacates, and exactly as wide as the travel toward its side — a padded box
  // at `width: 0` would still paint its padding, so the panel has none; its
  // entries carry their own. Not a pixel of it shows at rest.
  swipePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    display: 'flex',
    alignItems: 'stretch',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: 'inherit',
    transform: `translate3d(calc(-1 * ${SWIPE_TRAVEL}), 0, 0)`,
    transitionProperty: 'transform, width',
    transitionDuration: `${SWIPE_DURATION}, ${SWIPE_DURATION}`,
    transitionTimingFunction: 'ease-out, ease-out',
  },
  swipePanelLeading: {
    insetInlineStart: 0,
    justifyContent: 'flex-start',
    width: `max(0px, ${SWIPE_LOGICAL_TRAVEL})`,
  },
  swipePanelTrailing: {
    insetInlineEnd: 0,
    justifyContent: 'flex-end',
    width: `max(0px, calc(-1 * ${SWIPE_LOGICAL_TRAVEL}))`,
  },
  // The entries at their natural width; the panel clips them to the travel.
  // The outermost entry is the last, at the panel's outer edge: on the leading
  // side that is the inline start, so the row of entries runs in reverse.
  swipeEntries: {
    display: 'flex',
    flexShrink: 0,
    height: '100%',
    // The entries sit on the surface, not on the panel's own colour: the
    // neutral variant is translucent and would otherwise take the outermost
    // entry's colour through it.
    backgroundColor: colorVars['--color-background-surface'],
  },
  swipeEntriesLeading: {
    flexDirection: 'row-reverse',
  },
  swipeEntry: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
    minWidth: 72,
    height: '100%',
    paddingInline: spacingVars['--spacing-3'],
    boxSizing: 'border-box',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    appearance: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    whiteSpace: 'nowrap',
  },
  swipeEntryDisabled: {
    opacity: 0.5,
  },
});

// A verb's colour: ordinary, the one you mean, the dangerous one. The panel
// wears its outermost entry's, so a slide-out fills the row with it.
const swipeVariantStyles = stylex.create({
  neutral: {
    backgroundColor: colorVars['--color-neutral'],
    color: colorVars['--color-text-primary'],
  },
  accent: {
    backgroundColor: colorVars['--color-accent'],
    color: colorVars['--color-on-accent'],
  },
  destructive: {
    backgroundColor: colorVars['--color-error'],
    color: colorVars['--color-on-error'],
    // Forced colors replace the fill with Canvas; a border keeps the
    // destructive fill's shape visible (architecture:theme-tokens INV11). A
    // border, not an outline, leaves the shared focus ring intact.
    borderWidth: {default: 0, '@media (forced-colors: active)': '1px'},
    borderStyle: {default: 'none', '@media (forced-colors: active)': 'solid'},
    borderColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * The swipe half of an `Item` with `swipeActions`: both panels, rendered into
 * the root Item owns, and the gesture that drives that root.
 */
export default function ItemSwipeLayer({
  rootRef,
  onBridge,
  leading,
  trailing,
  behavior,
}: ItemSwipeLayerProps) {
  const leadingEntriesRef = useRef<HTMLDivElement | null>(null);
  const trailingEntriesRef = useRef<HTMLDivElement | null>(null);
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const outermost = (side: SwipeSide): ItemSwipeAction | undefined => {
    const entries = side === 'leading' ? leading : trailing;
    return entries[entries.length - 1];
  };
  const swipe = useSwipeAction({
    isEnabled: true,
    behavior,
    sides: {
      leading: leading.length > 0,
      trailing: trailing.length > 0,
    },
    measurePanel: side =>
      (side === 'leading' ? leadingEntriesRef : trailingEntriesRef).current
        ?.offsetWidth ?? 0,
    fireOutermost: side => {
      const entry = outermost(side);
      if (entry == null || entry.isDisabled === true) {
        return false;
      }
      void entry.onActivate();
      return entry.hasRemoval === true;
    },
    isReducedMotion,
    rootRef,
  });
  // The root forwards its events into what this publishes. Published from an
  // effect, like the gesture's own latest-callback refs: React flushes
  // effects before it delivers a discrete event, so a handler never meets a
  // stale bridge; and withdrawn when the layer leaves.
  useEffect(() => {
    onBridge({
      handlers: swipe.handlers,
      shouldSuppressClick: swipe.shouldSuppressClick,
    });
    return () => {
      onBridge(null);
    };
  });
  const isSwipeResting = swipe.state.phase === 'resting';

  // A side's panel: entries as real buttons under `reveal`, presentational
  // blocks under `commit`. Out of the accessibility tree and the tab order
  // except while the row rests open, so the row keeps one tab stop and a
  // pointer that can hover never meets it.
  const renderSwipePanel = (side: SwipeSide, entries: ItemSwipeAction[]) => {
    if (entries.length === 0) {
      return null;
    }
    const outer = entries[entries.length - 1];
    const isCommit = behavior === 'commit';
    const isLive = isSwipeResting && !isCommit;
    return (
      <div
        key={side}
        data-swipe-panel={side}
        inert={isLive ? undefined : true}
        aria-hidden={isCommit ? true : undefined}
        {...mergeProps(
          themeProps('item-swipe-panel', {side}),
          stylex.props(
            styles.swipePanel,
            side === 'leading'
              ? styles.swipePanelLeading
              : styles.swipePanelTrailing,
            swipeVariantStyles[outer.variant ?? 'accent'],
          ),
        )}>
        <div
          ref={side === 'leading' ? leadingEntriesRef : trailingEntriesRef}
          {...stylex.props(
            styles.swipeEntries,
            side === 'leading' && styles.swipeEntriesLeading,
          )}>
          {entries.map(entry => {
            const variant = entry.variant ?? 'accent';
            const content = (
              <>
                {entry.icon}
                <span>{entry.label}</span>
              </>
            );
            const entryStyle = stylex.props(
              styles.swipeEntry,
              swipeVariantStyles[variant],
              entry.isDisabled === true && styles.swipeEntryDisabled,
            );
            if (isCommit) {
              return (
                <span
                  key={entry.id ?? entry.label}
                  {...mergeProps(
                    themeProps('item-swipe-action', {variant}),
                    entryStyle,
                  )}>
                  {content}
                </span>
              );
            }
            return (
              <button
                key={entry.id ?? entry.label}
                type="button"
                disabled={entry.isDisabled === true}
                onClick={() =>
                  swipe.activateEntry(() => {
                    void entry.onActivate();
                    return entry.hasRemoval === true;
                  })
                }
                {...mergeProps(
                  themeProps('item-swipe-action', {variant}),
                  focusOutlineProps.focusVisible(
                    styles.swipeEntry,
                    swipeVariantStyles[variant],
                    entry.isDisabled === true && styles.swipeEntryDisabled,
                  ),
                )}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderSwipePanel('leading', leading)}
      {renderSwipePanel('trailing', trailing)}
    </>
  );
}

ItemSwipeLayer.displayName = 'ItemSwipeLayer';
