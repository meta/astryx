// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCalendarNavigation.test.ts
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for useCalendarNavigation hook
 * @position Testing; validates focus-month init, month navigation, controlled
 *   mode, and pending keyboard focus
 *
 * NOTE: Every test passes `initialValue` or `focusDate` so the hook never
 * falls back to plainDateToday() — CI has no pinned timezone or clock. Month
 * labels are asserted as English literals: with no InternationalizationProvider
 * mounted, useLocale() resolves to 'en', so the hook's formatting is
 * deterministic and independent of the machine locale.
 */

import {describe, it, expect, vi} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useCalendarNavigation} from './useCalendarNavigation';

// =============================================================================
// Initialization
// =============================================================================

describe('useCalendarNavigation — initialization', () => {
  it('starts on the first of the initialValue month', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    expect(result.current.baseMonth).toEqual({year: 2026, month: 1, day: 1});
    expect(result.current.visibleMonths).toEqual([
      {year: 2026, month: 1, day: 1},
    ]);
    expect(result.current.pendingFocus).toBeNull();
  });

  it('prefers focusDate over initialValue for the starting month', () => {
    // focusDate without onFocusDateChange is NOT controlled — it only seeds
    // the internal state, and it wins over initialValue.
    const {result} = renderHook(() =>
      useCalendarNavigation({
        focusDate: '2026-03-15',
        initialValue: '2026-06-01',
      }),
    );

    expect(result.current.baseMonth).toEqual({year: 2026, month: 3, day: 1});
  });

  it('labels a single visible month with its formatted month and year', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-04-10'}),
    );

    expect(result.current.monthYearLabel).toBe('April 2026');
  });
});

// =============================================================================
// Month navigation (uncontrolled)
// =============================================================================

describe('useCalendarNavigation — uncontrolled navigation', () => {
  it('navigateMonth(1) advances to the next month', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-05-20'}),
    );

    act(() => {
      result.current.navigateMonth(1);
    });

    expect(result.current.baseMonth).toEqual({year: 2026, month: 6, day: 1});
    expect(result.current.monthYearLabel).toBe('June 2026');
  });

  it('navigateMonth(-1) from January rolls back into December of the previous year', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    act(() => {
      result.current.navigateMonth(-1);
    });

    expect(result.current.baseMonth).toEqual({year: 2025, month: 12, day: 1});
  });

  it('navigateMonth(1) from December rolls forward into January of the next year', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2025-12-10'}),
    );

    act(() => {
      result.current.navigateMonth(1);
    });

    expect(result.current.baseMonth).toEqual({year: 2026, month: 1, day: 1});
  });
});

// =============================================================================
// Controlled mode
// =============================================================================

describe('useCalendarNavigation — controlled mode', () => {
  it('reports the new month through the callback without moving itself', () => {
    const onFocusDateChange = vi.fn();
    const {result} = renderHook(() =>
      useCalendarNavigation({focusDate: '2026-05-20', onFocusDateChange}),
    );

    act(() => {
      result.current.navigateMonth(1);
    });

    expect(onFocusDateChange).toHaveBeenCalledTimes(1);
    expect(onFocusDateChange).toHaveBeenCalledWith('2026-06-01');
    // Controlled: the visible month only changes when the owner re-renders
    // with a new focusDate.
    expect(result.current.baseMonth).toEqual({year: 2026, month: 5, day: 1});
  });

  it('still records pendingFocus for keyboard navigation while controlled', () => {
    const onFocusDateChange = vi.fn();
    const {result} = renderHook(() =>
      useCalendarNavigation({focusDate: '2026-05-20', onFocusDateChange}),
    );

    act(() => {
      result.current.navigateMonth(1, '2026-05-31', 1);
    });

    expect(result.current.pendingFocus).toBe('2026-06-01');
    expect(onFocusDateChange).toHaveBeenCalledWith('2026-06-01');
    expect(result.current.baseMonth).toEqual({year: 2026, month: 5, day: 1});
  });
});

// =============================================================================
// Pending focus
// =============================================================================

describe('useCalendarNavigation — pending focus', () => {
  it('moves the pending focus by seven days when no offset is given (vertical default)', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    act(() => {
      result.current.navigateMonth(1, '2026-01-15');
    });

    expect(result.current.pendingFocus).toBe('2026-01-22');
  });

  it('moves the pending focus by delta*offset days across a month boundary', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    act(() => {
      result.current.navigateMonth(1, '2026-01-31', 1);
    });

    expect(result.current.pendingFocus).toBe('2026-02-01');
    expect(result.current.baseMonth).toEqual({year: 2026, month: 2, day: 1});
  });

  it('moves the pending focus backwards for a negative delta', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-03-10'}),
    );

    act(() => {
      result.current.navigateMonth(-1, '2026-03-01', 1);
    });

    expect(result.current.pendingFocus).toBe('2026-02-28');
  });

  it('carries the pending focus across a year boundary', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-12-15'}),
    );

    act(() => {
      result.current.navigateMonth(1, '2026-12-31', 1);
    });

    expect(result.current.pendingFocus).toBe('2027-01-01');
  });

  it('leaves pendingFocus null when navigating without a focused date', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    act(() => {
      result.current.navigateMonth(1);
    });

    expect(result.current.pendingFocus).toBeNull();
  });

  it('clearPendingFocus resets a recorded pending focus', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15'}),
    );

    act(() => {
      result.current.navigateMonth(1, '2026-01-15', 1);
    });
    expect(result.current.pendingFocus).toBe('2026-01-16');

    act(() => {
      result.current.clearPendingFocus();
    });
    expect(result.current.pendingFocus).toBeNull();
  });
});

// =============================================================================
// Multi-month view
// =============================================================================

describe('useCalendarNavigation — numberOfMonths=2', () => {
  it('renders two consecutive months and joins the label with an en dash', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-01-15', numberOfMonths: 2}),
    );

    expect(result.current.visibleMonths).toEqual([
      {year: 2026, month: 1, day: 1},
      {year: 2026, month: 2, day: 1},
    ]);
    expect(result.current.monthYearLabel).toBe('January 2026 – February 2026');
  });

  it('spans the year boundary in the two-month view', () => {
    const {result} = renderHook(() =>
      useCalendarNavigation({initialValue: '2026-12-15', numberOfMonths: 2}),
    );

    expect(result.current.visibleMonths).toEqual([
      {year: 2026, month: 12, day: 1},
      {year: 2027, month: 1, day: 1},
    ]);
    expect(result.current.monthYearLabel).toBe('December 2026 – January 2027');
  });
});
