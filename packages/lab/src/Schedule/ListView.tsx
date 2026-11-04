// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListView.tsx
 * @input Schedule context and list view options
 * @output Event-list schedule view factory
 * @position Concrete schedule view; exported as createScheduleListView
 */

import * as stylex from '@stylexjs/stylex';
import {
  plainDateAddDays,
  plainDateFromInstant,
  plainDateIsEqual,
  plainDateToISO,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {Heading} from '@astryxdesign/core/Text';
import {
  enumerateDates,
  eventOccursOnDate,
  getScheduleRangeFromDates,
  isDayEvent,
} from './dateMath';
import {useScheduleContext} from './context';
import {
  formatDayNumber,
  formatFullDate,
  formatWeekday,
  formatWeekTitle,
  isEventInPast,
  ListEventRow,
  ScheduleFrame,
  ScheduleRangeMonthTitle,
  styles,
  useScheduleCalendar,
} from './shared';
import {useCurrentTime} from './useCurrentTime';
import {scheduleRangeToZonedDateTimeRange} from './zonedDateTime';
import type {
  CalendarEvent,
  Instant,
  ScheduleView,
  ScheduleViewComponentProps,
} from './types';

export interface ScheduleListViewOptions {
  days?: number;
}

function ScheduleListView(
  _props: ScheduleViewComponentProps<ScheduleListViewOptions>,
) {
  const {events, timezoneID, locale, range, isLoading, headingLevel} =
    useScheduleContext();
  const calendar = useScheduleCalendar();
  const days = enumerateDates(range.startDate, range.endDate);
  const currentTime = useCurrentTime();
  const currentPlainDate = plainDateFromInstant(currentTime, timezoneID);
  const endDate = plainDateAddDays(range.endDate, -1);
  const titleLabel = formatWeekTitle(
    range.startDate,
    endDate,
    timezoneID,
    locale,
    calendar,
  );
  const visibleDays = days
    .map(day => {
      const isCurrentDay = plainDateIsEqual(day, currentPlainDate);
      const isBaseDay = plainDateIsEqual(day, range.startDate);
      const dayEvents = events.filter(event =>
        eventOccursOnDate(event, day, timezoneID),
      );
      return {
        day,
        dayEvents,
        isCurrentDay,
        isVisible: dayEvents.length > 0 || isCurrentDay || isBaseDay,
      };
    })
    .filter(dayRecord => dayRecord.isVisible);

  return (
    <ScheduleFrame
      title={
        <ScheduleRangeMonthTitle
          start={range.startDate}
          end={endDate}
          timezoneID={timezoneID}
        />
      }
      titleLabel={titleLabel}
      isLoading={isLoading}>
      <div {...stylex.props(styles.list)}>
        {visibleDays.map(({day, dayEvents, isCurrentDay}, index) => (
          <section
            key={plainDateToISO(day)}
            {...stylex.props(
              styles.listDay,
              index === visibleDays.length - 1 && styles.listDayLast,
            )}>
            <ListDayHeading
              day={day}
              isCurrentDay={isCurrentDay}
              timezoneID={timezoneID}
              headingLevel={headingLevel}
            />
            <div {...stylex.props(styles.listEvents)}>
              {renderListRows({
                events: dayEvents,
                timezoneID,
                showCurrentTime: isCurrentDay && !isLoading,
                currentTime,
              })}
            </div>
          </section>
        ))}
      </div>
    </ScheduleFrame>
  );
}

function ListDayHeading({
  day,
  isCurrentDay,
  timezoneID,
  headingLevel,
}: {
  day: PlainDate;
  isCurrentDay: boolean;
  timezoneID: string;
  headingLevel: 2 | 3 | 4 | 5 | 6;
}) {
  const {locale} = useScheduleContext();
  const calendar = useScheduleCalendar();
  return (
    <Heading
      level={headingLevel}
      color="secondary"
      display="block"
      aria-label={formatFullDate(day, timezoneID, locale, calendar)}
      aria-current={isCurrentDay ? 'date' : undefined}
      xstyle={styles.listDayHeading}>
      <span
        {...stylex.props(
          styles.listDayNumber,
          isCurrentDay && styles.listDayNumberCurrent,
        )}>
        <span {...stylex.props(styles.listDayNumberText)}>
          {formatDayNumber(day, timezoneID, locale, calendar)}
        </span>
      </span>
      {formatWeekday(day, timezoneID, 'short', locale, calendar)}
    </Heading>
  );
}

function renderListRows({
  events,
  timezoneID,
  showCurrentTime,
  currentTime,
}: {
  events: ReadonlyArray<CalendarEvent>;
  timezoneID: string;
  showCurrentTime: boolean;
  currentTime: Instant;
}) {
  const rows = events.map(event => (
    <ListEventRow
      key={event.id}
      event={event}
      timezoneID={timezoneID}
      isPast={isEventInPast(event, currentTime, timezoneID)}
    />
  ));

  if (!showCurrentTime) {
    return rows;
  }

  const marker = (
    <div key="current-time" aria-hidden {...stylex.props(styles.listNowRow)} />
  );
  const insertIndex = events.findIndex(
    event => !isDayEvent(event) && event.start > currentTime,
  );
  if (insertIndex < 0) {
    return [...rows, marker];
  }
  return [...rows.slice(0, insertIndex), marker, ...rows.slice(insertIndex)];
}

export function createScheduleListView({
  days: listDays = 7,
}: ScheduleListViewOptions = {}): ScheduleView<ScheduleListViewOptions> {
  return {
    component: ScheduleListView,
    options: {days: listDays},
    getDateRange: date => {
      const range = getListDateRange({
        date: date.toPlainDate(),
        timezoneID: date.timezoneID,
        days: listDays,
      });
      return scheduleRangeToZonedDateTimeRange(range, date.timezoneID);
    },
    getPreviousDateRange: date => {
      const range = getListDateRange({
        date: plainDateAddDays(date.toPlainDate(), -listDays),
        timezoneID: date.timezoneID,
        days: listDays,
      });
      return {
        label: 'Previous list range',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
    getNextDateRange: date => {
      const range = getListDateRange({
        date: plainDateAddDays(date.toPlainDate(), listDays),
        timezoneID: date.timezoneID,
        days: listDays,
      });
      return {
        label: 'Next list range',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
  };
}

function getListDateRange({
  date,
  timezoneID,
  days,
}: {
  date: PlainDate;
  timezoneID: string;
  days: number;
}) {
  return getScheduleRangeFromDates({
    startDate: date,
    endDate: plainDateAddDays(date, days),
    timezoneID,
  });
}
