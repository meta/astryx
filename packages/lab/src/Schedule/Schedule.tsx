// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Schedule.tsx
 * @input Calendar events, event loader functions, view objects, date/focusDate/timezone props, and provider locale
 * @output Generic read-only schedule shell that renders arbitrary schedule views
 * @position Lab component shell; concrete views live in separate view files
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Schedule/index.ts
 * - /packages/lab/src/Schedule/Schedule.test.tsx
 * - /apps/storybook/stories/Schedule.stories.tsx
 */

import {Suspense, useCallback, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useLocale, type Locale} from '@astryxdesign/core/i18n';
import {mergeProps, plainDateFromInstant} from '@astryxdesign/core/utils';
import {eventOverlapsRange, getBrowserTimezoneID, sortEvents} from './dateMath';
import {ScheduleContext} from './context';
import {defaultSchedulePlugins} from './plugins';
import {styles} from './shared';
import {
  TimeGridScrollMemoryContext,
  type TimeGridScrollMemory,
} from './timeGridScrollMemory';
import {createZonedDateTime} from './zonedDateTime';
import {themeProps} from '@astryxdesign/core/utils';
import type {
  CalendarEvent,
  Instant,
  ScheduleRange,
  ScheduleCategory,
  ScheduleEventSource,
  SchedulePlugin,
  ScheduleView,
  ScheduleViewOptions,
  ZonedDateTime,
  ZonedDateTimeRange,
} from './types';

export interface ScheduleProps<
  Options extends ScheduleViewOptions = ScheduleViewOptions,
> extends BaseProps<HTMLDivElement> {
  /** View object returned by a `createSchedule*View()` factory. */
  view: ScheduleView<Options>;
  /** Static calendar events or an async loader called with the active Instant range. */
  events: ScheduleEventSource;
  /** Category definitions used to style and label events by their `category` value. */
  categories?: ReadonlyArray<ScheduleCategory>;
  /** Focused Instant used to choose the currently rendered range. */
  date: Instant;
  /** Instant highlighted as the user's focus/current date. Defaults to mount time. */
  focusDate?: Instant;
  /** Called by pagination plugins when the rendered range should change. */
  onChangeDate?: (date: Instant) => void;
  /** IANA timezone ID used for date math and localized rendering. Defaults to browser timezone. */
  timezoneID?: string;
  /** Header/rendering plugins. Defaults to pagination controls. */
  plugins?: ReadonlyArray<SchedulePlugin>;
  /** Heading level for sub-headings (day labels, weekday headers) within the schedule. @default 3 */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

interface EventRecord {
  status: 'pending' | 'fulfilled' | 'rejected';
  promise: Promise<void>;
  value: ReadonlyArray<CalendarEvent>;
  error: unknown;
}

const eventLoaderCache = new WeakMap<
  Exclude<ScheduleEventSource, ReadonlyArray<CalendarEvent>>,
  Map<string, EventRecord>
>();

function readAsyncEvents(
  loader: Exclude<ScheduleEventSource, ReadonlyArray<CalendarEvent>>,
  start: Instant,
  end: Instant,
): ReadonlyArray<CalendarEvent> {
  let loaderCache = eventLoaderCache.get(loader);
  if (loaderCache == null) {
    loaderCache = new Map();
    eventLoaderCache.set(loader, loaderCache);
  }

  const key = `${start}:${end}`;
  let record = loaderCache.get(key);
  if (record == null) {
    record = {
      status: 'pending',
      promise: Promise.resolve()
        .then(() => loader(start, end))
        .then(
          value => {
            if (record != null) {
              record.status = 'fulfilled';
              record.value = value;
            }
          },
          error => {
            if (record != null) {
              record.status = 'rejected';
              record.error = error;
            }
          },
        ),
      value: [],
      error: null,
    };
    loaderCache.set(key, record);
  }

  if (record.status === 'pending') {
    throw record.promise;
  }
  if (record.status === 'rejected') {
    throw record.error;
  }
  return record.value;
}

function resolveEvents(
  eventSource: ScheduleEventSource,
  range: ScheduleRange,
  timezoneID: string,
): ReadonlyArray<CalendarEvent> {
  const events =
    typeof eventSource === 'function'
      ? readAsyncEvents(eventSource, range.start, range.end)
      : eventSource;
  return sortEvents(
    events.filter(event => eventOverlapsRange(event, range, timezoneID)),
    timezoneID,
  );
}

function getRange<Options extends ScheduleViewOptions>(
  view: ScheduleView<Options>,
  date: ZonedDateTime,
): ScheduleRange {
  const [start, end] = view.getDateRange(date);
  return {
    start: start.instant,
    end: end.instant,
    startDate: plainDateFromInstant(start.instant, start.timezoneID),
    endDate: plainDateFromInstant(end.instant, end.timezoneID),
  };
}

function ScheduleViewContent<Options extends ScheduleViewOptions>({
  view,
  eventSource,
  categories,
  date,
  focusDate,
  locale,
  isLoading,
  onPreviousDate,
  previousDateLabel,
  onToday,
  onNextDate,
  nextDateLabel,
  plugins,
  headingLevel,
}: {
  view: ScheduleView<Options>;
  eventSource: ScheduleEventSource;
  categories: ReadonlyArray<ScheduleCategory>;
  date: ZonedDateTime;
  focusDate: ZonedDateTime;
  locale: Locale;
  isLoading: boolean;
  onPreviousDate: () => void;
  previousDateLabel: string;
  onToday: () => void;
  onNextDate: () => void;
  nextDateLabel: string;
  plugins: ReadonlyArray<SchedulePlugin>;
  headingLevel: 2 | 3 | 4 | 5 | 6;
}) {
  const Component = view.component;
  const range = getRange(view, date);
  const events = isLoading
    ? []
    : resolveEvents(eventSource, range, date.timezoneID);

  return (
    <ScheduleContext.Provider
      value={{
        events,
        categories,
        date,
        focusDate,
        timezoneID: date.timezoneID,
        locale,
        range,
        isLoading,
        onPreviousDate,
        previousDateLabel,
        onToday,
        onNextDate,
        nextDateLabel,
        view,
        plugins,
        headingLevel,
      }}>
      <Component options={view.options} />
    </ScheduleContext.Provider>
  );
}

export function Schedule({
  view,
  events,
  categories = [],
  date,
  focusDate: focusDateProp,
  onChangeDate,
  timezoneID: timezoneIDProp,
  plugins = defaultSchedulePlugins,
  headingLevel = 3,
  xstyle,
  className,
  style,
  ...rest
}: ScheduleProps) {
  const locale = useLocale();
  const timezoneID = timezoneIDProp ?? getBrowserTimezoneID();
  const [internalFocusDate] = useState<Instant>(() => Date.now() as Instant);
  const focusDate = focusDateProp ?? internalFocusDate;
  const zonedDateTime = useMemo(
    () => createZonedDateTime(date, timezoneID),
    [date, timezoneID],
  );
  const focusZonedDateTime = useMemo(
    () => createZonedDateTime(focusDate, timezoneID),
    [focusDate, timezoneID],
  );
  const updateDate = useCallback(
    (nextDate: Instant) => {
      onChangeDate?.(nextDate);
    },
    [onChangeDate],
  );
  const shiftToRange = useCallback(
    (nextRange: ZonedDateTimeRange) => {
      const currentRange = view.getDateRange(zonedDateTime);
      updateDate(
        (zonedDateTime.instant +
          nextRange[0].instant -
          currentRange[0].instant) as Instant,
      );
    },
    [updateDate, view, zonedDateTime],
  );
  const previousDateRange = useMemo(
    () => view.getPreviousDateRange(zonedDateTime),
    [view, zonedDateTime],
  );
  const nextDateRange = useMemo(
    () => view.getNextDateRange(zonedDateTime),
    [view, zonedDateTime],
  );
  const onPreviousDate = useCallback(() => {
    shiftToRange(previousDateRange.range);
  }, [previousDateRange, shiftToRange]);
  const onToday = useCallback(() => {
    updateDate(Date.now() as Instant);
  }, [updateDate]);
  const onNextDate = useCallback(() => {
    shiftToRange(nextDateRange.range);
  }, [nextDateRange, shiftToRange]);
  // Lives above the suspense boundary so the fallback's viewport and the
  // loaded content's viewport share one scroll record per rendered range.
  const timeGridScrollMemory = useRef<TimeGridScrollMemory>({
    key: null,
    offset: 0,
  });

  return (
    <div
      {...rest}
      {...mergeProps(
        themeProps('schedule'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}>
      <TimeGridScrollMemoryContext.Provider value={timeGridScrollMemory}>
        <Suspense
          fallback={
            <ScheduleViewContent
              view={view}
              eventSource={[]}
              categories={categories}
              date={zonedDateTime}
              focusDate={focusZonedDateTime}
              locale={locale}
              isLoading
              onPreviousDate={onPreviousDate}
              previousDateLabel={previousDateRange.label}
              onToday={onToday}
              onNextDate={onNextDate}
              nextDateLabel={nextDateRange.label}
              plugins={plugins}
              headingLevel={headingLevel}
            />
          }>
          <ScheduleViewContent
            view={view}
            eventSource={events}
            categories={categories}
            date={zonedDateTime}
            focusDate={focusZonedDateTime}
            locale={locale}
            isLoading={false}
            onPreviousDate={onPreviousDate}
            previousDateLabel={previousDateRange.label}
            onToday={onToday}
            onNextDate={onNextDate}
            nextDateLabel={nextDateRange.label}
            plugins={plugins}
            headingLevel={headingLevel}
          />
        </Suspense>
      </TimeGridScrollMemoryContext.Provider>
    </div>
  );
}
