// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Wheel.tsx
 * @input Option list, selected value and change callback; a ref for
 *   programmatic turns
 * @output Exports Wheel (one picker column), ScrollWheel (the scrolling
 *   column) and the shared types of wheelOptions.ts
 * @position Internal component; consumed by MonthYearWheels.tsx,
 *   TouchTimeField.tsx and TouchDateTimeField.tsx
 *
 * Wheel picks its column by the primary pointer. Under a finger it is
 * PickerWheel.tsx, the touch layer, imported here alone. Under a fine pointer
 * it is the snap-scrolling column below.
 *
 * The scrolling column is a scroll container: momentum, rubber-banding and the
 * settle are the platform's. Its rows fade and tip on a CSS `view()` timeline,
 * behind `@supports`. Under Reduce Motion its own scrolls land without travel.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/PickerWheel.tsx (the touch column)
 * - /packages/core/src/DateInput/wheelOptions.ts
 * - /packages/core/src/DateInput/TouchDateField.tsx
 * - /packages/core/src/DateTimeInput/TouchDateTimeField.tsx
 * - /packages/core/src/DateInput/DateInput.doc.mjs
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
  spacingVars,
  durationVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils';
import {
  playReducedMotionDip,
  reducedMotionFade,
  type ReducedMotionDip,
} from '../motion/reducedMotion';
import {useTouchPresentation} from '../utils/touchPresentation';
import {PickerWheel} from './PickerWheel';
import {dateInputTouchSizes, dateInputTouchGeometry} from './tokens.stylex';
import {useOwnScrollGesture} from './useOwnScrollGesture';
import {usePointerDragScroll} from './usePointerDragScroll';
import {useScrollSettle, useScrollSteer} from './useScrollSettle';
import {useWheelListbox} from './useWheelListbox';
import {
  canSpinTo,
  endIndex,
  nearestEnabledIndex,
  steppedIndex,
  type WheelProps,
} from './wheelOptions';

export {
  nearestEnabledIndex,
  type WheelHandle,
  type WheelOption,
  type WheelProps,
} from './wheelOptions';

const ITEM_BLOCK_SIZE = dateInputTouchSizes.wheelItemSize;

/**
 * Rows tip away from the centre of the wheel. 0% is a row just entering at the
 * bottom of the scrollport, 50% is a row centred in it, 100% is a row leaving
 * at the top — which is what a `view()` timeline over the `cover` range means,
 * and why this reads as a cylinder rotating under the finger.
 */
const tip = stylex.keyframes({
  '0%': {transform: 'rotateX(52deg) scale(0.86)'},
  '50%': {transform: 'rotateX(0deg) scale(1)'},
  '100%': {transform: 'rotateX(-52deg) scale(0.86)'},
});

/**
 * Colour keeps every row at WCAG AA, which an opacity fade does not. The ends
 * stop halfway to the secondary text colour, because that colour alone falls
 * below AA in two shipped themes.
 */
const fade = stylex.keyframes({
  '0%': {
    color: `color-mix(in oklab, ${colorVars['--color-text-primary']}, ${colorVars['--color-text-secondary']})`,
  },
  '50%': {color: colorVars['--color-text-primary']},
  '100%': {
    color: `color-mix(in oklab, ${colorVars['--color-text-primary']}, ${colorVars['--color-text-secondary']})`,
  },
});

/**
 * A disabled row keeps its disabled colour and fades by opacity instead: WCAG
 * 1.4.3 exempts inactive components from the contrast minimum.
 */
const tipAndDim = stylex.keyframes({
  '0%': {opacity: 0.3, transform: 'rotateX(52deg) scale(0.86)'},
  '50%': {opacity: 1, transform: 'rotateX(0deg) scale(1)'},
  '100%': {opacity: 0.3, transform: 'rotateX(-52deg) scale(0.86)'},
});

const dim = stylex.keyframes({
  '0%': {opacity: 0.3},
  '50%': {opacity: 1},
  '100%': {opacity: 0.3},
});

const styles = stylex.create({
  column: {
    position: 'relative',
    flex: '1 1 0',
    minWidth: 0,
  },
  scroller: {
    blockSize: dateInputTouchGeometry.paneBlockSize,
    // Load-bearing, and stated rather than inherited from the reset (whose
    // rule is zero-specificity `:where`): with content-box the end padding
    // below would be added to the scrollport instead of sitting inside it,
    // and every snap position would be wrong.
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
    // Snap every row to the middle of the scrollport, where the selection band
    // sits. `mandatory` (not `proximity`) because a wheel has no valid resting
    // position between two options.
    scrollSnapType: 'y mandatory',
    overscrollBehavior: 'contain',
    // Room for row 0 and row n-1 to reach the centre.
    paddingBlock: dateInputTouchGeometry.wheelEdgePadding,
    // Gives the rotateX tip somewhere to recede to.
    perspective: '520px',
    transformStyle: 'preserve-3d',
    scrollbarWidth: 'none',
    outline: 'none',
    // Vertical pans scroll the wheel; a two-finger pinch stays the page's, so
    // the page can still zoom over an open picker (WCAG 1.4.4), as it does
    // over the menus and listboxes (`module:DropdownMenu/useMenuPress` FR4).
    touchAction: 'pan-y pinch-zoom',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    blockSize: ITEM_BLOCK_SIZE,
    paddingInline: spacingVars['--spacing-2'],
    scrollSnapAlign: 'center',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    // Larger than body text, and larger than the calendar's day numbers: on
    // a wheel the value under the band is the whole interface, and the rows
    // above and below are read at a glance while moving.
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-primary'],
    whiteSpace: 'nowrap',
    // NO `overflow: hidden` here. It would make the row itself a scroll
    // container, and `view()` binds to the subject's nearest ancestor scroll
    // container — the tip would measure the row against itself and sit
    // frozen at 50% forever. Clipping belongs on the inner element.
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
    transitionProperty: 'color, font-weight',
    transitionDuration: durationVars['--duration-fast'],
  },
  /**
   * The tip rides an inner element, never the row itself.
   *
   * A snap area is the element's TRANSFORMED border box, so animating the row
   * would move the very positions the scroller is snapping to — the wheel
   * settles a few pixels off, and the offset feeds back into the animation.
   * Transforming a child leaves the row's box, and every snap offset, exact.
   */
  itemInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '100%',
    blockSize: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // The wheel look. Held behind @supports so browsers without scroll-driven
    // animations get a plain list instead of these keyframes playing
    // themselves out once on the document timeline. Under reduced motion, the
    // colour fade on the row keeps the depth cue.
    animationName: {
      default: null,
      '@supports (animation-timeline: view())': {
        default: tip,
        '@media (prefers-reduced-motion: reduce)': 'none',
      },
    },
    animationTimeline: 'view(y)',
    animationRange: 'cover 0% cover 100%',
    animationFillMode: 'both',
    animationDuration: 'auto',
    animationTimingFunction: 'linear',
    backfaceVisibility: 'hidden',
  },
  itemInnerDisabled: {
    animationName: {
      default: null,
      '@supports (animation-timeline: view())': {
        default: tipAndDim,
        '@media (prefers-reduced-motion: reduce)': dim,
      },
    },
  },
  /**
   * The colour fade, on the row and not the tipped inner element: colour does
   * not move a snap area. An animated colour outranks the selected and
   * disabled colours, so those rows do not take this fade.
   */
  itemFade: {
    animationName: {
      default: null,
      '@supports (animation-timeline: view())': fade,
    },
    animationTimeline: 'view(y)',
    animationRange: 'cover 0% cover 100%',
    animationFillMode: 'both',
    animationDuration: 'auto',
    animationTimingFunction: 'linear',
  },
  itemActive: {
    color: colorVars['--color-text-accent'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  itemDisabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
  },
  /**
   * The selection band: a single centred row-height plate behind the options.
   * Purely decorative — the committed value is announced by `aria-selected`.
   */
  band: {
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: `calc(50% - (${ITEM_BLOCK_SIZE} / 2))`,
    blockSize: ITEM_BLOCK_SIZE,
    borderRadius: radiusVars['--radius-element'],
    // `--color-neutral`, not `--color-background-muted`. Muted is 4.7% alpha,
    // which puts the whole plate 17 units of colour away from the sheet
    // behind it — so when the wheels fade in, the band's animation has 17
    // units to happen in while the text beside it travels 412. It did not
    // read as fading, it read as appearing. Neutral is 10%, which doubles the
    // range to 36 and is still quiet enough to sit under text.
    backgroundColor: colorVars['--color-neutral'],
    pointerEvents: 'none',
  },
});

/**
 * One picker column: UIPickerView's motion with flat rows under a finger, the
 * snap-scrolling column under a fine pointer.
 *
 * @example
 * ```
 * <Wheel
 *   label="Month"
 *   options={monthOptions}
 *   value={month}
 *   onChange={setMonth}
 * />
 * ```
 */
export function Wheel(props: WheelProps) {
  // One touch model on every touch device: a finger gets UIPickerView's motion
  // with flat rows, a fine pointer the scrolling column.
  const {isTouch} = useTouchPresentation();
  return isTouch ? <PickerWheel {...props} /> : <ScrollWheel {...props} />;
}

Wheel.displayName = 'Wheel';

/**
 * A steer that never reaches its row still rests. The wheel re-aims at it at
 * most this many times.
 */
const MAX_RE_AIMS = 3;

/**
 * The keys that scroll a focused column. Tab moves focus out of the column,
 * and ArrowLeft and ArrowRight scroll nothing in it, so a step keeps running
 * through them.
 */
const COLUMN_SCROLL_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

/**
 * One snap-scrolling picker column, under a fine pointer.
 *
 * @example
 * ```
 * <ScrollWheel
 *   label="Month"
 *   options={monthOptions}
 *   value={month}
 *   onChange={setMonth}
 * />
 * ```
 */
export function ScrollWheel({
  label,
  options,
  value,
  onChange,
  isActive = true,
  ref,
}: WheelProps) {
  // A spin commits the row at once. The new value then scrolls the column
  // there, as any new value does.
  useImperativeHandle(
    ref,
    () => ({
      spinTo: async index => {
        if (!canSpinTo(options, index)) {
          return false;
        }
        const option = options[index];
        if (option.value !== value) {
          onChange(option.value);
        }
        return true;
      },
    }),
    [options, value, onChange],
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  // Which row is under the band right now. Tracks the finger during a scroll;
  // `selectedIndex` only catches up when the wheel settles.
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  // A mouse cannot drag a scroll container, so without this the wheel ignores
  // the one gesture its shape invites. Touch is untouched — it pans natively,
  // with momentum this could not match. See usePointerDragScroll. The drag it
  // holds is not rest either: the settle below waits for its release, as it
  // waits for a finger's (useScrollSettle).
  const {isDraggingRef} = usePointerDragScroll(scrollerRef, isActive);

  // Row height in px, read from layout rather than assumed, so a theme that
  // retunes --date-input-touch-wheel-item-size still lands on the right row.
  const itemBlockSize = useCallback((): number => {
    const first = scrollerRef.current?.firstElementChild;
    return first instanceof HTMLElement && first.offsetHeight > 0
      ? first.offsetHeight
      : 0;
  }, []);

  // What last started a scroll of the wheel: a pointer's type, or 'wheel'
  // for a mouse wheel or trackpad. Under Reduce Motion the release of a touch
  // drag cross-fades on any primary pointer. A key step, a row tap or a
  // trackpad's scroll cross-fades on a coarse primary pointer and lands at
  // once on a fine one.
  const lastPointerRef = useRef<string | null>(null);

  // The row the wheel's own scroll heads for. A step commits its row at once.
  // So a rest on the way finishes the scroll and commits nothing. A busy page
  // can draw no frame of a step for longer than the quiet period.
  const steer = useScrollSteer(COLUMN_SCROLL_KEYS);
  // Where the wheel last re-aimed at its steered row, and how often. A rest
  // short of the row again, with no progress since, ends the steer. Then the
  // settle commits the row the column shows, so the two always agree.
  const reAimRef = useRef<{top: number; count: number} | null>(null);

  // A reduced-motion dip whose rows have not landed yet: the row they land
  // on. While one is pending the rows stay put for it, so they never move at
  // full opacity, and a further step retargets it.
  const pendingFadeRef = useRef<{top: number} | null>(null);
  // The running dip, so a step during its fade-in starts the next one where
  // the column is.
  const dipRef = useRef<ReducedMotionDip | null>(null);
  // Synchronizes with the dip's animations: an unmounted wheel lands nothing.
  useEffect(
    () => () => {
      pendingFadeRef.current = null;
      dipRef.current?.cancel();
      dipRef.current = null;
    },
    [],
  );

  const scrollToIndex = useCallback(
    (
      index: number,
      behavior: ScrollBehavior,
      {
        touchRelease = false,
        isReAim = false,
      }: {touchRelease?: boolean; isReAim?: boolean} = {},
    ) => {
      const scroller = scrollerRef.current;
      const size = itemBlockSize();
      if (scroller == null || size === 0) {
        return;
      }
      const top = index * size;
      steer.start(index);
      if (!isReAim) {
        reAimRef.current = null;
      }
      // Under Reduce Motion the wheel's own scroll lands without travel. It
      // dips on a touch screen or for a touch drag's release. Otherwise it
      // lands at once.
      const fadeTiming =
        behavior === 'smooth'
          ? reducedMotionFade(scroller, {touchRelease})
          : null;
      const pending = pendingFadeRef.current;
      // A change that lands now replaces a pending landing. Its dip goes on
      // and fades back in.
      if (fadeTiming == null) {
        pendingFadeRef.current = null;
        scroller.scrollTo({top, behavior});
        return;
      }
      if (fadeTiming.duration === 0 || typeof scroller.animate !== 'function') {
        pendingFadeRef.current = null;
        scroller.scrollTo({top, behavior: 'auto'});
        return;
      }
      if (pending != null) {
        // The dip is still fading out: its rows land here instead.
        pending.top = top;
        return;
      }
      // A step during the last dip's fade-in starts the new dip at the
      // column's current opacity, not at full opacity. A leaving element fades
      // out from where it is.
      const shown = Number.parseFloat(getComputedStyle(scroller).opacity);
      dipRef.current?.cancel();
      const landing = {top};
      pendingFadeRef.current = landing;
      dipRef.current = playReducedMotionDip(
        scroller,
        fadeTiming,
        () => {
          if (pendingFadeRef.current === landing) {
            pendingFadeRef.current = null;
            scroller.scrollTo({top: landing.top, behavior: 'auto'});
          }
        },
        Number.isFinite(shown) ? shown : 1,
      );
    },
    [itemBlockSize, steer],
  );

  // Commit on rest. A wheel that stops on a disabled row travels on to the
  // nearest enabled row, as UIDatePicker does. That second rest commits it.
  // A rest on the committed row is not a stop to correct. The park after the
  // sheet opens rests there with no touch. A committed value outside the
  // bounds stays until a person moves the wheel.
  //
  // Declared here, above the park effect, because that effect consults the
  // `isAtRestRef` this returns before it repositions anything.
  const {isAtRestRef} = useScrollSettle(
    scrollerRef,
    scroller => {
      const size = itemBlockSize();
      if (size === 0) {
        return;
      }
      const steered = steer.current();
      if (steered != null) {
        const top = scroller.scrollTop;
        const last = reAimRef.current;
        const isShort = Math.abs(top - steered * size) >= 1;
        const isStuck =
          last != null &&
          (Math.abs(top - last.top) < 1 || last.count >= MAX_RE_AIMS);
        if (isShort && !isStuck) {
          reAimRef.current = {top, count: (last?.count ?? 0) + 1};
          scrollToIndex(steered, 'smooth', {isReAim: true});
          return;
        }
        steer.end();
        reAimRef.current = null;
      }
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(scroller.scrollTop / size)),
      );
      const restIndex =
        index === selectedIndex
          ? index
          : nearestEnabledIndex(options, index, selectedIndex);
      if (restIndex !== index) {
        scrollToIndex(restIndex, 'smooth', {
          touchRelease: lastPointerRef.current === 'touch',
        });
        return;
      }
      const option = options[index];
      if (option != null && !option.isDisabled && option.value !== value) {
        onChange(option.value);
      }
    },
    isActive,
    isDraggingRef,
    steer,
  );

  // Park the committed row under the band at once whenever the wheel is
  // shown. A value that changes from outside while the wheel is shown turns
  // the wheel onto its row instead. UIDatePicker turns onto its maximum the
  // same way, and never jumps there. For example, a bound clamps the time
  // after another wheel turned, or the calendar moved to another month.
  //
  // NEVER while the wheel is still moving. A scroller that is mid-gesture or
  // still carrying momentum is the user's, and repositioning it does not stop
  // the momentum — on iOS it feeds a cycle where the scroll this causes reads
  // as a new settle, commits the next row along, and parks again. See
  // useScrollSettle. The settle handler re-checks the position afterwards, so
  // a correction that is genuinely needed still happens, just at rest.
  const parkedRef = useRef(false);
  // Syncs the wheel's scroll position with the selected index while the wheel
  // is active.
  useEffect(() => {
    if (!isActive) {
      parkedRef.current = false;
      return;
    }
    // Nor while a reduced-motion dip is still to land its rows: they land
    // under it, on this row.
    if (!isAtRestRef.current || pendingFadeRef.current != null) {
      return;
    }
    const size = itemBlockSize();
    const scroller = scrollerRef.current;
    if (scroller == null || size === 0) {
      return;
    }
    if (Math.round(scroller.scrollTop / size) !== selectedIndex) {
      if (parkedRef.current) {
        scrollToIndex(selectedIndex, 'smooth');
      } else {
        scroller.scrollTo({top: selectedIndex * size, behavior: 'auto'});
      }
    }
    parkedRef.current = true;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- the highlight follows a scroll position, which only exists after layout
    setActiveIndex(selectedIndex);
  }, [isActive, selectedIndex, itemBlockSize, isAtRestRef, scrollToIndex]);

  // Highlight follows the finger. rAF-throttled: a scroll can fire far more
  // often than the display refreshes, and this only feeds a repaint.
  const frameRef = useRef<number | undefined>(undefined);
  // Syncs a scroll listener with the active wheel. It updates the highlighted
  // row.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller == null || !isActive) {
      return;
    }
    const onScroll = () => {
      if (frameRef.current != null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined;
        const size = itemBlockSize();
        if (size === 0) {
          return;
        }
        const index = Math.min(
          options.length - 1,
          Math.max(0, Math.round(scroller.scrollTop / size)),
        );
        setActiveIndex(index);
      });
    };
    scroller.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
    };
  }, [isActive, options.length, itemBlockSize]);

  // Keep the finger. Inside a BottomSheet the sheet would otherwise read a
  // downward drag here as swipe-to-dismiss; see useOwnScrollGesture. Gated on
  // isActive because the hidden panel keeps its layout box.
  // 'all': a wheel scrolls vertically, the same axis the sheet wants, so
  // there is no way to share — it takes every touch that lands on it.
  useOwnScrollGesture(scrollerRef, 'all', {isEnabled: isActive});

  const moveTo = useCallback(
    (row: number | null) => {
      const option = row == null ? undefined : options[row];
      if (row == null || option == null || option.isDisabled) {
        return;
      }
      setActiveIndex(row);
      scrollToIndex(row, 'smooth');
      if (option.value !== value) {
        onChange(option.value);
      }
    },
    [options, scrollToIndex, value, onChange],
  );

  const moveBy = useCallback(
    (delta: number) => moveTo(steppedIndex(options, activeIndex, delta)),
    [moveTo, options, activeIndex],
  );

  // Home and End: the first and the last enabled row.
  const toEnd = useCallback(
    (end: 'first' | 'last') => moveTo(endIndex(options, end)),
    [moveTo, options],
  );

  const activate = useCallback(
    (index: number) => {
      const option = options[index];
      if (option == null || option.isDisabled) {
        return;
      }
      setActiveIndex(index);
      scrollToIndex(index, 'smooth');
      if (option.value !== value) {
        onChange(option.value);
      }
    },
    [options, scrollToIndex, value, onChange],
  );

  const {listboxProps, optionProps} = useWheelListbox({
    label,
    options,
    value,
    activeIndex,
    stepBy: moveBy,
    toEnd,
    activate,
  });

  return (
    <div {...stylex.props(styles.column)}>
      <div aria-hidden="true" {...stylex.props(styles.band)} />
      <div
        ref={scrollerRef}
        {...listboxProps}
        // Read in the capture phase. usePointerDragScroll stops a primary
        // mouse press from bubbling, so that it does not reach BottomSheet's
        // drag. A bubbling handler would never see a mouse, and would keep the
        // last touch.
        onPointerDownCapture={event => {
          lastPointerRef.current = event.pointerType;
        }}
        onWheel={() => {
          lastPointerRef.current = 'wheel';
        }}
        {...stylex.props(styles.scroller, focusOutlineStyles.focusVisible)}>
        {options.map((option, index) => (
          <div
            key={option.value}
            {...optionProps(option, index)}
            {...stylex.props(
              styles.item,
              index !== activeIndex && !option.isDisabled && styles.itemFade,
              index === activeIndex && styles.itemActive,
              option.isDisabled && styles.itemDisabled,
            )}>
            <span
              {...stylex.props(
                styles.itemInner,
                option.isDisabled && styles.itemInnerDisabled,
              )}>
              {option.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

ScrollWheel.displayName = 'ScrollWheel';
