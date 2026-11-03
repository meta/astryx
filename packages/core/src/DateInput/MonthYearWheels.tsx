// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MonthYearWheels.tsx
 * @input A calendar's month model, a month index, the reachable month bounds,
 *   a change callback
 * @output Exports MonthYearWheels — the month wheel of a calendar year and the
 *   year wheel with era labels
 * @position Internal component; consumed by TouchDateField.tsx
 *
 * The shortcut out of continuous scrolling. Scrolling is the right gesture for
 * "a month or two either way" and the wrong one for "December 2019", so the
 * header title opens this instead: two wheels, one flick each.
 *
 * It occupies exactly the same box as the month scroller, so opening it never
 * changes the picker's height.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/TouchDateField.tsx
 * - /packages/core/src/DateTimeInput/TouchDateTimeField.tsx
 * - /packages/core/src/DateInput/DateInput.doc.mjs
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useLocale} from '../i18n/useLocale';
import {
  calendarYearSpansEras,
  formatCalendarMonthName,
  formatCalendarYearLabel,
} from '../utils/calendarSystem';
import {spacingVars} from '../theme/tokens.stylex';
import {dateInputTouchGeometry} from './tokens.stylex';
import {Wheel, type WheelOption} from './Wheel';
import {clampIndex, type MonthModel} from './monthGeometry';

const styles = stylex.create({
  wheels: {
    display: 'flex',
    blockSize: dateInputTouchGeometry.paneBlockSize,
    gap: spacingVars['--spacing-2'],
  },
});

export interface MonthYearWheelsProps {
  /** The calendar's months, by index. */
  monthModel: MonthModel;
  /** The month the wheels currently show. */
  monthIndex: number;
  /** First reachable month. */
  minMonthIndex: number;
  /** Last reachable month. */
  maxMonthIndex: number;
  /** Fired when either wheel comes to rest on a new month. */
  onChange: (monthIndex: number) => void;
  /** Accessible name for the month wheel. */
  monthLabel: string;
  /** Accessible name for the year wheel. */
  yearLabel: string;
  /** False while the panel is hidden. */
  isActive?: boolean;
  /**
   * The day of the month the picker keeps, such as the selected date's. A year
   * that spans an era change is labeled with the era of this day in the
   * selected month. The first day of the month applies when it is absent.
   */
  keptDay?: number;
}

/**
 * Month and year wheels, bounded by the same range as the scroller.
 */
export function MonthYearWheels({
  monthModel,
  monthIndex,
  minMonthIndex,
  maxMonthIndex,
  onChange,
  monthLabel,
  yearLabel,
  isActive = true,
  keptDay = 1,
}: MonthYearWheelsProps) {
  const locale = useLocale();
  const {calendar} = monthModel;
  const {year, month} = monthModel.yearMonthAt(monthIndex);

  // Months outside the range stay on the wheel rather than vanishing: a list
  // whose length changed with the range would jump under the finger. Only the
  // calendar changes its length, for a year with a leap month.
  const monthOptions: WheelOption[] = useMemo(
    () =>
      Array.from({length: monthModel.monthsInYear(year)}, (_, index) => {
        const candidate = monthModel.indexOfYearMonth(year, index + 1);
        return {
          value: index + 1,
          label: formatCalendarMonthName(
            calendar,
            monthModel.monthAt(candidate),
            locale,
          ),
          isDisabled: candidate < minMonthIndex || candidate > maxMonthIndex,
        };
      }),
    [monthModel, calendar, year, locale, minMonthIndex, maxMonthIndex],
  );

  // Every listed year holds a reachable month: the list runs from the year of
  // the first reachable month to the year of the last.
  const years = useMemo(() => {
    const first = monthModel.yearMonthAt(minMonthIndex).year;
    const last = monthModel.yearMonthAt(maxMonthIndex).year;
    const result: {value: number; label: string; spansEras: boolean}[] = [];
    for (let candidate = first; candidate <= last; candidate++) {
      result.push({
        value: candidate,
        label: formatCalendarYearLabel(calendar, candidate, locale),
        spansEras: calendarYearSpansEras(calendar, candidate, locale),
      });
    }
    return result;
  }, [monthModel, calendar, locale, minMonthIndex, maxMonthIndex]);

  // A year that spans an era change names the era of the date the wheels
  // show, as the iOS date wheels do, so its row changes as the month turns.
  // Rows keep their size: the wheel columns share the width equally and every
  // row is one fixed height, whatever its label.
  const yearOptions: WheelOption[] = useMemo(
    () =>
      years.map(({value, label, spansEras}) => ({
        value,
        label: spansEras
          ? formatCalendarYearLabel(calendar, value, locale, {
              month,
              day: keptDay,
            })
          : label,
      })),
    [years, calendar, locale, month, keptDay],
  );

  return (
    <div {...stylex.props(styles.wheels)}>
      <Wheel
        label={monthLabel}
        options={monthOptions}
        value={month}
        isActive={isActive}
        onChange={nextMonth =>
          onChange(monthModel.indexOfYearMonth(year, nextMonth))
        }
      />
      <Wheel
        label={yearLabel}
        options={yearOptions}
        value={year}
        isActive={isActive}
        onChange={nextYear => {
          // The same month of the new year, or its common counterpart when
          // the new year lacks a leap month (Adar I becomes Adar). A year
          // change can still land outside the range; clamp to it.
          const candidate = monthModel.shiftYears(monthIndex, nextYear - year);
          onChange(clampIndex(candidate, minMonthIndex, maxMonthIndex));
        }}
      />
    </div>
  );
}

MonthYearWheels.displayName = 'MonthYearWheels';
