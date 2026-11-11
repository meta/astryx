// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MonthPager.tsx
 * @input Month bounds, selected value, constraints, week start
 * @output Exports MonthPager, MonthScroller's counterpart with the same props
 *   and handle
 * @position Internal component of the pickers' touch layer
 *   (datePickerTouch.ts). The touch date fields render it under a finger.
 *
 * The month grid pages like UIDatePicker's paging scroll view, on the shared
 * pager (hooks/usePager.ts). A few fixed six-row panes are mounted.
 *
 * SYNC: When modified, update MonthScroller.tsx, TouchDateField.tsx,
 * TouchDateTimeField.tsx and DateInputTouch.test.tsx.
 */

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {usePager} from '../hooks/usePager';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {observeResize} from '../utils/sharedResizeObserver';
import {dateInputTouchGeometry} from './tokens.stylex';
import {
  MonthPane,
  useMonthGridFocus,
  type MonthScrollerProps,
} from './MonthScroller';
import {useOwnScrollGesture} from './useOwnScrollGesture';
import {clampIndex, paneWindow, rowsIn} from './monthGeometry';

/**
 * Panes mounted on each side of the target month: UIKit's calendar keeps
 * seven pages. A release or a chevron tap moves one month at most. So the
 * window follows the target and always holds the pages on screen.
 */
const OVERSCAN = 3;

const styles = stylex.create({
  viewport: {
    position: 'relative',
    blockSize: dateInputTouchGeometry.paneBlockSize,
    // Stated, not inherited from the reset: the pane size and the pager's
    // page width key off the measured box.
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  /** The row of panes the pager translates. */
  track: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    inlineSize: '100%',
    // No native pan on either axis: horizontal drags are the pager's and
    // vertical ones the sheet's, both in JavaScript, as on the sheet's own
    // surface. The pager leaves the viewport `pan-y`. In a sheet that lets the
    // browser start a vertical scroll and throttle the sheet's drag moves.
    // Pinch-zoom stays the browser's.
    touchAction: 'pinch-zoom',
  },
  /** Each pane on its own layer. */
  paneLayer: {
    // Painted whole before it moves: through a busy main thread, Mobile
    // Safari moves the track but cannot paint a new page.
    willChange: 'transform',
  },
});

/**
 * A run of month grids paged like UIDatePicker's inline calendar.
 */
function MonthPagerComponent({
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rowCount = maxMonthIndex - minMonthIndex + 1;
  const initialRow = clampIndex(
    initialMonthIndex - minMonthIndex,
    0,
    rowCount - 1,
  );

  // Pane width is read from layout, never assumed, so the panes follow a
  // resize (rotation, a split-screen change). The pager measures the same
  // box for its page width.
  const [paneSize, setPaneSize] = useState(0);
  // The pager's target month: the mounted window follows it.
  const [centerRow, setCenterRow] = useState(initialRow);
  // The month last reported to the owner, so a drag reports each crossing
  // once.
  const reportedRowRef = useRef(initialRow);
  // A far jump waits for its pane to mount before the track moves.
  const pendingRowRef = useRef<number | null>(null);

  // Read through a ref, so a caller need not memoize the callback.
  const onVisibleMonthChangeRef = useRef(onVisibleMonthChange);
  onVisibleMonthChangeRef.current = onVisibleMonthChange;

  const report = useCallback(
    (row: number) => {
      if (row === reportedRowRef.current) {
        return;
      }
      reportedRowRef.current = row;
      onVisibleMonthChangeRef.current(minMonthIndex + row);
    },
    [minMonthIndex],
  );

  const pager = usePager({
    viewportRef,
    trackRef,
    count: rowCount,
    defaultIndex: initialRow,
    onIndexChange: (index, reason) => {
      setCenterRow(index);
      // The settle reports a release's month as the content crosses half a
      // page (below). A steered move comes from an owner that knows its month.
      if (reason !== 'drag') {
        reportedRowRef.current = index;
      }
    },
    // The settle has come to rest: whatever the frames showed, the title
    // names the month the grid rests on.
    onSettle: index => report(index),
    // UIKit's split in a sheet (useOwnScrollGesture's 'pager' mode,
    // MEASUREMENTS.md M-DP01). The pan begins on the first move where either
    // axis travels its hysteresis, and only if the sideways travel has reached
    // it. Like every pan, it claims its touch only when it begins, on the move
    // the sheet's split decides on.
    panOptions: {
      axisRatio: 0,
      shouldBegin: recognizer =>
        Math.abs(recognizer.totalTranslation().x) >=
        UIKIT_GESTURES.pan.hysteresis.value,
    },
  });

  // Syncs the pane width with the viewport's size, through the shared resize
  // observer. It measures once on registration, then on every resize.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport == null) {
      return;
    }
    return observeResize(viewport, () => {
      // Ignore zero: the picker can be mounted inside something not yet
      // displayed (a closed BottomSheet).
      const measured = viewport.clientWidth;
      if (measured > 0) {
        setPaneSize(measured);
      }
    });
  }, []);

  // The settle's frames, read for the title until the grid rests.
  const settleFrameRef = useRef<number | null>(null);
  const followSettle = useCallback(() => {
    if (settleFrameRef.current != null) {
      cancelAnimationFrame(settleFrameRef.current);
    }
    let frames = 0;
    const step = () => {
      frames += 1;
      if (frames > 2) {
        report(
          clampIndex(pager.nearestPage(pager.presentation()), 0, rowCount - 1),
        );
      }
      settleFrameRef.current =
        frames <= 2 || pager.isSettling ? requestAnimationFrame(step) : null;
    };
    settleFrameRef.current = requestAnimationFrame(step);
  }, [pager, report, rowCount]);
  // Synchronizes with the browser's frame loop: stops reading a settle's
  // frames once the grid unmounts.
  useEffect(
    () => () => {
      if (settleFrameRef.current != null) {
        cancelAnimationFrame(settleFrameRef.current);
      }
    },
    [],
  );

  // The title follows the drag: the month nearest the offset, reported as the
  // content crosses half a page (UIDatePicker's
  // `datePicker.calendar.pager.titleFollows`). The pager's own listener runs
  // first, so the position read here is the one this move wrote.
  useEffect(
    () =>
      pager.pan.addListener(recognizer => {
        const state = recognizer.state;
        if (state === 'began' || state === 'changed') {
          report(
            clampIndex(
              pager.nearestPage(pager.presentation()),
              0,
              rowCount - 1,
            ),
          );
        } else if (state === 'ended' || state === 'cancelled') {
          // Not at the lift: the settle carries the title on, changing it as
          // the content crosses half a page, as during the drag. Its first
          // two frames report nothing. So the owner's render stays out of
          // Mobile Safari's hand-off of the settle to the compositor, as the
          // pager's own report does.
          followSettle();
        }
      }),
    [pager, report, rowCount, followSettle],
  );

  // An arrow, a key or the wheels name the month. The settle they interrupt
  // stops reporting, so the title stays on that month
  // (`datePicker.calendar.chevron.retarget`).
  const stopFollowingSettle = useCallback(() => {
    if (settleFrameRef.current != null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
  }, []);

  const scrollToMonth = useCallback(
    (monthIndex: number, behavior: ScrollBehavior = 'smooth') => {
      stopFollowingSettle();
      const row = clampIndex(monthIndex - minMonthIndex, 0, rowCount - 1);
      reportedRowRef.current = row;
      // Already the pager's target, as when the month and year wheels close
      // on the month shown: nothing moves. A pending far jump here would wait
      // for a render `setCenterRow` does not cause. It would then land on the
      // next render, a drag crossing half a month, and cancel that drag.
      if (row === pager.virtualIndex) {
        return;
      }
      const distance = Math.abs(row - pager.virtualIndex);
      if (behavior === 'smooth' && distance <= OVERSCAN) {
        pager.goTo(row, {animated: true});
        return;
      }
      // Beyond the mounted window there is no pane at the target yet: mount
      // it first, then move (the layout effect below). A jump that far is
      // never worth animating either.
      pendingRowRef.current = row;
      setCenterRow(row);
    },
    [minMonthIndex, rowCount, pager, stopFollowingSettle],
  );

  // Synchronizes the pager's position with the DOM. A far jump moves once
  // the render that mounts the target's pane commits, before paint. It has
  // no dependencies: it costs a null check and must run on whichever render
  // mounts the pending row's pane.
  useLayoutEffect(() => {
    const row = pendingRowRef.current;
    if (row == null) {
      return;
    }
    pendingRowRef.current = null;
    pager.goTo(row, {animated: false});
  });

  useImperativeHandle(handleRef, () => ({scrollToMonth}), [scrollToMonth]);

  // Inside a bottom sheet, the sheet's touch listener skips the drags UIKit
  // gives the grid and every move before the decision. The pager's pan uses
  // the same rule (above).
  useOwnScrollGesture(viewportRef, 'pager');

  const {focusedDate, handleKeyDown, handleDayFocus} = useMonthGridFocus(
    viewportRef,
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
      ref={viewportRef}
      data-scroller="months"
      {...stylex.props(styles.viewport)}>
      <div ref={trackRef} {...stylex.props(styles.track)}>
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
              hasTabStop={row === centerRow}
              paneStyle={styles.paneLayer}
            />
          ))}
      </div>
    </div>
  );
}

/**
 * Memoized, as its panes are. The sheet re-renders on every month/year toggle
 * while the calendar's props stay stable. Re-rendering each pane's 42 days
 * would be most of the toggle's main-thread work.
 */
export const MonthPager = memo(MonthPagerComponent);

MonthPager.displayName = 'MonthPager';
