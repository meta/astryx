// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SwipeActionsLayer.tsx
 * @input The swipe entries per side, the behavior; useSwipeAction,
 *   theme tokens
 * @output Exports SwipeActionsLayer (default): the panels of a row's swipe
 *   actions and the gesture that uncovers them
 * @position Brought by createSwipe.ts, which hands it to a row the swipe
 *   serves; Item.tsx's deprecated path loads it with `import()`. Tested
 *   through Item.test.tsx and Item.source-build.test.mjs.
 *
 * The row's root stays the row's: it takes the root style the swipe brings, and
 * forwards its key events into the bridge this layer fills. The gesture
 * attaches to the root itself, and the layer holds
 * the root's press while the row is open. This layer renders the two panels as
 * out-of-flow children of that root. So no element is added to the row for the
 * swipe.
 *
 * A panel is two boxes and the entries themselves. Transforms move all three,
 * reading the travel the gesture writes on the root (see useSwipeAction). The
 * window sits over the row's resting box, reads the travel's negation, and
 * clips to that box. The track inside it moves with the row, and clips the
 * entries to the space the row vacates. Each entry is translated back from the
 * side's pin. So the entries stay at the outer edge until the row has uncovered
 * them all, then ride the row. Past the open width the outermost entry's
 * colour, painted beside it, fills the rest out to that edge. On a confirmed
 * full swipe it slides to the row's edge. While an entry covers the panel, its
 * colour fills the track and the others hide. So no entry's colour shows behind
 * or between other entries. No wrapper holds the entries, and the colours are
 * pseudo-elements.
 *
 * SYNC: the property names are useSwipeAction.ts's.
 */

import {useEffect, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  fontWeightVars,
  typographyVars,
  colorVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {disabledInteractionProps} from '../utils/disabledInteraction';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {isSwipeOpen, useSwipeAction, type SwipeSide} from './useSwipeAction';
import type {SwipeEntry, SwipeLayerProps} from './swipeHost';

// =============================================================================
// Styles
// =============================================================================

/** The travel the gesture writes on the root, physical px (useSwipeAction.ts). */
const SWIPE_TRAVEL = 'var(--_item-swipe-travel, 0px)';
/** How far a full swipe has confirmed, 0 to 1 (useSwipeAction.ts). */
const SWIPE_CONFIRM = 'var(--_item-swipe-confirm, 0)';
// The side's geometry the gesture writes on its window (useSwipeAction.ts):
// the pin, its physical sign, its open width and the outermost entry's slide.
const SWIPE_PIN = 'var(--_item-swipe-pin, 0px)';
const SWIPE_SIGN = 'var(--_item-swipe-sign, 1)';
const SWIPE_OPEN = 'var(--_item-swipe-open, 0px)';
const SWIPE_SLIDE = 'var(--_item-swipe-slide, 0px)';
/**
 * Where the entries sit against the track. They move back by the travel the
 * track moves, so they stay pinned at the outer edge. That holds until the row
 * has uncovered them all, at the open width; past it they ride the row.
 */
const SWIPE_ENTRIES_X = `calc(${SWIPE_PIN} - ${SWIPE_SIGN} * min(${SWIPE_SIGN} * ${SWIPE_TRAVEL}, ${SWIPE_OPEN}))`;

const styles = stylex.create({
  // A side's window: the row's resting box. It is translated back by the
  // travel, so it stays where the row rests, and clips the track to that box
  // and its corners. Transparent and not hit: only the entries take touches.
  swipePanel: {
    position: 'absolute',
    insetBlock: 0,
    insetInline: 0,
    overflow: 'clip',
    borderRadius: 'inherit',
    pointerEvents: 'none',
    transform: `translate3d(calc(-1 * ${SWIPE_TRAVEL}), 0, 0)`,
  },
  // The track: beside the window at rest, so not a pixel of it shows. It moves
  // with the row, so the part inside the window is exactly the space the row
  // vacates. The entries show only there. Twice the row's width covers every
  // travel, the slide-out included. The entries run in a row from its edge next
  // to the row. Each is translated back, so it stays pinned at the row's outer
  // edge until the row has uncovered them all. Then they ride the row. They sit
  // on the surface the track paints: the neutral variant is translucent and
  // shows what is under it. Its `::before` is the cover fill: the covering
  // entry's colour, shown only while that entry covers the panel
  // (swipeTrackFillStyles).
  swipeTrack: {
    position: 'absolute',
    insetBlock: 0,
    width: '200%',
    overflow: 'clip',
    borderRadius: 'inherit',
    display: 'flex',
    isolation: 'isolate',
    backgroundColor: colorVars['--color-background-surface'],
    transform: `translate3d(${SWIPE_TRAVEL}, 0, 0)`,
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: -1,
      opacity: 0,
      pointerEvents: 'none',
    },
  },
  swipeTrackCovered: {
    '::before': {opacity: 1},
  },
  // The outermost entry is the last, at the outer edge. On the leading side
  // that is the inline start, so the entries run in reverse from the track's
  // inline end.
  swipeTrackLeading: {
    insetInlineEnd: '100%',
    flexDirection: 'row-reverse',
  },
  swipeTrackTrailing: {
    insetInlineStart: '100%',
  },
  swipeEntry: {
    transform: `translate3d(${SWIPE_ENTRIES_X}, 0, 0)`,
    flexShrink: 0,
    pointerEvents: 'auto',
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
  // An entry that another entry covers. It hides at once, with no fade, so
  // its colour never mixes with the covering entry's.
  swipeEntryCovered: {
    opacity: 0,
  },
  // Half strength as a filter, so the entry's own opacity stays free for the
  // cover.
  swipeEntryDisabled: {
    filter: 'opacity(0.5)',
  },
  // The outermost entry: its colour is painted beside it out to the row's outer
  // edge. It fills whatever the row uncovers past the open width, so the entry
  // stretches. A slide-out fills the row with it. Decoration only, on a
  // pseudo-element; the entry's own fill, theme included. On a confirmed full
  // swipe it slides to the row's edge with the entries' pin.
  swipeOuterEntry: {
    position: 'relative',
    transform: `translate3d(calc(${SWIPE_ENTRIES_X} + ${SWIPE_SLIDE} * ${SWIPE_CONFIRM}), 0, 0)`,
  },
  swipeOuterEntryLeading: {
    '::after': {
      content: '""',
      position: 'absolute',
      insetBlock: 0,
      insetInlineEnd: '100%',
      width: '100vw',
      backgroundColor: 'inherit',
      pointerEvents: 'none',
    },
  },
  swipeOuterEntryTrailing: {
    '::after': {
      content: '""',
      position: 'absolute',
      insetBlock: 0,
      insetInlineStart: '100%',
      width: '100vw',
      backgroundColor: 'inherit',
      pointerEvents: 'none',
    },
  },
});

// A verb's colour: ordinary, the one you mean, the dangerous one. The
// outermost entry's fills the row on a slide-out (swipeOuterEntry).
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
    // destructive fill's shape visible. A
    // border, not an outline, leaves the shared focus ring intact.
    borderWidth: {default: 0, '@media (forced-colors: active)': '1px'},
    borderStyle: {default: 'none', '@media (forced-colors: active)': 'solid'},
    borderColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
});

// The track's cover fill: the covering entry's colour.
const swipeTrackFillStyles = stylex.create({
  neutral: {
    '::before': {backgroundColor: colorVars['--color-neutral']},
  },
  accent: {
    '::before': {backgroundColor: colorVars['--color-accent']},
  },
  destructive: {
    '::before': {backgroundColor: colorVars['--color-error']},
  },
});

// =============================================================================
// Component
// =============================================================================

/** A row's actions as their ids, side by side: what tells a change of actions. */
function idsKeyOf(
  leading: ReadonlyArray<SwipeEntry>,
  trailing: ReadonlyArray<SwipeEntry>,
): string {
  const ids = (entries: ReadonlyArray<SwipeEntry>) =>
    entries.map(entry => entry.id ?? '').join('\u0000');
  return `${ids(leading)}\u0001${ids(trailing)}`;
}

/**
 * The swipe half of a row with swipe actions: both panels, rendered into the
 * root the row owns, and the gesture that drives that root.
 */
export default function SwipeActionsLayer({
  onBridge,
  leading,
  trailing,
  behavior,
  itemKey,
}: SwipeLayerProps) {
  // The hook keeps the newest of these callbacks, so each reads the entries
  // of the render it came from.
  const outermostOf = (side: SwipeSide) => {
    const entries = side === 'leading' ? leading : trailing;
    return entries[entries.length - 1];
  };
  const swipe = useSwipeAction({
    behavior,
    // A disabled outermost entry cannot fire, so a full swipe never confirms
    // toward it.
    canConfirm: side => {
      const entry = outermostOf(side);
      return entry != null && entry.isDisabled !== true;
    },
    fireOutermost: side => {
      const entry = outermostOf(side);
      if (entry == null || entry.isDisabled === true) {
        return false;
      }
      void entry.onActivate({id: entry.id ?? '', itemKey});
      return entry.hasRemoval === true;
    },
    sides: {
      leading: leading.length,
      trailing: trailing.length,
    },
  });
  const {onKeyDown} = swipe;
  // The Effect publishes the layer's key handler to the row's bridge and clears
  // it when the layer leaves. Both are stable, so it runs once per layer.
  useEffect(() => {
    onBridge?.({onKeyDown});
    return () => onBridge?.(null);
  }, [onBridge, onKeyDown]);
  // A new swipe value with the same ids keeps the row as it is. One with
  // other ids shows other actions, so an open row closes.
  const idsKey = idsKeyOf(leading, trailing);
  const idsRef = useRef(idsKey);
  const {close} = swipe;
  // The Effect settles the row's snap-point drag to rest when the actions'
  // ids change.
  useEffect(() => {
    if (idsRef.current !== idsKey) {
      idsRef.current = idsKey;
      close();
    }
  }, [close, idsKey]);
  // Open from the release that opens it (`isSwipeOpen`), as UIKit counts it:
  // an entry the finger can see while the row springs open is tappable.
  const isOpen = isSwipeOpen(swipe.state);

  // A side's panel: entries as real buttons under `reveal`, presentational
  // blocks under `commit`. It is out of the accessibility tree and the tab
  // order except while the row is open on its side. So the row keeps one tab
  // stop, and the other side's entries, out of sight behind the row, are never
  // reached. A mouse drag never opens it.
  const renderSwipePanel = (
    side: SwipeSide,
    entries: ReadonlyArray<SwipeEntry>,
  ) => {
    if (entries.length === 0) {
      return null;
    }
    const outer = entries[entries.length - 1];
    const isCommit = behavior === 'commit';
    const isLive = isOpen && swipe.state.side === side && !isCommit;
    const refs = swipe.panelRefs[side];
    const {cover} = swipe.state;
    const coverIndex =
      swipe.state.side === side && cover != null && cover < entries.length
        ? cover
        : null;
    const renderEntry = (entry: SwipeEntry, index: number) => {
      const variant = entry.variant ?? 'accent';
      const key = entry.id ?? entry.label;
      // The outermost entry is the full swipe's moving part itself.
      const isOuter = entry === outer;
      const ref = isOuter ? refs.outer : refs.entry(key);
      const content = (
        <>
          {entry.icon}
          <span>{entry.label}</span>
        </>
      );
      const entryStyles = [
        styles.swipeEntry,
        swipeVariantStyles[variant],
        entry.isDisabled === true && styles.swipeEntryDisabled,
        coverIndex != null && index !== coverIndex && styles.swipeEntryCovered,
        isOuter && styles.swipeOuterEntry,
        isOuter &&
          (side === 'leading'
            ? styles.swipeOuterEntryLeading
            : styles.swipeOuterEntryTrailing),
      ];
      if (isCommit) {
        return (
          <span
            key={key}
            ref={ref}
            {...mergeProps(
              themeProps('item-swipe-action', {variant}),
              stylex.props(...entryStyles),
            )}>
            {content}
          </span>
        );
      }
      return (
        <button
          key={key}
          ref={ref}
          type="button"
          aria-disabled={entry.isDisabled === true ? true : undefined}
          onClick={() =>
            swipe.activateEntry(
              () => {
                void entry.onActivate({id: entry.id ?? '', itemKey});
              },
              entry.hasRemoval === true,
              index,
            )
          }
          // A disabled entry stays focusable while the row rests open but is
          // inert: it runs no `onActivate` and its click does not reach the
          // row.
          {...(entry.isDisabled === true
            ? disabledInteractionProps<HTMLButtonElement>()
            : null)}
          {...mergeProps(
            themeProps('item-swipe-action', {variant}),
            focusOutlineProps.focusVisible(...entryStyles),
          )}>
          {content}
        </button>
      );
    };
    return (
      <div
        key={side}
        ref={refs.panel}
        data-swipe-panel={side}
        inert={isLive ? undefined : true}
        aria-hidden={isCommit ? true : undefined}
        {...stylex.props(styles.swipePanel)}>
        <div
          {...mergeProps(
            themeProps('item-swipe-panel', {side}),
            stylex.props(
              styles.swipeTrack,
              side === 'leading'
                ? styles.swipeTrackLeading
                : styles.swipeTrackTrailing,
              coverIndex != null && styles.swipeTrackCovered,
              swipeTrackFillStyles[
                (coverIndex != null ? entries[coverIndex] : outer).variant ??
                  'accent'
              ],
            ),
          )}>
          {entries.map((entry, index) => renderEntry(entry, index))}
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

SwipeActionsLayer.displayName = 'SwipeActionsLayer';
