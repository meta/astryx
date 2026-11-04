// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file monthLayout.ts
 * @input The rendered range's events, its days (whole weeks), and the timezone
 * @output Month chip placements by week and level, cut around busy days, and
 *   each busy day's "+N more" count
 * @position Internal pure layout for MonthlyView (component:Schedule FR15–FR16,
 *   ORD4, PR4); no DOM reads, runs during render
 */

import {
  plainDateFromInstant,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateToInstant,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {isDayEvent} from './dateMath';
import type {CalendarEvent} from './types';

/** A week row paints at most this many levels of chips. */
export const MONTH_VISIBLE_LEVELS = 3;

const DAYS_PER_WEEK = 7;

/** One painted chip: an event's run of days on one level of one week row. */
export interface MonthChipPlacement {
  readonly event: CalendarEvent;
  readonly week: number;
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly level: number;
}

/** A day whose events need more levels than its week row paints. */
export interface MonthDayOverflow {
  readonly dayIndex: number;
  readonly week: number;
  readonly column: number;
  /** That day's events without a painted chip on that day. */
  readonly count: number;
}

export interface MonthLayout {
  readonly chips: ReadonlyArray<MonthChipPlacement>;
  readonly overflow: ReadonlyArray<MonthDayOverflow>;
}

interface RangedEvent {
  readonly event: CalendarEvent;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly isPriority: boolean;
  /** The event's start instant; a date-only event starts at its first midnight. */
  readonly start: number;
}

/**
 * Lays out the month: every event takes, in each week it covers, the lowest
 * level free on all its days there. A day with an event on level four or
 * higher gives its third level to "+N more", which counts that day's events on
 * level three or higher; a third-level chip that crosses such a day is painted
 * on its other days only. Every event of a day is therefore painted on that
 * day or counted there, and no chip sits below the third level.
 */
export function layoutMonthEvents(
  events: ReadonlyArray<CalendarEvent>,
  days: ReadonlyArray<PlainDate>,
  timezoneID: string,
): MonthLayout {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (firstDay == null || lastDay == null) {
    return {chips: [], overflow: []};
  }

  const ranged = events
    .flatMap((event): RangedEvent[] => {
      const [eventStart, eventEnd] = getEventDateSpan(event, timezoneID);
      if (
        plainDateIsBefore(eventEnd, firstDay) ||
        plainDateIsAfter(eventStart, lastDay)
      ) {
        return [];
      }
      const startIndex = days.findIndex(
        day => !plainDateIsBefore(day, eventStart),
      );
      let endIndex = days.length - 1;
      while (endIndex > 0 && plainDateIsAfter(days[endIndex], eventEnd)) {
        endIndex -= 1;
      }
      if (startIndex < 0 || endIndex < startIndex) {
        return [];
      }
      return [
        {
          event,
          startIndex,
          endIndex,
          isPriority: isDayEvent(event) || endIndex > startIndex,
          start: isDayEvent(event)
            ? plainDateToInstant(event.start, timezoneID)
            : event.start,
        },
      ];
    })
    .sort(compareRangedEvents);

  // Levels, per week, by the last column each level is occupied to. Events
  // arrive in first-day order, so each week sees its runs in start order and
  // a level whose last run ends before this run starts is free on every day
  // of it.
  const levelsByWeek: number[][] = [];
  const placements: MonthChipPlacement[] = [];
  for (const {event, startIndex, endIndex} of ranged) {
    const firstWeek = Math.floor(startIndex / DAYS_PER_WEEK);
    const lastWeek = Math.floor(endIndex / DAYS_PER_WEEK);
    for (let week = firstWeek; week <= lastWeek; week += 1) {
      const columnStart = week === firstWeek ? startIndex % DAYS_PER_WEEK : 0;
      const columnEnd =
        week === lastWeek ? endIndex % DAYS_PER_WEEK : DAYS_PER_WEEK - 1;
      const weekLevels = (levelsByWeek[week] ??= []);
      const freeLevel = weekLevels.findIndex(
        occupiedTo => occupiedTo < columnStart,
      );
      const level = freeLevel >= 0 ? freeLevel : weekLevels.length;
      weekLevels[level] = columnEnd;
      placements.push({event, week, columnStart, columnEnd, level});
    }
  }

  const lastPaintedLevel = MONTH_VISIBLE_LEVELS - 1;
  const isBusy = Array.from({length: days.length}, () => false);
  const countedOnDay = Array.from({length: days.length}, () => 0);
  for (const placement of placements) {
    forEachDay(placement, dayIndex => {
      if (placement.level > lastPaintedLevel) {
        isBusy[dayIndex] = true;
      }
      if (placement.level >= lastPaintedLevel) {
        countedOnDay[dayIndex] += 1;
      }
    });
  }

  const chips: MonthChipPlacement[] = [];
  for (const placement of placements) {
    if (placement.level < lastPaintedLevel) {
      chips.push(placement);
    } else if (placement.level === lastPaintedLevel) {
      // The third level belongs to "+N more" on a busy day, so the chip is
      // cut into the runs of days around it.
      let runStart: number | null = null;
      for (
        let column = placement.columnStart;
        column <= placement.columnEnd + 1;
        column += 1
      ) {
        const isFree =
          column <= placement.columnEnd &&
          !isBusy[placement.week * DAYS_PER_WEEK + column];
        if (isFree && runStart == null) {
          runStart = column;
        } else if (!isFree && runStart != null) {
          chips.push({
            ...placement,
            columnStart: runStart,
            columnEnd: column - 1,
          });
          runStart = null;
        }
      }
    }
  }

  const overflow: MonthDayOverflow[] = [];
  isBusy.forEach((busy, dayIndex) => {
    if (busy) {
      overflow.push({
        dayIndex,
        week: Math.floor(dayIndex / DAYS_PER_WEEK),
        column: dayIndex % DAYS_PER_WEEK,
        count: countedOnDay[dayIndex],
      });
    }
  });

  return {chips, overflow};
}

/**
 * First day, then all-day and multi-day events before single-day timed ones,
 * then events covering more days, then earlier starts, then title, then id.
 * The layout depends on the data alone, never on input order, and a busy day
 * paints its earliest events.
 */
function compareRangedEvents(a: RangedEvent, b: RangedEvent): number {
  if (a.startIndex !== b.startIndex) {
    return a.startIndex - b.startIndex;
  }
  if (a.isPriority !== b.isPriority) {
    return a.isPriority ? -1 : 1;
  }
  const durationDifference =
    b.endIndex - b.startIndex - (a.endIndex - a.startIndex);
  if (durationDifference !== 0) {
    return durationDifference;
  }
  if (a.start !== b.start) {
    return a.start - b.start;
  }
  const titleOrder = a.event.title.localeCompare(b.event.title);
  if (titleOrder !== 0) {
    return titleOrder;
  }
  return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
}

function forEachDay(
  placement: MonthChipPlacement,
  visit: (dayIndex: number) => void,
): void {
  for (
    let column = placement.columnStart;
    column <= placement.columnEnd;
    column += 1
  ) {
    visit(placement.week * DAYS_PER_WEEK + column);
  }
}

/** The calendar days an event covers in the schedule's timezone. */
export function getEventDateSpan(
  event: CalendarEvent,
  timezoneID: string,
): [PlainDate, PlainDate] {
  if (isDayEvent(event)) {
    return [event.start, event.end];
  }
  return [
    plainDateFromInstant(event.start, timezoneID),
    plainDateFromInstant(Math.max(event.end - 1, event.start), timezoneID),
  ];
}
