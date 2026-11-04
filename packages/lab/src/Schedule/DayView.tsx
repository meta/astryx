// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DayView.tsx
 * @input Schedule context and day view options
 * @output Single-day time-grid schedule view factory
 * @position Concrete schedule view; exported as createScheduleDayView
 */

import {
  DATE_FORMAT_WITH_WEEKDAY,
  plainDateAddDays,
  plainDateFormat,
} from '@astryxdesign/core/utils';
import {enumerateDates, getScheduleRangeFromDates} from './dateMath';
import {useScheduleContext} from './context';
import {ScheduleMonthTitle, ScheduleFrame} from './shared';
import {TimeGridView} from './TimeGridView';
import {scheduleRangeToZonedDateTimeRange} from './zonedDateTime';
import type {
  ScheduleTimeGridViewOptions,
  PlainDate,
  ScheduleView,
  ScheduleViewComponentProps,
} from './types';

export type ScheduleDayViewOptions = ScheduleTimeGridViewOptions;

function ScheduleDayView({
  options,
}: ScheduleViewComponentProps<ScheduleDayViewOptions>) {
  const {events, date, focusDate, timezoneID, locale, range, isLoading} =
    useScheduleContext();
  const {minHour = 0, maxHour = 24, hourHeight = 100, renderPopover} = options;
  const rangeDate = date.toPlainDate();
  const days = enumerateDates(range.startDate, range.endDate);
  const titleLabel = plainDateFormat(
    rangeDate,
    DATE_FORMAT_WITH_WEEKDAY,
    locale,
  );

  return (
    <ScheduleFrame
      title={<ScheduleMonthTitle date={rangeDate} timezoneID={timezoneID} />}
      titleLabel={titleLabel}
      isLoading={isLoading}>
      <TimeGridView
        days={days}
        events={events}
        focusDate={focusDate.toPlainDate()}
        timezoneID={timezoneID}
        minHour={minHour}
        maxHour={maxHour}
        hourHeight={hourHeight}
        label={titleLabel}
        renderPopover={renderPopover}
      />
    </ScheduleFrame>
  );
}

export function createScheduleDayView({
  minHour = 0,
  maxHour = 24,
  hourHeight = 100,
  renderPopover,
}: ScheduleDayViewOptions = {}): ScheduleView<ScheduleDayViewOptions> {
  return {
    component: ScheduleDayView,
    options: {minHour, maxHour, hourHeight, renderPopover},
    getDateRange: date => {
      const range = getDayDateRange({
        date: date.toPlainDate(),
        timezoneID: date.timezoneID,
      });
      return scheduleRangeToZonedDateTimeRange(range, date.timezoneID);
    },
    getPreviousDateRange: date => {
      const range = getDayDateRange({
        date: plainDateAddDays(date.toPlainDate(), -1),
        timezoneID: date.timezoneID,
      });
      return {
        label: 'Previous day',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
    getNextDateRange: date => {
      const range = getDayDateRange({
        date: plainDateAddDays(date.toPlainDate(), 1),
        timezoneID: date.timezoneID,
      });
      return {
        label: 'Next day',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
  };
}

function getDayDateRange({
  date,
  timezoneID,
}: {
  date: PlainDate;
  timezoneID: string;
}) {
  return getScheduleRangeFromDates({
    startDate: date,
    endDate: plainDateAddDays(date, 1),
    timezoneID,
  });
}
