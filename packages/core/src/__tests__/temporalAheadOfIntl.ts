// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file temporalAheadOfIntl.ts
 * @input The global Temporal, which a test sets with the full polyfill
 * @output withChineseTemporalAheadOfIntl — runs a callback with a Temporal
 *   whose `chinese` calendar starts a month one day before Intl does
 * @position Shared test helper for date labels where Intl and Temporal
 *   disagree on a month start of the Chinese or Dangi calendar
 */

interface TestPlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly daysInMonth: number;
  with(fields: {day: number}): TestPlainDate;
  add(duration: object): TestPlainDate;
  subtract(duration: object): TestPlainDate;
  withCalendar(calendar: string): TestPlainDate;
}

type TestPlainDateConstructor = new (
  isoYear: number,
  isoMonth: number,
  isoDay: number,
  calendar: string,
) => TestPlainDate;

/**
 * Runs `run` with a Temporal whose `chinese` calendar is one day ahead of
 * Intl's, as native Temporal is at some month starts. Intl calls 2027-02-06
 * the 30th day of the Twelfth Month; this Temporal calls it the first day of
 * the first month of the 2027 `chinese` year.
 */
export function withChineseTemporalAheadOfIntl<T>(run: () => T): T {
  const globals = globalThis as unknown as {
    Temporal: {PlainDate: TestPlainDateConstructor};
  };
  const real = globals.Temporal;
  const shift = (inner: TestPlainDate): TestPlainDate => ({
    year: inner.year,
    month: inner.month,
    day: inner.day,
    daysInMonth: inner.daysInMonth,
    with: fields => shift(inner.with(fields)),
    add: duration => shift(inner.add(duration)),
    subtract: duration => shift(inner.subtract(duration)),
    withCalendar: calendar => inner.withCalendar(calendar).subtract({days: 1}),
  });
  function PlainDate(y: number, m: number, d: number, calendar: string) {
    return calendar === 'chinese'
      ? shift(
          new real.PlainDate(y, m, d, 'iso8601')
            .add({days: 1})
            .withCalendar('chinese'),
        )
      : new real.PlainDate(y, m, d, calendar);
  }
  globals.Temporal = {
    PlainDate: PlainDate as unknown as TestPlainDateConstructor,
  };
  try {
    return run();
  } finally {
    globals.Temporal = real;
  }
}
