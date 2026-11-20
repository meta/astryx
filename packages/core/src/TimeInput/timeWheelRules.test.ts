// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeWheelRules.test.ts
 * @input vitest, the time wheels' pure rules
 * @output Checks UIDatePicker's time-wheel rules as timeWheelRules.ts encodes
 *   them on columns that do not loop: the hour column's turn across
 *   11 ↔ 12, the bounds, and which columns turn with a change
 * @position Testing; the component around these rules is TimeWheels.test.tsx
 */

import {describe, expect, it} from 'vitest';
import {
  columnsToTurn,
  displayedTime,
  restingTime,
  hour12From24,
  hour24From12,
  hourAfterTurn,
  hourRows,
  hourRowsInHalf,
  meridiemRows,
  minuteRows,
  secondRows,
  turnColumn,
  wheelBounds,
  type TimeBounds,
  type TimeParts,
} from './timeWheelRules';
import type {ISOTimeString} from '../utils/timeParser';

const at = (hour: number, minute: number, second = 0): TimeParts => ({
  hour,
  minute,
  second,
});
const UNBOUNDED: TimeBounds = {min: null, max: null};
const NINE_TO_FIVE: TimeBounds = {min: 9 * 3600, max: 17 * 3600};

describe('displayedTime', () => {
  it('keeps the seconds when the picker shows them, and drops them when it does not', () => {
    expect(displayedTime(at(10, 45, 30), true)).toEqual(at(10, 45, 30));
    expect(displayedTime(at(10, 45, 30), false)).toEqual(at(10, 45));
  });

  it('shows a time outside the bounds as it is: opening never moves it', () => {
    expect(displayedTime(at(8, 50), false)).toEqual(at(8, 50));
  });
});

describe('the 12-hour clock', () => {
  it('converts 12 AM, 12 PM and 1 PM both ways', () => {
    expect([0, 12, 13].map(hour12From24)).toEqual([12, 12, 1]);
    expect(hour24From12(12, 0)).toBe(0);
    expect(hour24From12(12, 1)).toBe(12);
    expect(hour24From12(1, 1)).toBe(13);
  });
});

describe('the hour column', () => {
  it('turns AM to PM across 11 → 12 and back', () => {
    // UIKit: 11:58 AM, hour +1 → 12:58 PM.
    expect(hourAfterTurn(11, 12, '12h')).toBe(12);
    expect(hourAfterTurn(12, 11, '12h')).toBe(11);
    expect(hourAfterTurn(23, 12, '12h')).toBe(0);
    expect(hourAfterTurn(0, 11, '12h')).toBe(23);
  });

  it('keeps the half of the day for a move among 1 to 11', () => {
    expect(hourAfterTurn(13, 5, '12h')).toBe(17);
    expect(hourAfterTurn(13, 9, '12h')).toBe(21);
    expect(hourAfterTurn(10, 8, '12h')).toBe(8);
    expect(hourAfterTurn(11, 3, '12h')).toBe(3);
    expect(hourAfterTurn(15, 11, '12h')).toBe(23);
  });

  it('counts 12 as next to 1: a move between 12 and 1 to 6 keeps the half of the day', () => {
    expect(hourAfterTurn(12, 1, '12h')).toBe(13);
    expect(hourAfterTurn(13, 12, '12h')).toBe(12);
    expect(hourAfterTurn(12, 6, '12h')).toBe(18);
    expect(hourAfterTurn(18, 12, '12h')).toBe(12);
    expect(hourAfterTurn(0, 1, '12h')).toBe(1);
    expect(hourAfterTurn(1, 12, '12h')).toBe(0);
  });

  it('flips the half of the day for a move between 12 and 7 to 11, which passes between 11 and 12', () => {
    expect(hourAfterTurn(12, 7, '12h')).toBe(7);
    expect(hourAfterTurn(19, 12, '12h')).toBe(0);
    expect(hourAfterTurn(0, 9, '12h')).toBe(21);
    expect(hourAfterTurn(9, 12, '12h')).toBe(12);
  });

  it('is the hour itself in 24-hour time', () => {
    expect(hourAfterTurn(11, 23, '24h')).toBe(23);
  });

  it('labels 12-hour rows 1 to 12 and disables the hours a turn would make outside the bounds', () => {
    const rows = hourRows(11, '12h', NINE_TO_FIVE);
    expect(rows.map(row => row.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    // From 11 AM: 1 to 11 stay AM (1 to 8 AM are outside), and 12 is noon.
    expect(rows.filter(row => row.isDisabled).map(row => row.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
  });

  it('labels 24-hour rows 00 to 23', () => {
    const rows = hourRows(11, '24h', NINE_TO_FIVE);
    expect(rows[0].label).toBe('00');
    expect(rows[23].label).toBe('23');
    expect(rows[8].isDisabled).toBe(true);
    expect(rows[9].isDisabled).toBe(false);
    expect(rows[17].isDisabled).toBe(false);
    expect(rows[18].isDisabled).toBe(true);
  });
});

describe('the mouse columns', () => {
  it('keep a 12-hour row in the half of the day the time is in', () => {
    // From 10 AM, rows 1 to 8 and 12 stand for AM hours outside 9:00–17:00.
    const morning = hourRowsInHalf(10, '12h', NINE_TO_FIVE);
    expect(
      morning.filter(row => !row.isDisabled).map(row => row.label),
    ).toEqual(['9', '10', '11']);
    // From 2 PM, rows 12 and 1 to 5 stand for PM hours inside them.
    const afternoon = hourRowsInHalf(14, '12h', NINE_TO_FIVE);
    expect(
      afternoon.filter(row => !row.isDisabled).map(row => row.label),
    ).toEqual(['1', '2', '3', '4', '5', '12']);
  });

  it('order 12 PM before 1 PM, so keys follow the full time', () => {
    const afternoon = hourRowsInHalf(17, '12h', NINE_TO_FIVE);
    const order = (label: string) =>
      afternoon.find(row => row.label === label)?.order;
    expect(order('12')).toBe(12);
    expect(order('1')).toBe(13);
    expect(order('11')).toBe(23);
    const morning = hourRowsInHalf(9, '12h', NINE_TO_FIVE);
    expect(morning.find(row => row.label === '12')?.order).toBe(0);
    // Under a finger each row holds the hour a turn onto it makes.
    const fromNoon = hourRows(12, '12h', NINE_TO_FIVE);
    expect(fromNoon.find(row => row.label === '11')?.order).toBe(11);
    expect(fromNoon.find(row => row.label === '1')?.order).toBe(13);
  });

  it('match the finger rows in 24-hour time', () => {
    expect(hourRowsInHalf(11, '24h', NINE_TO_FIVE)).toEqual(
      hourRows(11, '24h', NINE_TO_FIVE),
    );
  });

  it('read the bounds from the field’s min and max', () => {
    expect(
      wheelBounds('09:00' as ISOTimeString, '17:00:30' as ISOTimeString),
    ).toEqual({
      min: 9 * 3600,
      max: 17 * 3600 + 30,
    });
    expect(wheelBounds(undefined, undefined)).toEqual(UNBOUNDED);
  });

  it('disable the seconds and the halves of the day outside the bounds', () => {
    const seconds = secondRows(
      17,
      0,
      wheelBounds('09:00' as ISOTimeString, '17:00:30' as ISOTimeString),
    );
    expect(seconds[30].isDisabled).toBe(false);
    expect(seconds[31].isDisabled).toBe(true);
    const halves = meridiemRows(
      {am: 'AM', pm: 'PM'},
      wheelBounds('13:00' as ISOTimeString, undefined),
    );
    expect(halves.map(row => row.isDisabled)).toEqual([true, false]);
  });
});

describe('the minute column', () => {
  it('shows every minute', () => {
    const rows = minuteRows(10, false, UNBOUNDED);
    expect(rows).toHaveLength(60);
    expect(rows[0].label).toBe('00');
    expect(rows[59].label).toBe('59');
  });

  it('changes only the minutes', () => {
    expect(turnColumn(at(12, 58), 'minute', 2, '12h')).toEqual(at(12, 2));
  });
});

describe('turnColumn', () => {
  it('moves the hour by twelve for an AM/PM turn', () => {
    expect(turnColumn(at(11, 30), 'meridiem', 1, '12h')).toEqual(at(23, 30));
    expect(turnColumn(at(23, 30), 'meridiem', 0, '12h')).toEqual(at(11, 30));
    expect(turnColumn(at(12, 0), 'meridiem', 0, '12h')).toEqual(at(0, 0));
  });
});

describe('restingTime (restPastBound)', () => {
  it('keeps a time inside the bounds', () => {
    expect(restingTime(at(12, 30), false, NINE_TO_FIVE)).toEqual(at(12, 30));
  });

  it('goes on past a bound to the bound', () => {
    expect(restingTime(at(7, 0), false, NINE_TO_FIVE)).toEqual(at(9, 0));
    expect(restingTime(at(18, 15), false, NINE_TO_FIVE)).toEqual(at(17, 0));
  });

  it('keeps a bound with seconds when the picker shows seconds, and the nearest whole minute inside it when it does not', () => {
    const min = {min: 9 * 3600 + 30, max: null};
    expect(restingTime(at(8, 0), true, min)).toEqual(at(9, 0, 30));
    expect(restingTime(at(8, 0), false, min)).toEqual(at(9, 1));
    const max = {min: null, max: 16 * 3600 + 55 * 60 + 30};
    expect(restingTime(at(17, 30), false, max)).toEqual(at(16, 55));
  });

  it('drops seconds the picker does not show before it clamps', () => {
    const min = {min: 10 * 3600 + 30, max: null};
    expect(restingTime(at(10, 0, 45), false, min)).toEqual(at(10, 1));
    expect(restingTime(at(12, 30, 45), false, NINE_TO_FIVE)).toEqual(
      at(12, 30),
    );
  });

  it('keeps the bound when no whole minute lies inside the bounds', () => {
    // A minimum inside the last minute of the day has no whole minute after it,
    // so no row of a picker without a seconds column answers within the bounds.
    // The bound itself does, and a rest goes on to it.
    const min = {min: 23 * 3600 + 59 * 60 + 30, max: null};
    expect(restingTime(at(12, 0), false, min)).toEqual(at(23, 59, 30));
  });
});

describe('columnsToTurn', () => {
  const twelveHour = {hourFormat: '12h', hasSeconds: false} as const;

  it('turns the AM/PM column after the hour crossed 11 → 12', () => {
    const from = at(11, 58);
    const committed = turnColumn(from, 'hour', 12, '12h');
    expect(columnsToTurn(from, 'hour', 12, committed, twelveHour)).toEqual([
      {column: 'meridiem', value: 1},
    ]);
  });

  it('turns nothing after a rest from 12 to 1, which keeps PM', () => {
    const from = at(12, 58);
    const committed = turnColumn(from, 'hour', 1, '12h');
    expect(committed).toEqual(at(13, 58));
    expect(columnsToTurn(from, 'hour', 1, committed, twelveHour)).toEqual([]);
  });

  it('turns nothing after a rest from 1 back to 12, which keeps PM', () => {
    const from = at(13, 58);
    const committed = turnColumn(from, 'hour', 12, '12h');
    expect(committed).toEqual(at(12, 58));
    expect(columnsToTurn(from, 'hour', 12, committed, twelveHour)).toEqual([]);
  });

  it('turns nothing for an hour that kept its half of the day', () => {
    const from = at(13, 58);
    const committed = turnColumn(from, 'hour', 2, '12h');
    expect(committed).toEqual(at(14, 58));
    expect(columnsToTurn(from, 'hour', 2, committed, twelveHour)).toEqual([]);
  });

  it('leaves the hour where it is for an AM/PM turn', () => {
    const from = at(11, 30);
    const committed = turnColumn(from, 'meridiem', 1, '12h');
    expect(columnsToTurn(from, 'meridiem', 1, committed, twelveHour)).toEqual(
      [],
    );
  });

  it('turns every column whose row a bound changed', () => {
    // 10:15 with the hour turned to 9 and a 9:30 minimum: the minutes turn to
    // 30.
    const bounds = {min: 9 * 3600 + 30 * 60, max: null};
    const from = at(10, 15);
    const committed = restingTime(
      turnColumn(from, 'hour', 9, '12h'),
      true,
      bounds,
    );
    expect(committed).toEqual(at(9, 30));
    expect(columnsToTurn(from, 'hour', 9, committed, twelveHour)).toEqual([
      {column: 'minute', value: 30},
    ]);
  });

  it('turns the hour and minutes onto the maximum after an AM/PM turn past it', () => {
    const from = at(11, 30);
    const committed = restingTime(
      turnColumn(from, 'meridiem', 1, '12h'),
      true,
      NINE_TO_FIVE,
    );
    expect(committed).toEqual(at(17, 0));
    expect(columnsToTurn(from, 'meridiem', 1, committed, twelveHour)).toEqual([
      {column: 'hour', value: 5},
      {column: 'minute', value: 0},
    ]);
  });
});
