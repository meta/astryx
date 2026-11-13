// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {plainDateFromISO, type ISODateString} from '@astryxdesign/core/utils';
import {createEventFromISO} from './CalendarEvent';
import {enumerateDates} from './dateMath';
import {layoutMonthEvents, type MonthLayout} from './monthLayout';
import type {CalendarEvent} from './types';

// component:Schedule FR15–FR16. One UTC week, Sunday May 10 to Saturday
// May 16, 2026: column 0 is Sunday and column 3 is Wednesday.
const TIMEZONE = 'UTC';
const WEEK = enumerateDates(
  plainDateFromISO('2026-05-10' as ISODateString),
  plainDateFromISO('2026-05-16' as ISODateString),
);
const TWO_WEEKS = enumerateDates(
  plainDateFromISO('2026-05-10' as ISODateString),
  plainDateFromISO('2026-05-23' as ISODateString),
);

function allDay(id: string, start: string, end: string): CalendarEvent {
  return createEventFromISO({id, title: id, start, end});
}

function timed(
  id: string,
  day: string,
  hour: number,
  title: string = id,
): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  return createEventFromISO({
    id,
    title,
    start: `${day}T${pad(hour)}:00:00.000Z`,
    end: `${day}T${pad(hour + 1)}:00:00.000Z`,
  });
}

/** Chips as `id@week:start-end/level`, in a stable order for comparison. */
function chipKeys(layout: MonthLayout): string[] {
  return layout.chips
    .map(
      chip =>
        `${chip.event.id}@${chip.week}:${chip.columnStart}-${chip.columnEnd}/${chip.level}`,
    )
    .sort();
}

function overflowKeys(layout: MonthLayout): string[] {
  return layout.overflow.map(day => `${day.dayIndex}+${day.count}`);
}

/** Every event of a day is painted on that day or counted there (FR16). */
function expectEveryEventPaintedOrCounted(
  layout: MonthLayout,
  events: ReadonlyArray<CalendarEvent>,
  days: typeof WEEK,
) {
  days.forEach((day, dayIndex) => {
    const week = Math.floor(dayIndex / 7);
    const column = dayIndex % 7;
    const onDay = events.filter(event => {
      const visible = layoutMonthEvents([event], days, TIMEZONE);
      return visible.chips.some(
        chip =>
          chip.week === week &&
          chip.columnStart <= column &&
          column <= chip.columnEnd,
      );
    });
    const painted = layout.chips.filter(
      chip =>
        chip.week === week &&
        chip.columnStart <= column &&
        column <= chip.columnEnd,
    ).length;
    const counted =
      layout.overflow.find(overflowDay => overflowDay.dayIndex === dayIndex)
        ?.count ?? 0;
    expect(painted + counted, `day ${dayIndex}`).toBe(onDay.length);
  });
}

// Wednesday holds five events: two of the three spans that cover it and three
// timed events of its own, which need levels one to five.
const BUSY_WEDNESDAY: CalendarEvent[] = [
  allDay('conference', '2026-05-10', '2026-05-13'),
  allDay('hack-week', '2026-05-10', '2026-05-12'),
  allDay('offsite', '2026-05-11', '2026-05-13'),
  timed('alpha', '2026-05-13', 9),
  timed('bravo', '2026-05-13', 11),
  timed('charlie', '2026-05-13', 14),
];

describe('layoutMonthEvents', () => {
  it('paints two chips and counts three on a day that needs five levels', () => {
    const layout = layoutMonthEvents(BUSY_WEDNESDAY, WEEK, TIMEZONE);
    expect(chipKeys(layout)).toEqual([
      'alpha@0:3-3/1',
      'conference@0:0-3/0',
      'hack-week@0:0-2/1',
      // The third-level span is painted on its other days only.
      'offsite@0:1-2/2',
    ]);
    expect(overflowKeys(layout)).toEqual(['3+3']);
    expect(layout.chips.every(chip => chip.level < 3)).toBe(true);
    expectEveryEventPaintedOrCounted(layout, BUSY_WEDNESDAY, WEEK);
  });

  it('paints a day with three levels whole and counts nothing', () => {
    const events = BUSY_WEDNESDAY.slice(0, 3);
    const layout = layoutMonthEvents(events, WEEK, TIMEZONE);
    expect(chipKeys(layout)).toEqual([
      'conference@0:0-3/0',
      'hack-week@0:0-2/1',
      'offsite@0:1-3/2',
    ]);
    expect(layout.overflow).toEqual([]);
  });

  it('counts by level, so an empty third level on a busy day still holds the count', () => {
    // Monday to Wednesday need four levels; Wednesday's third level is empty
    // because its span ended Tuesday.
    const events = [
      allDay('e1', '2026-05-10', '2026-05-13'),
      allDay('e2', '2026-05-10', '2026-05-13'),
      allDay('e3', '2026-05-10', '2026-05-12'),
      allDay('e4', '2026-05-11', '2026-05-13'),
    ];
    const layout = layoutMonthEvents(events, WEEK, TIMEZONE);
    expect(chipKeys(layout)).toEqual([
      'e1@0:0-3/0',
      'e2@0:0-3/1',
      'e3@0:0-0/2',
    ]);
    expect(overflowKeys(layout)).toEqual(['1+2', '2+2', '3+1']);
    expectEveryEventPaintedOrCounted(layout, events, WEEK);
  });

  it('gives the same layout for any input order', () => {
    const expected = layoutMonthEvents(BUSY_WEDNESDAY, WEEK, TIMEZONE);
    const orders = [
      [...BUSY_WEDNESDAY].reverse(),
      [
        BUSY_WEDNESDAY[3],
        BUSY_WEDNESDAY[0],
        BUSY_WEDNESDAY[5],
        BUSY_WEDNESDAY[2],
        BUSY_WEDNESDAY[4],
        BUSY_WEDNESDAY[1],
      ],
    ];
    for (const order of orders) {
      const layout = layoutMonthEvents(order, WEEK, TIMEZONE);
      expect(chipKeys(layout)).toEqual(chipKeys(expected));
      expect(overflowKeys(layout)).toEqual(overflowKeys(expected));
    }
  });

  it('paints the earliest events of a busy day, whatever their titles', () => {
    // Title order and start order disagree: Zulu is first by start time.
    const events = [
      ...BUSY_WEDNESDAY.slice(0, 3),
      timed('zulu', '2026-05-13', 8, 'Zulu standup'),
      timed('alpha-late', '2026-05-13', 16, 'Alpha retro'),
      timed('mike', '2026-05-13', 12, 'Mike lunch'),
    ];
    const layout = layoutMonthEvents(events, WEEK, TIMEZONE);
    expect(
      layout.chips
        .filter(chip => chip.week === 0 && chip.columnStart === 3)
        .map(chip => chip.event.id),
    ).toEqual(['zulu']);
    expect(overflowKeys(layout)).toEqual(['3+3']);
  });

  it('never hides a timed event that starts before a painted one on the same day', () => {
    // A seeded walk through many busy fortnights: on every day, each
    // single-day timed event behind "+N more" starts no earlier than every
    // single-day timed chip painted that day.
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 200; run += 1) {
      const events: CalendarEvent[] = [];
      const count = 4 + Math.floor(random() * 14);
      for (let index = 0; index < count; index += 1) {
        const startDay = 10 + Math.floor(random() * 14);
        const day = `2026-05-${String(startDay).padStart(2, '0')}`;
        if (random() < 0.3) {
          const endDay = Math.min(23, startDay + Math.floor(random() * 4));
          events.push(
            allDay(
              `span-${index}`,
              day,
              `2026-05-${String(endDay).padStart(2, '0')}`,
            ),
          );
        } else {
          events.push(
            timed(
              `timed-${index}`,
              day,
              Math.floor(random() * 23),
              `${String.fromCharCode(90 - index)} meeting`,
            ),
          );
        }
      }
      const layout = layoutMonthEvents(events, TWO_WEEKS, TIMEZONE);
      // The days each event covers, from its layout alone.
      const covered = new Map(
        events.map(event => [
          event.id,
          new Set(
            layoutMonthEvents([event], TWO_WEEKS, TIMEZONE).chips.flatMap(
              chip =>
                Array.from(
                  {length: chip.columnEnd - chip.columnStart + 1},
                  (_, offset) => chip.week * 7 + chip.columnStart + offset,
                ),
            ),
          ),
        ]),
      );
      TWO_WEEKS.forEach((_, dayIndex) => {
        const week = Math.floor(dayIndex / 7);
        const column = dayIndex % 7;
        const timedOnDay = events.filter(
          event =>
            typeof event.start === 'number' &&
            new Date(event.start).getUTCDate() === 10 + dayIndex,
        );
        const paintedIDs = new Set(
          layout.chips
            .filter(
              chip =>
                chip.week === week &&
                chip.columnStart <= column &&
                column <= chip.columnEnd,
            )
            .map(chip => chip.event.id),
        );
        // Every event of the day is painted or counted (FR16).
        const onDay = events.filter(event =>
          covered.get(event.id)?.has(dayIndex),
        ).length;
        const counted =
          layout.overflow.find(day => day.dayIndex === dayIndex)?.count ?? 0;
        expect(paintedIDs.size + counted, `run ${run}, day ${dayIndex}`).toBe(
          onDay,
        );
        const painted = timedOnDay.filter(event => paintedIDs.has(event.id));
        const hidden = timedOnDay.filter(event => !paintedIDs.has(event.id));
        const latestPainted = Math.max(
          ...painted.map(event => Number(event.start)),
        );
        for (const event of hidden) {
          expect(
            Number(event.start),
            `run ${run}, day ${dayIndex}: ${event.id} is hidden behind a later chip`,
          ).toBeGreaterThanOrEqual(latestPainted);
        }
      });
    }
  });

  it('orders identical events by id', () => {
    const events = [
      timed('pair-b', '2026-05-12', 9, 'Pair review'),
      timed('pair-a', '2026-05-12', 9, 'Pair review'),
    ];
    const layout = layoutMonthEvents(events, WEEK, TIMEZONE);
    expect(chipKeys(layout)).toEqual(['pair-a@0:2-2/0', 'pair-b@0:2-2/1']);
  });

  it('paints one chip per week a span covers', () => {
    const events = [allDay('sprint', '2026-05-14', '2026-05-19')];
    const layout = layoutMonthEvents(events, TWO_WEEKS, TIMEZONE);
    expect(chipKeys(layout)).toEqual(['sprint@0:4-6/0', 'sprint@1:0-2/0']);
  });

  it('lays out nothing for no events and leaves out events outside the range', () => {
    expect(layoutMonthEvents([], WEEK, TIMEZONE)).toEqual({
      chips: [],
      overflow: [],
    });
    const outside = [allDay('later', '2026-06-01', '2026-06-02')];
    expect(layoutMonthEvents(outside, WEEK, TIMEZONE)).toEqual({
      chips: [],
      overflow: [],
    });
  });
});
