// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCalendarConstraints.test.ts
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for useCalendarConstraints hook
 * @position Testing; validates min/max inclusivity and custom constraint
 *   evaluation
 */

import {describe, it, expect, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useCalendarConstraints} from './useCalendarConstraints';

// =============================================================================
// Defaults
// =============================================================================

describe('useCalendarConstraints — defaults', () => {
  it('never disables a date when no options are given', () => {
    const {result} = renderHook(() => useCalendarConstraints({}));

    expect(result.current.isDateDisabled({year: 2026, month: 6, day: 15})).toBe(
      false,
    );
    expect(result.current.isDateDisabled({year: 1900, month: 1, day: 1})).toBe(
      false,
    );
    expect(result.current.minDate).toBeNull();
    expect(result.current.maxDate).toBeNull();
  });

  it('parses min and max ISO strings into PlainDates', () => {
    const {result} = renderHook(() =>
      useCalendarConstraints({min: '2026-01-05', max: '2026-11-30'}),
    );

    expect(result.current.minDate).toEqual({year: 2026, month: 1, day: 5});
    expect(result.current.maxDate).toEqual({year: 2026, month: 11, day: 30});
  });
});

// =============================================================================
// Min / max bounds (inclusive)
// =============================================================================

describe('useCalendarConstraints — min/max bounds', () => {
  it('treats min as inclusive: the min date itself is selectable', () => {
    const {result} = renderHook(() =>
      useCalendarConstraints({min: '2026-06-10'}),
    );
    const {isDateDisabled} = result.current;

    expect(isDateDisabled({year: 2026, month: 6, day: 9})).toBe(true);
    expect(isDateDisabled({year: 2026, month: 6, day: 10})).toBe(false);
    expect(isDateDisabled({year: 2026, month: 6, day: 11})).toBe(false);
    // Before-min comparison works across month and year boundaries.
    expect(isDateDisabled({year: 2025, month: 12, day: 31})).toBe(true);
  });

  it('treats max as inclusive: the max date itself is selectable', () => {
    const {result} = renderHook(() =>
      useCalendarConstraints({max: '2026-06-20'}),
    );
    const {isDateDisabled} = result.current;

    expect(isDateDisabled({year: 2026, month: 6, day: 20})).toBe(false);
    expect(isDateDisabled({year: 2026, month: 6, day: 21})).toBe(true);
    // After-max comparison works across year boundaries.
    expect(isDateDisabled({year: 2027, month: 1, day: 1})).toBe(true);
  });

  it('allows only dates inside a min+max window, edges included', () => {
    const {result} = renderHook(() =>
      useCalendarConstraints({min: '2026-06-10', max: '2026-06-20'}),
    );
    const {isDateDisabled} = result.current;

    expect(isDateDisabled({year: 2026, month: 6, day: 9})).toBe(true);
    expect(isDateDisabled({year: 2026, month: 6, day: 10})).toBe(false);
    expect(isDateDisabled({year: 2026, month: 6, day: 15})).toBe(false);
    expect(isDateDisabled({year: 2026, month: 6, day: 20})).toBe(false);
    expect(isDateDisabled({year: 2026, month: 6, day: 21})).toBe(true);
  });
});

// =============================================================================
// Custom constraints
// =============================================================================

describe('useCalendarConstraints — custom constraints', () => {
  it('disables a date when any single constraint returns false', () => {
    const {result: failsLast} = renderHook(() =>
      useCalendarConstraints({dateConstraints: [() => true, () => false]}),
    );
    const {result: failsFirst} = renderHook(() =>
      useCalendarConstraints({dateConstraints: [() => false, () => true]}),
    );

    expect(
      failsLast.current.isDateDisabled({year: 2026, month: 6, day: 15}),
    ).toBe(true);
    expect(
      failsFirst.current.isDateDisabled({year: 2026, month: 6, day: 15}),
    ).toBe(true);
  });

  it('enables a date only after every constraint passes', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const {result} = renderHook(() =>
      useCalendarConstraints({dateConstraints: [first, second]}),
    );

    expect(result.current.isDateDisabled({year: 2026, month: 6, day: 15})).toBe(
      false,
    );
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('passes the checked day to constraints as a native Date', () => {
    const constraint = vi.fn((_date: Date) => true);
    const {result} = renderHook(() =>
      useCalendarConstraints({dateConstraints: [constraint]}),
    );

    result.current.isDateDisabled({year: 2026, month: 6, day: 15});

    expect(constraint).toHaveBeenCalledTimes(1);
    const received = constraint.mock.calls[0][0];
    expect(received).toBeInstanceOf(Date);
    expect(received.getFullYear()).toBe(2026);
    expect(received.getMonth()).toBe(5); // native Date months are 0-based
    expect(received.getDate()).toBe(15);
  });

  it('supports day-of-week rules through the native Date conversion', () => {
    // No Sundays. 2026-02-01 is a Sunday; 2026-02-02 is a Monday.
    const {result} = renderHook(() =>
      useCalendarConstraints({
        dateConstraints: [date => date.getDay() !== 0],
      }),
    );

    expect(result.current.isDateDisabled({year: 2026, month: 2, day: 1})).toBe(
      true,
    );
    expect(result.current.isDateDisabled({year: 2026, month: 2, day: 2})).toBe(
      false,
    );
  });
});
