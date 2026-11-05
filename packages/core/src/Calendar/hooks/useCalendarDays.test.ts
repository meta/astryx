// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCalendarDays.test.ts
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for useCalendarDays hook
 * @position Testing; validates calendar grid generation (offsets, outside
 *   days, row counts, day-name rotation)
 */

import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useCalendarDays} from './useCalendarDays';

// Day-of-week fixture facts (verified independently against the Gregorian
// calendar, not against the hook):
//   2026-01-01 = Thursday, 2026-02-01 = Sunday, 2026-03-01 = Sunday,
//   2024-02-01 = Thursday (leap year), 2025-12-01 = Monday.

// =============================================================================
// Grid offsets and outside days
// =============================================================================

describe('useCalendarDays — grid offsets and outside days', () => {
  it('renders a month starting exactly on weekStartsOn with zero leading cells', () => {
    // February 2026 starts on a Sunday; weekStartsOn defaults to Sunday.
    const {result} = renderHook(() =>
      useCalendarDays({year: 2026, month: 2, hasVariableRowCount: true}),
    );

    // 28 days, no leading offset → exactly 4 rows, no outside days at all.
    expect(result.current.totalCells).toBe(28);
    expect(result.current.days).toHaveLength(28);
    expect(result.current.weeks).toHaveLength(4);
    expect(result.current.days.every(d => !d.isOutside)).toBe(true);
    expect(result.current.days.map(d => d.dayNumber)).toEqual(
      Array.from({length: 28}, (_, i) => i + 1),
    );
    expect(result.current.days[0]).toEqual({
      date: {year: 2026, month: 2, day: 1},
      iso: '2026-02-01',
      isOutside: false,
      dayNumber: 1,
    });
  });

  it('pads the fixed 6-row grid with trailing next-month days', () => {
    // Same February 2026, but the default fixed grid always has 42 cells.
    const {result} = renderHook(() => useCalendarDays({year: 2026, month: 2}));

    expect(result.current.totalCells).toBe(42);
    expect(result.current.weeks).toHaveLength(6);
    // Last in-month day at index 27, then March spills in.
    expect(result.current.days[27]).toEqual({
      date: {year: 2026, month: 2, day: 28},
      iso: '2026-02-28',
      isOutside: false,
      dayNumber: 28,
    });
    expect(result.current.days[28]).toEqual({
      date: {year: 2026, month: 3, day: 1},
      iso: '2026-03-01',
      isOutside: true,
      dayNumber: 1,
    });
    expect(result.current.days[41]).toEqual({
      date: {year: 2026, month: 3, day: 14},
      iso: '2026-03-14',
      isOutside: true,
      dayNumber: 14,
    });
  });

  it('wraps a negative starting offset by a full week', () => {
    // February 2026 starts on Sunday (0); weekStartsOn=1 makes the raw offset
    // 0 - 1 = -1, which must wrap to 6 leading cells (Mon Jan 26 … Sat Jan 31).
    const {result} = renderHook(() =>
      useCalendarDays({
        year: 2026,
        month: 2,
        weekStartsOn: 1,
        hasVariableRowCount: true,
      }),
    );

    expect(result.current.days[0]).toEqual({
      date: {year: 2026, month: 1, day: 26},
      iso: '2026-01-26',
      isOutside: true,
      dayNumber: 26,
    });
    expect(result.current.days[5]).toEqual({
      date: {year: 2026, month: 1, day: 31},
      iso: '2026-01-31',
      isOutside: true,
      dayNumber: 31,
    });
    expect(result.current.days[6]).toEqual({
      date: {year: 2026, month: 2, day: 1},
      iso: '2026-02-01',
      isOutside: false,
      dayNumber: 1,
    });
    // 6 leading + 28 days = 34 → ceil(34/7) = 5 rows = 35 cells.
    expect(result.current.totalCells).toBe(35);
    expect(result.current.days[34]).toEqual({
      date: {year: 2026, month: 3, day: 1},
      iso: '2026-03-01',
      isOutside: true,
      dayNumber: 1,
    });
  });

  it('leads with previous-year December days for a January month', () => {
    // January 2026 starts on Thursday → 4 leading cells from December 2025.
    const {result} = renderHook(() => useCalendarDays({year: 2026, month: 1}));

    expect(result.current.days[0]).toEqual({
      date: {year: 2025, month: 12, day: 28},
      iso: '2025-12-28',
      isOutside: true,
      dayNumber: 28,
    });
    expect(result.current.days[3]).toEqual({
      date: {year: 2025, month: 12, day: 31},
      iso: '2025-12-31',
      isOutside: true,
      dayNumber: 31,
    });
    expect(result.current.days[4]).toEqual({
      date: {year: 2026, month: 1, day: 1},
      iso: '2026-01-01',
      isOutside: false,
      dayNumber: 1,
    });
    // 4 + 31 = 35 in-use cells; the fixed grid trails into February 2026.
    expect(result.current.days[35]).toEqual({
      date: {year: 2026, month: 2, day: 1},
      iso: '2026-02-01',
      isOutside: true,
      dayNumber: 1,
    });
  });

  it('trails with next-year January days for a December month', () => {
    // December 2025 starts on Monday → 1 leading cell (Sun Nov 30).
    const {result} = renderHook(() => useCalendarDays({year: 2025, month: 12}));

    expect(result.current.days[0]).toEqual({
      date: {year: 2025, month: 11, day: 30},
      iso: '2025-11-30',
      isOutside: true,
      dayNumber: 30,
    });
    expect(result.current.days[31]).toEqual({
      date: {year: 2025, month: 12, day: 31},
      iso: '2025-12-31',
      isOutside: false,
      dayNumber: 31,
    });
    expect(result.current.days[32]).toEqual({
      date: {year: 2026, month: 1, day: 1},
      iso: '2026-01-01',
      isOutside: true,
      dayNumber: 1,
    });
    expect(result.current.days[41]).toEqual({
      date: {year: 2026, month: 1, day: 10},
      iso: '2026-01-10',
      isOutside: true,
      dayNumber: 10,
    });
  });

  it('includes February 29 inside a leap-year month', () => {
    // February 2024 starts on Thursday → 4 leading cells; 4 + 29 = 33 → 5 rows.
    const {result} = renderHook(() =>
      useCalendarDays({year: 2024, month: 2, hasVariableRowCount: true}),
    );

    expect(result.current.totalCells).toBe(35);
    expect(result.current.days[32]).toEqual({
      date: {year: 2024, month: 2, day: 29},
      iso: '2024-02-29',
      isOutside: false,
      dayNumber: 29,
    });
    expect(result.current.days[33]).toEqual({
      date: {year: 2024, month: 3, day: 1},
      iso: '2024-03-01',
      isOutside: true,
      dayNumber: 1,
    });
  });
});

// =============================================================================
// Day names
// =============================================================================

describe('useCalendarDays — day names', () => {
  it('defaults day names to Sunday-first', () => {
    const {result} = renderHook(() => useCalendarDays({year: 2026, month: 6}));

    expect(result.current.dayNames).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });

  it('rotates day names to Monday-first for weekStartsOn=1', () => {
    const {result} = renderHook(() =>
      useCalendarDays({year: 2026, month: 6, weekStartsOn: 1}),
    );

    expect(result.current.dayNames).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('rotates day names to Saturday-first for weekStartsOn=6', () => {
    const {result} = renderHook(() =>
      useCalendarDays({year: 2026, month: 6, weekStartsOn: 6}),
    );

    expect(result.current.dayNames).toEqual([
      'Sat',
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
    ]);
  });
});

// =============================================================================
// Week grouping
// =============================================================================

describe('useCalendarDays — week grouping', () => {
  it('groups the flat days array into rows of seven without gaps or reordering', () => {
    const {result} = renderHook(() => useCalendarDays({year: 2026, month: 1}));

    expect(result.current.weeks).toHaveLength(6);
    for (const week of result.current.weeks) {
      expect(week).toHaveLength(7);
    }
    // Same cell objects, same order — weeks is a view over days.
    expect(result.current.weeks.flat()).toEqual(result.current.days);
    expect(result.current.weeks[1][0]).toBe(result.current.days[7]);
  });
});
