// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dateMath.ts
 * @input PlainDate records, Instant epoch milliseconds, IANA timezone IDs
 * @output Pure range, conversion, formatting, and event-overlap utilities
 * @position Shared schedule utility layer; consumed by Schedule and tests
 */

import {
  type PlainDate,
  plainDateAddDays,
  plainDateFromInstant,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateToInstant,
} from '@astryxdesign/core/utils';
import type {CalendarDayEvent, CalendarEvent} from './CalendarEvent';
import type {Instant, ScheduleRange} from './types';

export function getBrowserTimezoneID(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function isDayEvent(event: CalendarEvent): event is CalendarDayEvent {
  return typeof event.start !== 'number';
}

const ALL_DAY_SPAN_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the week and day views paint an event as a span in the all-day row:
 * a date-only event, or a timed event lasting 24 hours or more, measured on
 * its own instants (component:Schedule FR21).
 */
export function isAllDaySpan(event: CalendarEvent): boolean {
  return isDayEvent(event) || event.end - event.start >= ALL_DAY_SPAN_MS;
}

export function getScheduleRangeFromDates({
  startDate,
  endDate,
  timezoneID,
}: {
  startDate: PlainDate;
  endDate: PlainDate;
  timezoneID: string;
}): ScheduleRange {
  return {
    startDate,
    endDate,
    start: plainDateToInstant(startDate, timezoneID) as Instant,
    end: plainDateToInstant(endDate, timezoneID) as Instant,
  };
}

export function enumerateDates(start: PlainDate, endExclusive: PlainDate) {
  const dates: PlainDate[] = [];
  let current = start;
  while (plainDateIsBefore(current, endExclusive)) {
    dates.push(current);
    current = plainDateAddDays(current, 1);
  }
  return dates;
}

export function eventOverlapsRange(
  event: CalendarEvent,
  range: ScheduleRange,
  timezoneID: string,
): boolean {
  if (isDayEvent(event)) {
    const eventStart = plainDateToInstant(event.start, timezoneID) as Instant;
    const eventEnd = plainDateToInstant(
      plainDateAddDays(event.end, 1),
      timezoneID,
    ) as Instant;
    return eventStart < range.end && eventEnd > range.start;
  }
  return event.start < range.end && event.end > range.start;
}

export function eventOccursOnDate(
  event: CalendarEvent,
  date: PlainDate,
  timezoneID: string,
): boolean {
  if (isDayEvent(event)) {
    return (
      !plainDateIsAfter(event.start, date) &&
      !plainDateIsBefore(event.end, date)
    );
  }
  const startDate = plainDateFromInstant(event.start, timezoneID);
  const endDate = plainDateFromInstant(
    Math.max(event.end - 1, event.start),
    timezoneID,
  );
  return (
    !plainDateIsAfter(startDate, date) && !plainDateIsBefore(endDate, date)
  );
}

export function sortEvents(
  events: ReadonlyArray<CalendarEvent>,
  timezoneID: string,
): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aStart = getEventSortStart(a, timezoneID);
    const bStart = getEventSortStart(b, timezoneID);
    return aStart < bStart
      ? -1
      : aStart > bStart
        ? 1
        : a.title.localeCompare(b.title);
  });
}

function getEventSortStart(event: CalendarEvent, timezoneID: string): Instant {
  return isDayEvent(event)
    ? (plainDateToInstant(event.start, timezoneID) as Instant)
    : event.start;
}
