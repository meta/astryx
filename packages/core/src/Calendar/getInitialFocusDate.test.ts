// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getInitialFocusDate.test.ts
 * @input Uses vitest
 * @output Test suite for getInitialFocusDate
 * @position Tests for getInitialFocusDate.ts
 *
 * SYNC: When getInitialFocusDate.ts changes, update tests accordingly
 */

import {describe, it, expect} from 'vitest';
import {getInitialFocusDate} from './getInitialFocusDate';
import {plainDateFromISO, plainDateToISO} from '../utils/plainDate';

const TODAY = plainDateFromISO('2026-08-21');

function focusISO(options: Partial<Parameters<typeof getInitialFocusDate>[0]>) {
  const date = getInitialFocusDate({
    numberOfMonths: 1,
    today: TODAY,
    ...options,
  });
  return date == null ? null : plainDateToISO(date);
}

describe('getInitialFocusDate', () => {
  it('waits for today when there is no focus date or value', () => {
    expect(focusISO({today: null})).toBeNull();
    expect(focusISO({today: null, min: '2026-01-01'})).toBeNull();
  });

  it('opens on the focus date or the value while today is unknown', () => {
    expect(focusISO({today: null, focusDate: '2026-03-04'})).toBe('2026-03-04');
    expect(focusISO({today: null, value: '2026-05-06'})).toBe('2026-05-06');
  });

  it('opens on today when there are no bounds', () => {
    expect(focusISO({})).toBe('2026-08-21');
  });

  it('opens on today when today is inside the min/max window', () => {
    expect(focusISO({min: '2026-01-01', max: '2026-12-31'})).toBe('2026-08-21');
  });

  it('treats the bounds as inclusive', () => {
    expect(focusISO({min: '2026-08-21'})).toBe('2026-08-21');
    expect(focusISO({max: '2026-08-21'})).toBe('2026-08-21');
  });

  it('opens on min when the whole window is in the future', () => {
    expect(focusISO({min: '2027-03-04', max: '2027-06-30'})).toBe('2027-03-04');
  });

  it('opens on max when the whole window is in the past', () => {
    expect(focusISO({min: '2019-01-01', max: '2019-04-30'})).toBe('2019-04-01');
  });

  it('clamps against a one-sided min', () => {
    expect(focusISO({min: '2030-05-17'})).toBe('2030-05-17');
  });

  it('clamps against a one-sided max', () => {
    expect(focusISO({max: '2020-02-09'})).toBe('2020-02-01');
  });

  it('lands max in the last pane in the two-month layout', () => {
    // Opening on max's month would spend the second pane entirely
    // out of bounds, so the window's end sits on the right instead.
    expect(focusISO({max: '2020-02-09', numberOfMonths: 2})).toBe('2020-01-01');
  });

  it('does not shift the two-month layout back past min', () => {
    expect(
      focusISO({min: '2020-02-03', max: '2020-02-09', numberOfMonths: 2}),
    ).toBe('2020-02-03');
  });

  describe('two-month layout with max in the opening month (#9357)', () => {
    it('lands today in the last pane when max is today', () => {
      expect(focusISO({max: '2026-08-21', numberOfMonths: 2})).toBe(
        '2026-07-01',
      );
    });

    it('lands today in the last pane when max is later in the same month', () => {
      expect(focusISO({max: '2026-08-31', numberOfMonths: 2})).toBe(
        '2026-07-01',
      );
    });

    it('opens on today when max is in a later month', () => {
      expect(focusISO({max: '2026-09-01', numberOfMonths: 2})).toBe(
        '2026-08-21',
      );
    });

    it('leaves the one-month layout on today', () => {
      expect(focusISO({max: '2026-08-21'})).toBe('2026-08-21');
    });

    it('does not shift back past min', () => {
      expect(
        focusISO({min: '2026-08-03', max: '2026-08-21', numberOfMonths: 2}),
      ).toBe('2026-08-21');
    });

    it('shifts back when min is in the previous month', () => {
      expect(
        focusISO({min: '2026-07-15', max: '2026-08-21', numberOfMonths: 2}),
      ).toBe('2026-07-01');
    });

    it("lands a value in max's month in the last pane", () => {
      expect(
        focusISO({value: '2026-09-02', max: '2026-09-30', numberOfMonths: 2}),
      ).toBe('2026-08-01');
      expect(
        focusISO({
          value: {start: '2026-09-02', end: '2026-09-10'},
          max: '2026-09-30',
          numberOfMonths: 2,
        }),
      ).toBe('2026-08-01');
    });

    it('opens on a value in an earlier month', () => {
      expect(
        focusISO({value: '2026-08-02', max: '2026-09-30', numberOfMonths: 2}),
      ).toBe('2026-08-02');
    });

    it('still opens on a value past max', () => {
      expect(
        focusISO({value: '2031-07-04', max: '2026-09-30', numberOfMonths: 2}),
      ).toBe('2031-07-04');
    });

    it("still opens on an explicit focusDate in max's month", () => {
      expect(
        focusISO({
          focusDate: '2026-08-01',
          max: '2026-08-21',
          numberOfMonths: 2,
        }),
      ).toBe('2026-08-01');
    });

    it('crosses a year boundary', () => {
      expect(
        focusISO({
          today: plainDateFromISO('2027-01-05'),
          max: '2027-01-05',
          numberOfMonths: 2,
        }),
      ).toBe('2026-12-01');
    });
  });

  it('prefers the selected value over the bounds', () => {
    expect(focusISO({value: '2031-07-04', min: '2019-01-01'})).toBe(
      '2031-07-04',
    );
  });

  it('uses a range value start as the visible month', () => {
    expect(focusISO({value: {start: '2019-03-08', end: '2019-03-19'}})).toBe(
      '2019-03-08',
    );
  });

  it('prefers an explicit focusDate over everything else', () => {
    expect(
      focusISO({
        focusDate: '2015-11-02',
        value: '2031-07-04',
        min: '2026-01-01',
        max: '2026-12-31',
      }),
    ).toBe('2015-11-02');
  });

  it('prefers min when the bounds are inverted', () => {
    // Degenerate input (min after max) — resolve it deterministically
    // rather than reading the second bound off a contradiction.
    expect(focusISO({min: '2027-01-01', max: '2020-01-01'})).toBe('2027-01-01');
  });
});
