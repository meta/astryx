// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMonthGridFocus.ts
 * @input The month grid's element, its month range and week start, and how
 *   the grid moves to a month and reports one
 * @output useMonthGridFocus: the focused day, the days' key handler and their
 *   focus handler
 * @position Internal hook shared by MonthScroller.tsx and MonthPager.tsx
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {useDirection} from '../i18n/useDirection';
import type {DayOfWeek, PlainDate} from '../utils/dateTypes';
import {plainDateIsEqual, plainDateToISO} from '../utils/plainDate';
import {monthGridKeyTarget} from './MonthPane';
import type {MonthModel} from './monthGeometry';

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
