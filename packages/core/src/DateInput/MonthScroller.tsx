// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MonthScroller.tsx
 * @input A calendar's month model, month bounds, selected value, constraints,
 *   week start
 * @output Exports MonthScroller and MonthScrollerHandle, and the month grid
 *   MonthPager shares: MonthPane, monthGridKeyTarget and useMonthGridFocus
 * @position Internal component; consumed by TouchDateField.tsx. MonthPager.tsx
 *   renders its MonthPane and uses its useMonthGridFocus.
 *
 * The continuous surface: months stacked vertically in one scroller, each pane
 * exactly as tall as the scrollport and snapped to its start. Two consequences
 * fall out of that single geometric choice — the picker never changes height,
 * and there is no resting position that shows half of two months.
 *
 * Every pane is a fixed six-row grid, including the months that only need
 * four or five, because a pane whose height depended on its contents would
 * make snap offsets vary from month to month and the scroll position drift.
 *
 * The list is long (a century by default) but only a few panes are ever
 * mounted: a spacer holds the full scroll height and the visible panes are
 * positioned into it absolutely. Nothing is stitched or recycled during a
 * scroll, so snap offsets are constant and momentum is never interrupted —
 * which is the failure mode of the usual "append months at the edge" approach.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/TouchDateField.tsx
 * - /packages/core/src/DateTimeInput/TouchDateTimeField.tsx
 * - /packages/core/src/DateInput/DateInput.doc.mjs
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {useCalendarDays} from '../Calendar/hooks/useCalendarDays';
import {useDirection} from '../i18n/useDirection';
import {useLocale} from '../i18n/useLocale';
import {
  colorVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
  durationVars,
  borderVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import type {DayOfWeek, ISODateString, PlainDate} from '../utils/dateTypes';
import {
  plainDateAddDays,
  plainDateDayOfWeek,
  plainDateFormatDayNumber,
  plainDateIsEqual,
  plainDateToISO,
  DATE_FORMAT_WITH_WEEKDAY,
} from '../utils/plainDate';
import {
  playReducedMotionDip,
  reducedMotionFade,
  type ReducedMotionDip,
} from '../motion/reducedMotion';
import {
  type CalendarSystem,
  calendarShiftMonths,
  calendarShiftYears,
  calendarYearMonthOf,
  formatCalendarDate,
  formatCalendarMonthLabel,
  isInCalendarMonth,
} from '../utils/calendarSystem';
import {dateInputTouchSizes, dateInputTouchGeometry} from './tokens.stylex';
import {useOwnScrollGesture} from './useOwnScrollGesture';
import {useScrollSettle, useScrollSteer} from './useScrollSettle';
import {
  type MonthModel,
  paneWindow,
  rowAtScrollOffset,
  rowsIn,
  scrollOffsetForRow,
} from './monthGeometry';

/**
 * Panes mounted on each side of the visible one. Sized against a fast fling:
 * the window widens once per animation frame, so it only fails if a single
 * frame travels further than this — three months, about 800px at the default
 * day size. Under `scroll-snap-type: mandatory`, landing on an unmounted pane
 * would not merely show a gap, it would re-snap to the nearest mounted one.
 */
const OVERSCAN = 3;

/** Every listener on the scroller is passive; one options object serves all. */
const PASSIVE: AddEventListenerOptions = {passive: true};

const DAY_SIZE = dateInputTouchSizes.daySize;

const styles = stylex.create({
  scroller: {
    position: 'relative',
    blockSize: dateInputTouchGeometry.paneBlockSize,
    // Stated, not inherited from the reset: the pane size, the snap offsets
    // and the virtualization all key off the measured box, so a consumer
    // without reset.css (or with a stray box-sizing rule — the reset's is
    // zero-specificity `:where`) must not be able to change what it means.
    boxSizing: 'border-box',
    overflowX: 'auto',
    overflowY: 'hidden',
    // The paging behaviour, now along the inline axis. Every snap area is a
    // full pane, so there is exactly one resting position per month.
    scrollSnapType: 'x mandatory',
    // Keeps a fling inside the picker rather than handing it to the page.
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    // pan-x, so the browser keeps horizontal pans here and hands VERTICAL
    // ones straight to the sheet. That is why this scroller no longer claims
    // the gesture the way the wheels do: with the axes separated there is
    // nothing to fight over, and a downward drag on the calendar can go back
    // to meaning swipe-to-dismiss.
    touchAction: 'pan-x',
  },
  spacer: {
    position: 'relative',
    blockSize: '100%',
  },
  /** Each pane snaps at its start. */
  paneSnap: {
    scrollSnapAlign: 'start',
    // No `scroll-snap-stop: always`. It would cap every fling at one month,
    // which is tidy but stops the surface being continuous — "three months
    // ahead" should be one throw, not three flicks. Momentum carrying past
    // several panes is why OVERSCAN is what it is.
  },
  pane: {
    position: 'absolute',
    insetBlock: 0,
    blockSize: dateInputTouchGeometry.paneBlockSize,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridTemplateRows: dateInputTouchGeometry.paneRows,
  },
  row: {
    display: 'contents',
  },
  cell: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '100%',
    blockSize: '100%',
    minInlineSize: DAY_SIZE,
    minBlockSize: DAY_SIZE,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // A tap on a 44px target should not also select the number inside it.
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  /**
   * The circular hit/selection puck inside the tap target. Sizing the puck
   * rather than the button keeps the touch target at the full cell while the
   * visual stays a tidy circle.
   */
  puck: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: `calc(${DAY_SIZE} - 8px)`,
    blockSize: `calc(${DAY_SIZE} - 8px)`,
    borderRadius: radiusVars['--radius-full'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, color, border-color',
    transitionDuration: durationVars['--duration-fast'],
  },
  puckHoverable: {
    // Two guards, for two different failure modes.
    //
    // `@media (hover: hover)`: on a touch screen a :hover tint sticks to the
    // last tapped day until something else is tapped.
    //
    // `:where(:not(:disabled,[aria-disabled="true"]))`: a browser suppresses a
    // disabled control's events, not its hover styling, so an unguarded
    // :hover tints a day you cannot pick. The disabled state sits on the
    // button, and this puck is the span inside it. So the call site's gate
    // does the work, and this guard holds if the styles move to the button.
    backgroundColor: {
      default: 'transparent',
      '@media (hover: hover)': {
        default: 'transparent',
        ':hover:where(:not(:disabled,[aria-disabled="true"]))':
          colorVars['--color-overlay-hover'],
      },
    },
  },
  puckToday: {
    borderColor: colorVars['--color-border-emphasized'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  puckSelected: {
    backgroundColor: {
      default: colorVars['--color-accent'],
      // Holds the accent through hover, overriding puckHoverable's tint.
      // Same guarded selector, so the two have equal specificity and
      // application order decides — which is what puts this one on top.
      ':hover:where(:not(:disabled,[aria-disabled="true"]))':
        colorVars['--color-accent'],
    },
    borderColor: colorVars['--color-accent'],
    color: colorVars['--color-on-accent'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  /**
   * A day belonging to the month either side of this pane. It is muted and
   * unselectable, as in Calendar: it shows where the month ends. A tap out of
   * the pane would move the calendar under the thumb.
   *
   * It takes no tab stop: `tabbableISO` names only a date in its own pane's
   * month. So a date never has two tab stops.
   */
  dayOutside: {
    // Calendar's spill-day treatment: the secondary text colour and half
    // opacity, so these days read as background, not as dimmer choices.
    color: colorVars['--color-text-secondary'],
    opacity: 0.5,
  },
  dayDisabled: {
    // Calendar's disabled treatment: it fades the day's own colour to 0.3.
    // So a disabled in-month day and a disabled spill day stay a step apart,
    // and both read lighter than an enabled spill day.
    opacity: 0.3,
    cursor: 'default',
  },
});

const dynamic = stylex.create({
  spacer: (inlineSize: number) => ({
    inlineSize: `${inlineSize}px`,
  }),
  // insetInlineStart, not left: under RTL the panes lay out from the right,
  // and the scroller and the pager mirror with them.
  pane: (insetInlineStart: number, inlineSize: number) => ({
    insetInlineStart: `${insetInlineStart}px`,
    inlineSize: `${inlineSize}px`,
  }),
});

/** The handle of MonthScroller and of MonthPager, its touch counterpart. */
export interface MonthScrollerHandle {
  /** Bring a month to rest at the top of the scrollport. */
  scrollToMonth: (monthIndex: number, behavior?: ScrollBehavior) => void;
}

/** The props of MonthScroller and of MonthPager, its touch counterpart. */
export interface MonthScrollerProps {
  /** Imperative handle for programmatic navigation (Today, the wheels). */
  handleRef?: React.RefObject<MonthScrollerHandle | null>;
  /** The calendar's months, by index. */
  monthModel: MonthModel;
  /** First reachable month, as a month index. */
  minMonthIndex: number;
  /** Last reachable month, as a month index. */
  maxMonthIndex: number;
  /** Month to rest on at mount. */
  initialMonthIndex: number;
  /** Fires as the scroller passes each month, settled or not. */
  onVisibleMonthChange: (monthIndex: number) => void;
  /** Currently selected date. */
  selectedDate: PlainDate | null;
  /**
   * Today, for the `aria-current` marker; `null` while it is not known yet
   * (server render, hydration).
   */
  today: PlainDate | null;
  /** Whether a date fails min/max or a custom constraint. */
  isDateDisabled: (date: PlainDate) => boolean;
  /** First column of the week. */
  weekStartsOn: DayOfWeek;
  /** Fired when a day is tapped. */
  onSelect: (value: ISODateString) => void;
}

/**
 * A vertically continuous, snap-paged run of month grids.
 */
export function MonthScroller({
  handleRef,
  monthModel,
  minMonthIndex,
  maxMonthIndex,
  initialMonthIndex,
  onVisibleMonthChange,
  selectedDate,
  today,
  isDateDisabled,
  weekStartsOn,
  onSelect,
}: MonthScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowCount = maxMonthIndex - minMonthIndex + 1;

  // Pane WIDTH is read from layout, never assumed: it is whatever the CSS
  // says the scrollport is, so the snap offsets and the virtualization follow
  // a resize (rotation, a split-screen change) without re-deriving anything.
  const [paneSize, setPaneSize] = useState(0);
  // Which way the inline axis runs. Under RTL the panes lay out from the
  // right and scrollLeft counts DOWN from 0, so every conversion between a
  // row and a scroll offset has to know.
  const isRTL = useDirection() === 'rtl';
  const [centerRow, setCenterRow] = useState(initialMonthIndex - minMonthIndex);
  // The visible row, mirrored so the scroll handler can tell "changed" from
  // "same" without reading state, and notify the parent OUTSIDE a state
  // updater — React runs updaters during render, where another component's
  // setState is illegal.
  const centerRowRef = useRef(centerRow);

  /**
   * Scroll snapping is off from a re-center until the frame after its
   * commit. WebKit keeps the position it snapped to as an index into the
   * container's snap offsets, and re-snaps to that index after a layout: a
   * re-center that unmounts panes before the snapped one shifts the index,
   * so the re-snap lands a month further on, and the scroll that makes
   * re-centers again. One stalled frame right after an arrow (300 ms,
   * measured) was enough to set the calendar paging on by itself, a month
   * every few frames. With snapping off across the commit nothing re-snaps,
   * and switching it back on a frame later snaps to the pane in place.
   *
   * Each pause counts itself, so a batch of re-centers that ends on the
   * center it began from, which commits no new center, still restores
   * snapping.
   *
   * Not while a finger drives the scroll, from its touch until the scroll it
   * started comes to rest: iOS tracks a snap target for the gesture, and
   * turning snapping off drops it, so the swipe coasted past the month for
   * about two seconds and was corrected late (iOS 26.2 simulator, where the
   * same swipe snaps in about 0.6 s with snapping left on).
   */
  const [snapPauses, setSnapPauses] = useState(0);
  const isFingerScrollRef = useRef(false);
  const recenter = useCallback((scroller: HTMLElement, row: number) => {
    if (!isFingerScrollRef.current) {
      scroller.style.scrollSnapType = 'none';
      setSnapPauses(count => count + 1);
    }
    setCenterRow(row);
  }, []);
  // Synchronizes the scroller's snapping with the browser's frame loop: it
  // comes back on in the frame after the pause's commit, and a restore still
  // pending at the next pause or at unmount is dropped.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (snapPauses === 0 || scroller == null) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      scroller.style.scrollSnapType = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [snapPauses]);
  // A row to scroll to once its pane is mounted; see scrollToMonth.
  const pendingScrollRef = useRef<number | null>(null);

  /**
   * The row a programmatic scroll is heading for. Its own scroll events are
   * not reported back as if the user had gone there. The settle correction
   * finishes the steer instead of rounding it back. The steer ends once its
   * scroll has arrived, or once the user's own input reaches the scroller
   * (useScrollSettle).
   */
  const steer = useScrollSteer();

  const onVisibleMonthChangeRef = useRef(onVisibleMonthChange);
  onVisibleMonthChangeRef.current = onVisibleMonthChange;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller == null) {
      return;
    }
    const measure = () => {
      // Ignore zero: the picker can be mounted inside something not yet
      // displayed (a closed BottomSheet), and a zero width would unmount
      // every pane and lose the scroll position.
      const measured = scroller.clientWidth;
      if (measured > 0) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- pane width is a measurement; layout is the only place it exists
        setPaneSize(measured);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Land on the initial month before the first paint. Runs once the height is
  // known; `hasPositioned` keeps a later resize from yanking the user back.
  const hasPositionedRef = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller == null || paneSize === 0 || hasPositionedRef.current) {
      return;
    }
    hasPositionedRef.current = true;
    scroller.scrollLeft = scrollOffsetForRow(
      initialMonthIndex - minMonthIndex,
      paneSize,
      isRTL,
    );
  }, [paneSize, initialMonthIndex, minMonthIndex, isRTL]);

  // The Reduced Motion dip of a step on a touch screen, owned here so a
  // second step or the unmount clears it.
  const dipRef = useRef<ReducedMotionDip | null>(null);
  const stopDip = useCallback(() => {
    dipRef.current?.cancel();
    dipRef.current = null;
  }, []);
  // Synchronizes with the dip's animations: they do not outlive the scroller.
  useEffect(() => stopDip, [stopDip]);

  const scrollToMonth = useCallback(
    (monthIndex: number, behavior: ScrollBehavior = 'smooth') => {
      // Every step replaces a running dip, whichever way it moves. Otherwise
      // the dip's landing would undo a jump or an immediate step made after it.
      stopDip();
      const scroller = scrollerRef.current;
      if (scroller == null || paneSize === 0) {
        return;
      }
      const row = Math.min(
        rowCount - 1,
        Math.max(0, monthIndex - minMonthIndex),
      );
      if (Math.abs(row - centerRowRef.current) > OVERSCAN) {
        // Beyond the mounted window there is no pane at the target offset, and
        // `scroll-snap-type: mandatory` will not leave the scroller resting
        // where no snap area is — it re-snaps to the nearest mounted pane, so
        // a jump to another year lands one month away instead. Mount the
        // target first and scroll once it exists (see the layout effect
        // below); a jump that far is never worth animating either.
        pendingScrollRef.current = row;
        centerRowRef.current = row;
        // The jump is a steer too. Recording it replaces a steer left behind
        // by a scroll that moved nothing (the re-assert when the month and
        // year wheels close), which the settle would otherwise finish,
        // pulling the scroller back off the jump's month.
        steer.start(row);
        recenter(scroller, row);
        return;
      }
      const left = scrollOffsetForRow(row, paneSize, isRTL);
      // Under reduced motion the month changes without travel: at once on a fine
      // primary pointer, under an opacity dip on a coarse one (reducedMotionFade).
      const fade = behavior === 'smooth' ? reducedMotionFade(scroller) : null;
      if (fade != null) {
        // The window mounts around the target first, and the scroll lands in
        // the layout effect below, as a far jump does. So nothing moves the
        // window after the jump. If the window followed the jump, WebKit would
        // re-snap it one pane further on every frame. A scroll that lands on
        // the centre row reports nothing.
        const land = () => {
          // The landing is the newest steer. An earlier steer whose scroll
          // never arrived would otherwise hide every scroll after it, a
          // trackpad's included. Closing the wheels makes such a steer: it
          // re-asserts the month already in view.
          steer.end();
          if (row === centerRowRef.current) {
            scroller.scrollTo({left, behavior: 'auto'});
            return;
          }
          pendingScrollRef.current = row;
          centerRowRef.current = row;
          setCenterRow(row);
        };
        if (fade.duration === 0) {
          land();
          return;
        }
        // A newer step replaces this one: only its scroll lands.
        dipRef.current = playReducedMotionDip(scroller, fade, () => {
          dipRef.current = null;
          // The fade-in starts as soon as this returns. So render now: the
          // scroll lands in the layout effect, before the fade-in.
          // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the month must change before the dip's fade-in starts
          flushSync(land);
        });
        return;
      }
      steer.start(row);
      scroller.scrollTo({left, behavior});
    },
    [paneSize, minMonthIndex, rowCount, isRTL, recenter, stopDip, steer],
  );

  // Deliberately un-keyed: it runs after every render, costs a null check, and
  // must fire on whichever render finally mounts the pending row's pane.
  useLayoutEffect(() => {
    const row = pendingScrollRef.current;
    const scroller = scrollerRef.current;
    if (row == null || scroller == null || paneSize === 0) {
      return;
    }
    pendingScrollRef.current = null;
    scroller.scrollTo({
      left: scrollOffsetForRow(row, paneSize, isRTL),
      behavior: 'auto',
    });
  });

  useImperativeHandle(handleRef, () => ({scrollToMonth}), [scrollToMonth]);

  /**
   * Put the scroller back on a pane boundary once the gesture is over.
   *
   * `scroll-snap-type: mandatory` is supposed to make this unnecessary, and
   * on a static list it does. This list is virtualized: seven panes exist out
   * of twelve hundred, and the panes ARE the snap areas — so every month the
   * finger crosses mounts one and unmounts another, mid-fling.
   *
   * iOS scrolls off the main thread. It picks a landing place from the snap
   * points it knows about at the time, and a React re-render that lands after
   * that decision moves them; the scroller then comes to rest where no snap
   * point exists any more, and nothing re-snaps it. That is the calendar
   * sitting between two months with the weekday header still square — the
   * grid is not skewed, the scrollport is simply parked a couple of columns
   * into a pane. Chrome hides it by snapping again after the mutation.
   *
   * So the rest position is corrected here rather than trusted. It waits for
   * a true settle — touch released AND quiet, since iOS below 26 has no
   * `scrollend` and its momentum outlasts any naive timer (see
   * useScrollSettle) — and only moves when the offset is genuinely off, so a
   * scroller the browser snapped for itself is left alone.
   *
   * ## Why it re-checks that the scroller is still
   *
   * A quiet period is not proof of rest, and getting that wrong here does not
   * merely fail to fix the bug — it REVERSES the user's swipe. iOS runs its
   * own snap animation for ~150-300ms after the finger lifts, and the scroll
   * events it fires during that animation arrive irregularly; a gap longer
   * than the quiet period is routine in the slow tail. The settle then lands
   * mid-animation, reads a scrollLeft still travelling toward April, rounds
   * THAT to the nearest pane — which is still March, because the animation is
   * not yet halfway — and drags the calendar back where it came from. Swipe
   * forward, get pulled backward, which is what this looked like on a device.
   *
   * Two samples a frame apart settle it: if the offset moved, the scroller is
   * still going somewhere and its destination is not ours to guess. Skipping
   * costs nothing, because the animation's own scroll events re-arm the
   * settle, and the last of them gets a quiet period that ends at true rest.
   *
   * The threshold is a subpixel rather than exact equality. A scroller at rest
   * on a fractional-density viewport can report an offset that wobbles in the
   * last decimal place, and exact equality would read that as travel and never
   * correct at all — the failure mode being silent, which is the worst kind.
   * A tail crawling slower than half a pixel a frame has effectively arrived,
   * so treating it as arrived is right anyway.
   *
   * After the user's own scroll the correction goes to the nearest boundary,
   * at most half a pane away. After a steer it goes on to the steered month,
   * however early the browser cut the steer short. Either way its own scroll
   * settles onto the boundary it aimed at, where a steer counts as arrived, so
   * it cannot oscillate.
   */
  const settleFrameRef = useRef<number | undefined>(undefined);
  // Releases the settle frame on unmount.
  useEffect(
    () => () => {
      if (settleFrameRef.current != null) {
        cancelAnimationFrame(settleFrameRef.current);
      }
    },
    [],
  );

  const settleOnRest = (scroller: HTMLElement) => {
    // At rest, momentum included: the finger no longer drives the scroll.
    isFingerScrollRef.current = false;
    if (paneSize === 0) {
      return;
    }
    const offsetBefore = scroller.scrollLeft;
    if (settleFrameRef.current != null) {
      cancelAnimationFrame(settleFrameRef.current);
    }
    settleFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = undefined;
      // Still travelling — including a snap animation iOS has not finished.
      // Correcting toward the nearest pane from a position mid-flight would
      // undo the swipe rather than complete it.
      if (Math.abs(scroller.scrollLeft - offsetBefore) >= 0.5) {
        return;
      }
      // A steer the browser cut short is finished, not rounded back. WebKit
      // ends a smooth scroll that a second one retargeted once the first
      // one's time is up, firing `scrollend` part-way: an arrow tapped late
      // in the previous arrow's scroll stopped near that month, and rounding
      // to the nearest pane put the scroller back on it while the title named
      // the new one.
      const steered = steer.current();
      const row =
        steered ??
        rowAtScrollOffset(scroller.scrollLeft, paneSize, rowCount, isRTL);
      const target = scrollOffsetForRow(row, paneSize, isRTL);
      // Sub-pixel drift is the browser's own rounding, not a failed snap.
      if (Math.abs(scroller.scrollLeft - target) < 1) {
        // At rest on its target, a steer has arrived even if no scroll
        // crossed into its month.
        steer.end();
        return;
      }
      scroller.scrollTo({left: target, behavior: 'smooth'});
    });
  };
  useScrollSettle(scrollerRef, settleOnRest, true, undefined, steer);

  // Claim horizontal gestures, leave vertical ones to the sheet.
  //
  // `touch-action: pan-x` alone is NOT enough: it governs what the browser
  // pans natively, and the sheet's listener is JavaScript whose
  // preventDefault() cancels the scroll regardless. Measured — a swipe 9° off
  // horizontal had every touchmove cancelled by the sheet and the month never
  // changed. The axis lock is biased toward horizontal, because a thumb arcs
  // as it swipes; `onSwipe` then pages the diagonals the browser itself
  // declines to pan, so no angle is left doing nothing. See
  // useOwnScrollGesture.
  useOwnScrollGesture(scrollerRef, 'inline', {
    onSwipe: direction => {
      const scroller = scrollerRef.current;
      if (scroller == null || paneSize === 0) {
        return;
      }
      scroller.scrollBy({left: direction * paneSize, behavior: 'smooth'});
    },
  });

  // rAF-throttled: a touch scroll fires far more scroll events than frames,
  // and all this does is move a label and widen a window.
  const frameRef = useRef<number | undefined>(undefined);
  // Syncs scroll and touch listeners on the scroller with its measured
  // height.
  useEffect(() => {
    const scroller = scrollerRef.current;
    // Not before the height is known. A listener attached while it was zero
    // would close over that zero and report row 0 for any scroll — and the
    // scroll event fired by the initial positioning arrives just late enough
    // to be handled by that stale listener. Every pane then unmounts except
    // rows 0-2, and `scroll-snap-type: mandatory` yanks the scroller to the
    // nearest surviving snap area, a century away from where it just landed.
    if (scroller == null || paneSize === 0) {
      return;
    }
    // From a touch until its scroll comes to rest (the settle above), the
    // finger drives the scroll and a re-center leaves snapping on.
    const onTouchStart = () => {
      isFingerScrollRef.current = true;
    };

    const onScroll = () => {
      if (frameRef.current != null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined;
        const row = rowAtScrollOffset(
          scroller.scrollLeft,
          paneSize,
          rowCount,
          isRTL,
        );
        if (row === centerRowRef.current) {
          return;
        }
        centerRowRef.current = row;
        recenter(scroller, row);
        // Report nothing while a steer is in flight. `scrollToMonth` is only
        // ever called by something that already knows the month — a wheel
        // commit, a header arrow, the re-assert when the wheels close — so
        // none of the scrolling it causes is news, including whatever the
        // scroller passes through on the way.
        //
        // Reporting it is a feedback cycle, and worse on iOS. A wheel commit
        // steers this scroller while it is hidden behind the wheels, and a
        // hidden scroller does not reliably stay where it was put: iOS
        // re-snaps it when the panel becomes visible again, firing scrolls at
        // the exact moment reports start being trusted again. The month drifted
        // on the way back to the calendar.
        //
        // Ended on arrival, or by the user's input (useScrollSettle). From then
        // the user owns the scroller, and every month it passes is worth
        // reporting.
        const steered = steer.current();
        if (steered != null) {
          if (steered === row) {
            steer.end();
          }
          return;
        }
        onVisibleMonthChangeRef.current(minMonthIndex + row);
      });
    };
    scroller.addEventListener('scroll', onScroll, PASSIVE);
    scroller.addEventListener('touchstart', onTouchStart, PASSIVE);
    return () => {
      scroller.removeEventListener('scroll', onScroll, PASSIVE);
      scroller.removeEventListener('touchstart', onTouchStart, PASSIVE);
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
    };
  }, [paneSize, rowCount, minMonthIndex, isRTL, recenter, steer]);

  const {focusedDate, handleKeyDown, handleDayFocus} = useMonthGridFocus(
    scrollerRef,
    {
      monthModel,
      minMonthIndex,
      maxMonthIndex,
      weekStartsOn,
      scrollToMonth,
      onVisibleMonthChangeRef,
    },
  );

  const visibleRows = paneWindow(centerRow, rowCount, OVERSCAN);

  return (
    <div
      ref={scrollerRef}
      data-scroller="months"
      {...stylex.props(styles.scroller)}>
      <div
        {...stylex.props(styles.spacer, dynamic.spacer(rowCount * paneSize))}>
        {paneSize > 0 &&
          rowsIn(visibleRows).map(row => (
            <MonthPane
              key={row}
              monthModel={monthModel}
              monthIndex={minMonthIndex + row}
              insetInlineStart={row * paneSize}
              inlineSize={paneSize}
              selectedDate={selectedDate}
              focusedDate={focusedDate}
              today={today}
              isDateDisabled={isDateDisabled}
              weekStartsOn={weekStartsOn}
              onSelect={onSelect}
              onDayKeyDown={handleKeyDown}
              onDayFocus={handleDayFocus}
              hasTabStop
              paneStyle={styles.paneSnap}
            />
          ))}
      </div>
    </div>
  );
}

MonthScroller.displayName = 'MonthScroller';

export interface MonthPaneProps {
  /** The calendar's months, by index. */
  monthModel: MonthModel;
  monthIndex: number;
  insetInlineStart: number;
  inlineSize: number;
  selectedDate: PlainDate | null;
  focusedDate: PlainDate | null;
  /** Today, or `null` while it is not known yet (server render, hydration). */
  today: PlainDate | null;
  isDateDisabled: (date: PlainDate) => boolean;
  weekStartsOn: DayOfWeek;
  onSelect: (value: ISODateString) => void;
  onDayKeyDown: (event: React.KeyboardEvent, date: PlainDate) => void;
  onDayFocus: (date: PlainDate) => void;
  /**
   * Whether one of this pane's days takes a tab stop. The pager gives it only
   * to the month it shows. A neighbour is mounted off-screen, and Tab into it
   * would scroll the clipped viewport under the track.
   */
  hasTabStop: boolean;
  /** The surface's own pane style: the scroller's snap or the pager's layer. */
  paneStyle?: stylex.StyleXStyles;
}

/**
 * One month, as a six-row grid.
 *
 * It has no `role="columnheader"` row: the weekday names are one sticky row
 * outside the scroller or the pager, so they never scroll away. Each day
 * carries its weekday in its accessible name instead.
 */
export const MonthPane = memo(function MonthPane({
  monthModel,
  monthIndex,
  insetInlineStart,
  inlineSize,
  selectedDate,
  focusedDate,
  today,
  isDateDisabled,
  weekStartsOn,
  onSelect,
  onDayKeyDown,
  onDayFocus,
  hasTabStop,
  paneStyle,
}: MonthPaneProps) {
  const locale = useLocale();
  const {calendar} = monthModel;
  const month = useMemo(
    () => monthModel.monthAt(monthIndex),
    [monthModel, monthIndex],
  );
  const {weeks} = useCalendarDays({
    ...calendarYearMonthOf(calendar, month),
    calendar,
    weekStartsOn,
    // Always six rows: a variable grid would make pane heights differ, and
    // with them every snap offset below this month.
    hasVariableRowCount: false,
  });

  const monthLabel = formatCalendarMonthLabel(calendar, month, locale);

  // One day per pane is tab-reachable, so Tab moves through the picker, not
  // through 42 buttons. It is the focused day, else the selection, else the
  // first of the month.
  const tabbableISO = (() => {
    if (focusedDate != null && isInCalendarMonth(focusedDate, month)) {
      return plainDateToISO(focusedDate);
    }
    if (selectedDate != null && isInCalendarMonth(selectedDate, month)) {
      return plainDateToISO(selectedDate);
    }
    return plainDateToISO(month.start);
  })();

  return (
    <div
      role="grid"
      aria-label={monthLabel}
      data-month={monthLabel}
      {...stylex.props(
        styles.pane,
        paneStyle,
        dynamic.pane(insetInlineStart, inlineSize),
      )}>
      {weeks.map(week => (
        <div key={week[0].iso} role="row" {...stylex.props(styles.row)}>
          {week.map(day => {
            // A spilled day is context, not a choice, as in Calendar's
            // `effectivelyDisabled`. So a date borrowed from a neighbouring
            // month carries no ring or puck in the pane that only shows it.
            const isDisabled = day.isOutside || isDateDisabled(day.date);
            const isSelected =
              !day.isOutside &&
              selectedDate != null &&
              plainDateIsEqual(day.date, selectedDate);
            const isToday =
              !day.isOutside &&
              today != null &&
              plainDateIsEqual(day.date, today);

            return (
              <div
                key={day.iso}
                role="gridcell"
                aria-selected={isSelected || undefined}
                {...stylex.props(styles.cell)}>
                <button
                  type="button"
                  data-date={day.iso}
                  data-outside={day.isOutside ? '' : undefined}
                  tabIndex={hasTabStop && day.iso === tabbableISO ? 0 : -1}
                  aria-label={formatCalendarDate(
                    calendar,
                    day.date,
                    DATE_FORMAT_WITH_WEEKDAY,
                    locale,
                  )}
                  aria-disabled={isDisabled || undefined}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelect(day.iso);
                    }
                  }}
                  onFocus={() => onDayFocus(day.date)}
                  onKeyDown={event => onDayKeyDown(event, day.date)}
                  {...stylex.props(
                    styles.day,
                    focusOutlineStyles.focusVisible,
                    // Outside first, so disabled wins where both apply. A
                    // spilled day past the range must not look more available
                    // than the in-month days beside it.
                    day.isOutside && styles.dayOutside,
                    isDisabled && styles.dayDisabled,
                  )}>
                  <span
                    {...stylex.props(
                      styles.puck,
                      !isDisabled && styles.puckHoverable,
                      isToday && styles.puckToday,
                      isSelected && styles.puckSelected,
                    )}>
                    {plainDateFormatDayNumber(day.dayNumber, locale)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

MonthPane.displayName = 'MonthPane';

/**
 * The day a grid key moves the focus to from `date`, or null for any other
 * key. The vocabulary is the APG grid's: the arrows follow the reading
 * direction, and Home and End reach the ends of the shown week. PageUp and
 * PageDown move a month of the calendar, and with Shift a year, as Calendar
 * does.
 */
export function monthGridKeyTarget(
  event: React.KeyboardEvent,
  date: PlainDate,
  {
    calendar,
    isRTL,
    weekStartsOn,
  }: {calendar: CalendarSystem; isRTL: boolean; weekStartsOn: DayOfWeek},
): PlainDate | null {
  const column = (plainDateDayOfWeek(date) - weekStartsOn + 7) % 7;
  const forward = isRTL ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRTL ? 'ArrowRight' : 'ArrowLeft';
  switch (event.key) {
    case backward:
      return plainDateAddDays(date, -1);
    case forward:
      return plainDateAddDays(date, 1);
    case 'ArrowUp':
      return plainDateAddDays(date, -7);
    case 'ArrowDown':
      return plainDateAddDays(date, 7);
    case 'Home':
      return plainDateAddDays(date, -column);
    case 'End':
      return plainDateAddDays(date, 6 - column);
    case 'PageUp':
      return event.shiftKey
        ? calendarShiftYears(calendar, date, -1)
        : calendarShiftMonths(calendar, date, -1);
    case 'PageDown':
      return event.shiftKey
        ? calendarShiftYears(calendar, date, 1)
        : calendarShiftMonths(calendar, date, 1);
    default:
      return null;
  }
}

export interface MonthGridFocusOptions {
  /** The calendar's months, by index. */
  monthModel: MonthModel;
  minMonthIndex: number;
  maxMonthIndex: number;
  weekStartsOn: DayOfWeek;
  /** Moves the grid to a month, as its arrows do. */
  scrollToMonth: (monthIndex: number, behavior?: ScrollBehavior) => void;
  /** The grid's month report, read through a ref. */
  onVisibleMonthChangeRef: RefObject<(monthIndex: number) => void>;
}

export interface MonthGridFocus {
  /** The day that has the keyboard focus, or null before the first key. */
  focusedDate: PlainDate | null;
  /** The days' key handler. */
  handleKeyDown: (event: KeyboardEvent, date: PlainDate) => void;
  /** The days' focus handler. */
  handleDayFocus: (date: PlainDate) => void;
}

/**
 * The month grid's keyboard focus. It moves by date, not by cell index, so it
 * crosses months as a calendar does, and the grid follows it to the new month.
 * Only a key press moves DOM focus, so a drag never takes it.
 */
export function useMonthGridFocus(
  gridRef: RefObject<HTMLElement | null>,
  {
    monthModel,
    minMonthIndex,
    maxMonthIndex,
    weekStartsOn,
    scrollToMonth,
    onVisibleMonthChangeRef,
  }: MonthGridFocusOptions,
): MonthGridFocus {
  const [focusedDate, setFocusedDate] = useState<PlainDate | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const moveFocusTo = useCallback(
    (from: PlainDate, next: PlainDate) => {
      const nextIndex = monthModel.indexOf(next);
      if (nextIndex < minMonthIndex || nextIndex > maxMonthIndex) {
        return;
      }
      shouldRestoreFocusRef.current = true;
      setFocusedDate(next);
      if (nextIndex !== monthModel.indexOf(from)) {
        scrollToMonth(nextIndex, 'smooth');
        // Neither grid reports a move it was told to make, so the month is
        // reported here.
        onVisibleMonthChangeRef.current(nextIndex);
      }
    },
    [
      monthModel,
      minMonthIndex,
      maxMonthIndex,
      scrollToMonth,
      onVisibleMonthChangeRef,
    ],
  );

  const isRTL = useDirection() === 'rtl';
  const handleKeyDown = useCallback(
    (event: KeyboardEvent, date: PlainDate) => {
      const next = monthGridKeyTarget(event, date, {
        calendar: monthModel.calendar,
        isRTL,
        weekStartsOn,
      });
      if (next != null) {
        event.preventDefault();
        moveFocusTo(date, next);
      }
    },
    [isRTL, monthModel, moveFocusTo, weekStartsOn],
  );

  const focusedISO = focusedDate == null ? null : plainDateToISO(focusedDate);
  // Syncs DOM focus with the focused day. The day may sit in a pane mounted
  // only this frame: it takes focus once it exists.
  useEffect(() => {
    if (!shouldRestoreFocusRef.current || focusedISO == null) {
      return;
    }
    // A date can be mounted twice: as a real day in its pane and as a
    // disabled spill copy in a neighbour. Only the real day may take focus,
    // or Enter and Space would select nothing.
    const target = gridRef.current?.querySelector<HTMLElement>(
      `[data-date="${focusedISO}"]:not([data-outside])`,
    );
    if (target != null) {
      shouldRestoreFocusRef.current = false;
      // preventScroll: the grid already moves to this month. A browser
      // scroll-into-view would fight the scroller's snap, or shift the
      // pager's viewport under its track.
      target.focus({preventScroll: true});
    }
  }, [focusedISO, gridRef]);

  // A focus event fires for the programmatic focus above too; only take the
  // date when it is actually a different day.
  const handleDayFocus = useCallback((date: PlainDate) => {
    setFocusedDate(previous =>
      previous != null && plainDateIsEqual(previous, date) ? previous : date,
    );
  }, []);

  return {focusedDate, handleKeyDown, handleDayFocus};
}
