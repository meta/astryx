// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeWheelRules.ts
 * @input A time of day, the hour format and the bounds
 * @output Pure rules of UIDatePicker's time wheels: the columns' rows, the
 *   time a turned column makes, and which other columns turn with it
 * @position Internal helper of the TimeInput and DateTimeInput sheets: the
 *   rows of both their finger and their mouse wheels
 *
 * The columns do not loop. Each rule follows a leaf of motion/uikit/
 * datePicker.ts `wheels`. Pure functions keep the rules testable without a
 * layout engine.
 *
 * SYNC: When modified, update timeWheelRules.test.ts and TimeWheels.tsx.
 */

import {
  clampTime,
  formatISOTime,
  parseISOTime,
  type ISOTimeString,
} from '../utils/timeParser';

/** A time of day, 24-hour. */
export interface TimeParts {
  hour: number;
  minute: number;
  second: number;
}

/** A time wheel column. */
export type TimeColumn = 'hour' | 'minute' | 'second' | 'meridiem';

/** One row of a column: the value it stands for and its label. */
export interface TimeRow {
  value: number;
  label: string;
  isDisabled: boolean;
  /**
   * Where the row falls when a key steps the column. An hour row holds the hour
   * it stands for, so a key follows the full time: 12 PM comes before 1 PM.
   */
  order?: number;
}

/** Inclusive bounds in seconds since midnight; `null` is unbounded. */
export interface TimeBounds {
  min: number | null;
  max: number | null;
}

const SECONDS_PER_DAY = 24 * 3600;

function secondsOfISO(time: ISOTimeString | undefined): number | null {
  if (time == null) {
    return null;
  }
  const parsed = parseISOTime(time);
  return parsed == null
    ? null
    : parsed.hour * 3600 + parsed.minute * 60 + parsed.second;
}

/** The bounds of a field's `min` and `max` times. */
export function wheelBounds(
  min: ISOTimeString | undefined,
  max: ISOTimeString | undefined,
): TimeBounds {
  return {min: secondsOfISO(min), max: secondsOfISO(max)};
}

/** Whether the hour falls in the PM half (1) or the AM half (0). */
export function meridiemOf(hour: number): 0 | 1 {
  return hour < 12 ? 0 : 1;
}

/** The 12-hour clock's label for a 24-hour hour: 0 → 12, 13 → 1. */
export function hour12From24(hour: number): number {
  const h = hour % 12;
  return h === 0 ? 12 : h;
}

/** The 24-hour hour for a 12-hour hour in a half of the day: 12 AM → 0. */
export function hour24From12(hour: number, meridiem: number): number {
  return (hour % 12) + (meridiem === 1 ? 12 : 0);
}

function partsOf(seconds: number): TimeParts {
  const s = ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return {
    hour: Math.floor(s / 3600),
    minute: Math.floor((s % 3600) / 60),
    second: s % 60,
  };
}

/** Whether [start, end] (seconds) overlaps the bounds. */
function overlaps(start: number, end: number, bounds: TimeBounds): boolean {
  return (
    (bounds.min == null || end >= bounds.min) &&
    (bounds.max == null || start <= bounds.max)
  );
}

/**
 * The time the wheels show for `time`: its seconds kept when the picker has a
 * seconds column and dropped when it has none. A time outside the bounds is
 * shown as it is, on its disabled rows: opening the sheet never moves an
 * untouched value.
 */
export function displayedTime(time: TimeParts, hasSeconds: boolean): TimeParts {
  return {...time, second: hasSeconds ? time.second : 0};
}

/**
 * The time a column's rest commits when it would make `time`: the nearest
 * time inside the bounds that the columns have a row for. Past a bound, that
 * is the bound itself, or, with no seconds column, the nearest whole minute
 * inside it (a 16:55:30 maximum: 16:55). Inside the bounds, `time` itself.
 */
export function restingTime(
  time: TimeParts,
  hasSeconds: boolean,
  bounds: TimeBounds,
): TimeParts {
  const boundAt = (seconds: number | null) =>
    seconds == null ? undefined : formatISOTime(partsOf(seconds), true);
  const resting = clampTime(
    formatISOTime(time, hasSeconds),
    boundAt(bounds.min),
    boundAt(bounds.max),
    hasSeconds,
  );
  return parseISOTime(resting) ?? time;
}

/**
 * The hour the hour column makes when it comes to rest on `row` from the row
 * that showed `from` (24-hour). In 24-hour time the row is the hour. In 12-hour
 * time the half of the day changes only when the move passes between 11 and 12.
 * The column (1 … 12) does not loop, so 12 counts as next to 1. A move between
 * 12 and 1 to 6 keeps the half of the day. A move between 12 and 7 to 11
 * changes it.
 *
 * @example
 * ```
 * hourAfterTurn(11, 12, '12h'); // 12: 11 AM → 12 PM
 * hourAfterTurn(12, 1, '12h'); // 13: 12 PM → 1 PM
 * hourAfterTurn(13, 9, '12h'); // 21: 1 PM → 9 PM
 * ```
 */
export function hourAfterTurn(
  from: number,
  row: number,
  hourFormat: '12h' | '24h',
): number {
  if (hourFormat === '24h') {
    return row;
  }
  const shown = hour12From24(from);
  if (row === shown) {
    return from;
  }
  const half = meridiemOf(from);
  const passes11And12 =
    (shown === 12 && row >= 7) || (row === 12 && shown >= 7);
  return hour24From12(row, passes11And12 ? 1 - half : half);
}

function hourRowsFor(
  hourFormat: '12h' | '24h',
  hourOf: (row: number) => number,
  bounds: TimeBounds,
): TimeRow[] {
  const rows =
    hourFormat === '24h'
      ? Array.from({length: 24}, (_, hour) => hour)
      : Array.from({length: 12}, (_, index) => index + 1);
  return rows.map(row => {
    const hour = hourOf(row);
    return {
      value: row,
      label: hourFormat === '24h' ? String(row).padStart(2, '0') : String(row),
      isDisabled: !overlaps(hour * 3600, hour * 3600 + 3599, bounds),
      order: hour,
    };
  });
}

/**
 * The hour column under a finger. In 24-hour time its rows are 00 … 23. In
 * 12-hour time they are 1 … 12, each row standing for the hour a turn onto it
 * from `from` makes (`hourAfterTurn`). A row is disabled when no minute of that
 * hour is inside the bounds.
 */
export function hourRows(
  from: number,
  hourFormat: '12h' | '24h',
  bounds: TimeBounds,
): TimeRow[] {
  return hourRowsFor(
    hourFormat,
    row => hourAfterTurn(from, row, hourFormat),
    bounds,
  );
}

/**
 * The hour column under a mouse, whose columns turn one at a time. A 12-hour
 * row stands for its hour in the half of the day that `from` is in.
 */
export function hourRowsInHalf(
  from: number,
  hourFormat: '12h' | '24h',
  bounds: TimeBounds,
): TimeRow[] {
  const half = meridiemOf(from);
  return hourRowsFor(
    hourFormat,
    row => (hourFormat === '24h' ? row : hour24From12(row, half)),
    bounds,
  );
}

/**
 * The minute column for `hour`: every minute. A row is disabled when it is
 * outside the bounds (its whole minute, when the picker shows seconds).
 */
export function minuteRows(
  hour: number,
  hasSeconds: boolean,
  bounds: TimeBounds,
): TimeRow[] {
  return Array.from({length: 60}, (_, minute): TimeRow => {
    const start = hour * 3600 + minute * 60;
    return {
      value: minute,
      label: String(minute).padStart(2, '0'),
      isDisabled: !overlaps(start, start + (hasSeconds ? 59 : 0), bounds),
    };
  });
}

/** The second column for `hour`:`minute`. */
export function secondRows(
  hour: number,
  minute: number,
  bounds: TimeBounds,
): TimeRow[] {
  return Array.from({length: 60}, (_, second): TimeRow => {
    const at = hour * 3600 + minute * 60 + second;
    return {
      value: second,
      label: String(second).padStart(2, '0'),
      isDisabled: !overlaps(at, at, bounds),
    };
  });
}

/** The AM/PM column: a half is disabled when none of its hours is in bounds. */
export function meridiemRows(
  labels: {am: string; pm: string},
  bounds: TimeBounds,
): TimeRow[] {
  return [
    {
      value: 0,
      label: labels.am,
      isDisabled: !overlaps(0, 12 * 3600 - 1, bounds),
    },
    {
      value: 1,
      label: labels.pm,
      isDisabled: !overlaps(12 * 3600, SECONDS_PER_DAY - 1, bounds),
    },
  ];
}

/**
 * The time made by turning `column` to `value` (its row's value) from `from`
 * (the time the wheels show). Only that column changes, and the AM/PM column
 * moves the hour by twelve.
 */
export function turnColumn(
  from: TimeParts,
  column: TimeColumn,
  value: number,
  hourFormat: '12h' | '24h',
): TimeParts {
  switch (column) {
    case 'hour':
      return {...from, hour: hourAfterTurn(from.hour, value, hourFormat)};
    case 'minute':
      return {...from, minute: value};
    case 'second':
      return {...from, second: value};
    case 'meridiem':
      return {...from, hour: hour24From12(hour12From24(from.hour), value)};
  }
}

/** What a column shows for a time: its row's value. */
export function columnValue(
  time: TimeParts,
  column: TimeColumn,
  hourFormat: '12h' | '24h',
): number {
  switch (column) {
    case 'hour':
      return hourFormat === '24h' ? time.hour : hour12From24(time.hour);
    case 'minute':
      return time.minute;
    case 'second':
      return time.second;
    case 'meridiem':
      return meridiemOf(time.hour);
  }
}

/**
 * The columns that must turn after `column` came to rest on `value`. That is
 * every column whose row for the committed time differs from the row it shows
 * now. The column that moved shows `value`; the others show `from`. An hour
 * that crossed 11 ↔ 12 turns the AM/PM column; a time brought back onto a bound
 * turns every column whose row changed.
 */
export function columnsToTurn(
  from: TimeParts,
  column: TimeColumn,
  value: number,
  committed: TimeParts,
  options: {hourFormat: '12h' | '24h'; hasSeconds: boolean},
): {column: TimeColumn; value: number}[] {
  const columns: TimeColumn[] = ['hour', 'minute'];
  if (options.hasSeconds) {
    columns.push('second');
  }
  if (options.hourFormat === '12h') {
    columns.push('meridiem');
  }
  const turns: {column: TimeColumn; value: number}[] = [];
  for (const each of columns) {
    const shown =
      each === column ? value : columnValue(from, each, options.hourFormat);
    const target = columnValue(committed, each, options.hourFormat);
    if (shown !== target) {
      turns.push({column: each, value: target});
    }
  }
  return turns;
}
