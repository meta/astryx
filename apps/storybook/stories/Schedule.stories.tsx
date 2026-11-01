// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Text} from '@astryxdesign/core';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {
  Schedule,
  createScheduleDayView,
  createScheduleListView,
  createScheduleMonthlyView,
  createScheduleWeeklyView,
  createEventFromISO,
  type CalendarEvent,
  type Instant,
  type ScheduleCategory,
  type ScheduleViewSelectorOption,
  useSchedulePaginationPlugin,
  useScheduleViewSelectorPlugin,
} from '@astryxdesign/lab';

// The demo week is fixed and its events are built in the Schedule's own
// timezone, so every viewer, and CI's browser, sees the same week with its
// events on the 7-19 grid, whatever the viewer's own timezone or today's date.
const STORY_TIMEZONE = 'America/Los_Angeles';
// A Wednesday, in a week with no daylight-saving change.
const STORY_DATE = '2026-05-13';
const focusDate = Date.parse(dateTimeISO(STORY_DATE, 12)) as Instant;
const currentWeekStart = addDays(STORY_DATE, -3);
const storyNow = STORY_DATE;

const categories: ScheduleCategory[] = [
  {label: 'Company', color: 'blue'},
  {label: 'Design', color: 'purple'},
  {label: 'Launch', color: 'green'},
  {label: 'Focus', color: 'teal'},
  {label: 'Holiday', color: 'yellow'},
  {label: 'Retro', color: 'orange'},
  {label: 'Incident', color: 'red'},
  {label: 'Migration', color: 'pink'},
];

const events: CalendarEvent[] = [
  createEventFromISO({
    id: 'all-hands',
    title: 'Company all hands',
    category: 'Company',
    start: dateTimeISO(storyNow, 9),
    end: dateTimeISO(storyNow, 10),
  }),
  createEventFromISO({
    id: 'all-hands-previous-day',
    title: 'Company all hands',
    category: 'Company',
    start: dateTimeISO(addDays(storyNow, -1), 9),
    end: dateTimeISO(addDays(storyNow, -1), 10),
  }),
  createEventFromISO({
    id: 'all-hands-next-day',
    title: 'Company all hands',
    category: 'Company',
    start: dateTimeISO(addDays(storyNow, 1), 9),
    end: dateTimeISO(addDays(storyNow, 1), 10),
  }),
  createEventFromISO({
    id: 'design-review',
    title: 'Design review',
    category: 'Design',
    start: dateTimeISO(storyNow, 11),
    end: dateTimeISO(storyNow, 12, 30),
  }),
  createEventFromISO({
    id: 'launch',
    title: 'Launch window',
    category: 'Launch',
    start: dateISO(addDays(currentWeekStart, 3)),
    end: dateISO(addDays(currentWeekStart, 4)),
  }),
  createEventFromISO({
    id: 'focus-day',
    title: 'Focus day',
    category: 'Focus',
    start: dateISO(storyNow),
    end: dateISO(storyNow),
  }),
  createEventFromISO({
    id: 'company-holiday',
    title: 'Company holiday',
    category: 'Holiday',
    start: dateISO(addDays(currentWeekStart, 6)),
    end: dateISO(addDays(currentWeekStart, 6)),
  }),
  createEventFromISO({
    id: 'retro',
    title: 'Weekly retro',
    category: 'Retro',
    start: dateTimeISO(addDays(currentWeekStart, 5), 14),
    end: dateTimeISO(addDays(currentWeekStart, 5), 15),
  }),
  createEventFromISO({
    id: 'incident',
    title: 'Incident review',
    category: 'Incident',
    start: dateTimeISO(addDays(currentWeekStart, 1), 10, 30),
    end: dateTimeISO(addDays(currentWeekStart, 1), 11, 30),
  }),
  createEventFromISO({
    id: 'overnight-migration',
    title: 'Overnight migration',
    category: 'Migration',
    start: dateTimeISO(addDays(currentWeekStart, 5), 23, 30),
    end: dateTimeISO(addDays(currentWeekStart, 6), 2),
  }),
];

const meta: Meta<typeof Schedule> = {
  title: 'Lab/Schedule',
  component: Schedule,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div style={{padding: 24, minHeight: '100vh'}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Schedule>;

// Story dates are plain `YYYY-MM-DD` dates in STORY_TIMEZONE.
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function dateISO(date: string): string {
  return date;
}

// STORY_TIMEZONE's UTC offset on a date, as `-07:00`. Read at midday, so it
// is right for every demo hour (none sits in a daylight-saving gap).
function offsetOn(date: string): string {
  const name =
    new Intl.DateTimeFormat('en-US', {
      timeZone: STORY_TIMEZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(Date.parse(`${date}T12:00:00Z`))
      .find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = name.replace('GMT', '');
  return offset === '' ? 'Z' : offset;
}

// A wall-clock time on a story date in STORY_TIMEZONE, as an ISO instant.
function dateTimeISO(date: string, hour: number, minute: number = 0): string {
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return `${date}T${time}:00${offsetOn(date)}`;
}

// The STORY_TIMEZONE date an instant falls on.
function zonedDate(instant: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function makeSeededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function createAsyncEvents(start: Instant, end: Instant): CalendarEvent[] {
  const random = makeSeededRandom(Math.floor(start / 86400000));
  const asyncCategories = categories.slice(0, 6);
  const titles = [
    'Planning sync',
    'Design critique',
    'Customer review',
    'Metrics readout',
    'Launch check',
    'Office hours',
  ];
  const generatedEvents: CalendarEvent[] = [];

  for (let dayStart = start; dayStart < end; dayStart += 24 * 60 * 60 * 1000) {
    const eventCount = 1 + Math.floor(random() * 3);
    // Midday, so a 23- or 25-hour daylight-saving day still lands on its date.
    const day = zonedDate(dayStart + 12 * 60 * 60 * 1000);

    for (let index = 0; index < eventCount; index++) {
      const startHour = 8 + Math.floor(random() * 8);
      const startMinute = random() > 0.65 ? 30 : 0;
      const durationHours = 1 + Math.floor(random() * 2);
      const title = titles[Math.floor(random() * titles.length)];
      const category =
        asyncCategories[Math.floor(random() * asyncCategories.length)];
      generatedEvents.push(
        createEventFromISO({
          id: `${dayStart}:${index}`,
          title,
          category: category.label,
          start: dateTimeISO(day, startHour, startMinute),
          end: dateTimeISO(day, startHour + durationHours, startMinute),
        }),
      );
    }

    if (random() > 0.68) {
      generatedEvents.push(
        createEventFromISO({
          id: `${dayStart}:all-day`,
          title: 'Focus day',
          category:
            asyncCategories[Math.floor(random() * asyncCategories.length)]
              .label,
          start: dateISO(day),
          end: dateISO(day),
        }),
      );
    }
  }

  return generatedEvents;
}

export const Monthly: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(() => createScheduleMonthlyView(), []);

    return (
      <Schedule
        view={view}
        events={events}
        categories={categories}
        date={date}
        focusDate={focusDate}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
      />
    );
  },
};

export const Weekly: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(
      () => createScheduleWeeklyView({minHour: 7, maxHour: 19}),
      [],
    );

    return (
      <Schedule
        view={view}
        events={events}
        categories={categories}
        date={date}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
      />
    );
  },
};

export const WeeklyFixedHeight: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(
      () => createScheduleWeeklyView({minHour: 7, maxHour: 19}),
      [],
    );

    return (
      <div style={{height: 520}}>
        <Schedule
          view={view}
          events={events}
          categories={categories}
          date={date}
          onChangeDate={setDate}
          timezoneID={STORY_TIMEZONE}
          style={{height: '100%'}}
        />
      </div>
    );
  },
};

export const Day: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(() => createScheduleDayView(), []);

    return (
      <Schedule
        view={view}
        events={events}
        categories={categories}
        date={date}
        focusDate={focusDate}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
      />
    );
  },
};

export const List: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(() => createScheduleListView(), []);

    return (
      <Schedule
        view={view}
        events={events}
        categories={categories}
        date={date}
        focusDate={focusDate}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
      />
    );
  },
};

/**
 * The list in a right-to-left locale: its 24-hour time ranges read start
 * first, right to left.
 */
export const RightToLeftLocale: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(() => createScheduleListView(), []);

    return (
      <InternationalizationProvider locale="he-IL">
        <div dir="rtl">
          <Schedule
            view={view}
            events={events}
            categories={categories}
            date={date}
            focusDate={focusDate}
            onChangeDate={setDate}
            timezoneID={STORY_TIMEZONE}
          />
        </div>
      </InternationalizationProvider>
    );
  },
};

export const AsyncLoader: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(focusDate);
    const view = useMemo(
      () => createScheduleWeeklyView({minHour: 7, maxHour: 19}),
      [],
    );
    const loadEvents = async (
      start: Instant,
      end: Instant,
    ): Promise<CalendarEvent[]> => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return createAsyncEvents(start, end);
    };

    return (
      <Schedule
        view={view}
        events={loadEvents}
        categories={categories}
        date={date}
        focusDate={focusDate}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
      />
    );
  },
};

// A fixed week in UTC, so the overlap layout is identical on every machine and
// in CI. Each day exercises one overlap shape of the time grid.
const FIXTURE_TIMEZONE = 'UTC';
const FIXTURE_DATE = Date.UTC(2026, 4, 13, 12) as Instant;

function fixtureEvent({
  id,
  title,
  category,
  day,
  start,
  end,
}: {
  id: string;
  title: string;
  category: string;
  day: number;
  start: [hour: number, minute?: number];
  end: [hour: number, minute?: number];
}): CalendarEvent {
  const iso = ([hour, minute = 0]: [number, number?]) =>
    `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
  return createEventFromISO({
    id,
    title,
    category,
    start: iso(start),
    end: iso(end),
  });
}

const overlappingEvents: CalendarEvent[] = [
  // Monday: an exact tie — same title, same minutes, different ids.
  fixtureEvent({
    id: 'tie-a',
    title: 'Pair review',
    category: 'Design',
    day: 11,
    start: [9],
    end: [10],
  }),
  fixtureEvent({
    id: 'tie-b',
    title: 'Pair review',
    category: 'Design',
    day: 11,
    start: [9],
    end: [10],
  }),
  // Tuesday: three simultaneous events.
  fixtureEvent({
    id: 'trio-1',
    title: 'Interview loop 1',
    category: 'Company',
    day: 12,
    start: [13],
    end: [14],
  }),
  fixtureEvent({
    id: 'trio-2',
    title: 'Interview loop 2',
    category: 'Launch',
    day: 12,
    start: [13],
    end: [14],
  }),
  fixtureEvent({
    id: 'trio-3',
    title: 'Interview loop 3',
    category: 'Focus',
    day: 12,
    start: [13],
    end: [14],
  }),
  // Wednesday: five simultaneous events.
  fixtureEvent({
    id: 'quint-1',
    title: 'Office hours A',
    category: 'Company',
    day: 13,
    start: [10],
    end: [11],
  }),
  fixtureEvent({
    id: 'quint-2',
    title: 'Office hours B',
    category: 'Design',
    day: 13,
    start: [10],
    end: [11],
  }),
  fixtureEvent({
    id: 'quint-3',
    title: 'Office hours C',
    category: 'Launch',
    day: 13,
    start: [10],
    end: [11],
  }),
  fixtureEvent({
    id: 'quint-4',
    title: 'Office hours D',
    category: 'Focus',
    day: 13,
    start: [10],
    end: [11],
  }),
  fixtureEvent({
    id: 'quint-5',
    title: 'Office hours E',
    category: 'Retro',
    day: 13,
    start: [10],
    end: [11],
  }),
  // Thursday: a chain — the first and last do not overlap each other.
  fixtureEvent({
    id: 'chain-1',
    title: 'Standup',
    category: 'Company',
    day: 14,
    start: [9],
    end: [10],
  }),
  fixtureEvent({
    id: 'chain-2',
    title: 'Design sync',
    category: 'Design',
    day: 14,
    start: [9, 30],
    end: [10, 30],
  }),
  fixtureEvent({
    id: 'chain-3',
    title: 'Retro',
    category: 'Retro',
    day: 14,
    start: [10],
    end: [11],
  }),
  // Friday: containment plus the shortest block the grid draws.
  fixtureEvent({
    id: 'contain-long',
    title: 'Workshop',
    category: 'Launch',
    day: 15,
    start: [9],
    end: [12],
  }),
  fixtureEvent({
    id: 'contain-short',
    title: 'Coffee chat',
    category: 'Focus',
    day: 15,
    start: [10],
    end: [10, 30],
  }),
  fixtureEvent({
    id: 'quarter',
    title: 'Quick check-in',
    category: 'Company',
    day: 15,
    start: [14],
    end: [14, 15],
  }),
  // All-day spans that overlap each other.
  createEventFromISO({
    id: 'offsite',
    title: 'Offsite',
    category: 'Company',
    start: '2026-05-11',
    end: '2026-05-12',
  }),
  createEventFromISO({
    id: 'hack-week',
    title: 'Hack week',
    category: 'Launch',
    start: '2026-05-12',
    end: '2026-05-13',
  }),
];

export const OverlappingEvents: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const view = useMemo(
      () => createScheduleWeeklyView({minHour: 8, maxHour: 18}),
      [],
    );

    return (
      <Schedule
        view={view}
        events={overlappingEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};

/**
 * The week view owns a popover for its events: each event is a button that
 * opens the system's standard Popover with the content the story returns.
 * "Quick check-in" returns no content and stays read-only.
 */
export const EventPopover: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const view = useMemo(
      () =>
        createScheduleWeeklyView({
          minHour: 8,
          maxHour: 18,
          renderPopover: event =>
            event.id === 'quarter' ? null : (
              <div
                data-event-details={event.id}
                style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <Text type="label" weight="bold">
                  {event.title}
                </Text>
                <Text type="supporting" color="secondary">
                  {event.category ?? 'No category'} · {event.id}
                </Text>
              </div>
            ),
        }),
      [],
    );

    return (
      <Schedule
        view={view}
        events={overlappingEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};

// Two zones that spring forward from a negative offset at local midnight, so
// the first day of each week starts at 1:00 AM.
const SKIPPED_MIDNIGHT_ZONES = [
  {
    timezoneID: 'America/Santiago',
    date: Date.UTC(2026, 8, 6, 15) as Instant,
    firstHour: '2026-09-06T04:30:00.000Z',
  },
  {
    timezoneID: 'America/Havana',
    date: Date.UTC(2026, 2, 8, 15) as Instant,
    firstHour: '2026-03-08T05:30:00.000Z',
  },
];

function SkippedMidnightZone({
  timezoneID,
  date: initialDate,
  firstHour,
}: (typeof SKIPPED_MIDNIGHT_ZONES)[number]) {
  const [weekDate, setWeekDate] = useState<Instant>(initialDate);
  const [dayDate, setDayDate] = useState<Instant>(initialDate);
  const weekView = useMemo(
    () => createScheduleWeeklyView({minHour: 0, maxHour: 4}),
    [],
  );
  const dayView = useMemo(
    () => createScheduleDayView({minHour: 0, maxHour: 4}),
    [],
  );
  const zoneEvents = useMemo(
    () => [
      createEventFromISO({
        id: `${timezoneID}-first-hour`,
        title: 'First hour',
        category: 'Focus',
        start: firstHour,
        end: new Date(Date.parse(firstHour) + 60 * 60 * 1000).toISOString(),
      }),
    ],
    [timezoneID, firstHour],
  );
  return (
    <section
      aria-label={timezoneID}
      data-zone={timezoneID}
      style={{display: 'grid', gap: 8}}>
      <Text type="label" weight="bold">
        {timezoneID}
      </Text>
      <Schedule
        view={weekView}
        events={zoneEvents}
        categories={categories}
        date={weekDate}
        focusDate={initialDate}
        onChangeDate={setWeekDate}
        timezoneID={timezoneID}
      />
      <Schedule
        view={dayView}
        events={zoneEvents}
        categories={categories}
        date={dayDate}
        focusDate={initialDate}
        onChangeDate={setDayDate}
        timezoneID={timezoneID}
      />
    </section>
  );
}

/**
 * Weeks and days whose midnight daylight saving skips keep their own dates:
 * seven columns in the week, one in the day view.
 */
export const SkippedMidnight: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24}}>
      {SKIPPED_MIDNIGHT_ZONES.map(zone => (
        <SkippedMidnightZone key={zone.timezoneID} {...zone} />
      ))}
    </div>
  ),
};

const midnightEvents: CalendarEvent[] = [
  createEventFromISO({
    id: 'planning',
    title: 'Planning',
    category: 'Focus',
    start: '2026-05-13T17:00:00.000Z',
    end: '2026-05-13T18:00:00.000Z',
  }),
  createEventFromISO({
    id: 'late-sync',
    title: 'Late sync',
    category: 'Company',
    start: '2026-05-13T22:00:00.000Z',
    end: '2026-05-14T00:00:00.000Z',
  }),
  createEventFromISO({
    id: 'evening-review',
    title: 'Evening review',
    category: 'Design',
    start: '2026-05-14T20:00:00.000Z',
    end: '2026-05-15T00:00:00.000Z',
  }),
];

/**
 * Timed events that end exactly at midnight paint from their start to the
 * bottom of their day.
 */
export const EventEndingAtMidnight: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const view = useMemo(
      () => createScheduleWeeklyView({minHour: 16, maxHour: 24}),
      [],
    );

    return (
      <Schedule
        view={view}
        events={midnightEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};

// A fixed UTC month for the month view's overflow contract: Wednesday May 13
// needs five levels (a three-day span sits on its third) and Friday May 15
// needs four, so both trade their third level for "+N more"; the other days
// fit and paint every chip.
function monthFixtureEvent(
  id: string,
  title: string,
  category: string,
  day: number,
  hour: number,
): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  return createEventFromISO({
    id,
    title,
    category,
    start: `2026-05-${pad(day)}T${pad(hour)}:00:00.000Z`,
    end: `2026-05-${pad(day)}T${pad(hour + 1)}:00:00.000Z`,
  });
}

const busyMonthEvents: CalendarEvent[] = [
  createEventFromISO({
    id: 'conference',
    title: 'Design conference',
    category: 'Design',
    start: '2026-05-10',
    end: '2026-05-13',
  }),
  createEventFromISO({
    id: 'hack-week',
    title: 'Hack week',
    category: 'Launch',
    start: '2026-05-10',
    end: '2026-05-12',
  }),
  createEventFromISO({
    id: 'offsite',
    title: 'Team offsite',
    category: 'Company',
    start: '2026-05-11',
    end: '2026-05-13',
  }),
  monthFixtureEvent('standup', 'Standup', 'Company', 13, 9),
  monthFixtureEvent('incident-review', 'Incident review', 'Incident', 13, 11),
  monthFixtureEvent('launch-check', 'Launch check', 'Launch', 13, 14),
  monthFixtureEvent('planning', 'Planning', 'Company', 15, 9),
  monthFixtureEvent('critique', 'Design critique', 'Design', 15, 10),
  monthFixtureEvent('retro', 'Weekly retro', 'Retro', 15, 13),
  monthFixtureEvent('focus', 'Focus block', 'Focus', 15, 15),
  monthFixtureEvent('one-on-one', '1:1', 'Company', 5, 10),
  createEventFromISO({
    id: 'holiday',
    title: 'Company holiday',
    category: 'Holiday',
    start: '2026-05-25',
    end: '2026-05-25',
  }),
];

/**
 * A week row of the month paints at most three levels of chips. A busy day
 * shows two and a "+N more" button that opens a popover listing every event
 * of that day.
 */
// Test seam for the month-overflow browser contract: removes an event the way
// a data refresh would, while a day's popover stays open. The events live in
// one module-level store so the removal reaches every rendered copy of the
// story.
let monthOverflowEvents: ReadonlyArray<CalendarEvent> = busyMonthEvents;
const monthOverflowListeners = new Set<() => void>();

function subscribeToMonthOverflowEvents(listener: () => void): () => void {
  monthOverflowListeners.add(listener);
  return () => {
    monthOverflowListeners.delete(listener);
  };
}

function getMonthOverflowEvents(): ReadonlyArray<CalendarEvent> {
  return monthOverflowEvents;
}

function removeMonthOverflowEvent(id: string): void {
  monthOverflowEvents = monthOverflowEvents.filter(event => event.id !== id);
  monthOverflowListeners.forEach(listener => listener());
}

export const MonthOverflow: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const monthEvents = useSyncExternalStore(
      subscribeToMonthOverflowEvents,
      getMonthOverflowEvents,
      getMonthOverflowEvents,
    );
    const view = useMemo(() => createScheduleMonthlyView(), []);
    useEffect(() => {
      (
        window as unknown as {
          scheduleMonthOverflowStory?: {removeEvent: (id: string) => void};
        }
      ).scheduleMonthOverflowStory = {removeEvent: removeMonthOverflowEvent};
    }, []);

    return (
      <Schedule
        view={view}
        events={monthEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};

// The month-overflow fixture with renderPopover (component:Schedule FR19–
// FR20): chips with content open the month's one popover, the company
// holiday has none and stays static text, and a busy day's list hands an
// event to the same popover.
export const MonthEventPopover: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const monthEvents = useSyncExternalStore(
      subscribeToMonthOverflowEvents,
      getMonthOverflowEvents,
      getMonthOverflowEvents,
    );
    const view = useMemo(
      () =>
        createScheduleMonthlyView({
          renderPopover: event =>
            event.id === 'holiday' ? null : (
              <div
                data-event-details={event.id}
                style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <Text type="label" weight="bold">
                  {event.title}
                </Text>
                <Text type="supporting" color="secondary">
                  {event.category ?? 'No category'} · {event.id}
                </Text>
              </div>
            ),
        }),
      [],
    );
    useEffect(() => {
      (
        window as unknown as {
          scheduleMonthOverflowStory?: {removeEvent: (id: string) => void};
        }
      ).scheduleMonthOverflowStory = {removeEvent: removeMonthOverflowEvent};
    }, []);

    return (
      <Schedule
        view={view}
        events={monthEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};

export const ViewSelectorPlugin: Story = {
  render: () => {
    const views = useMemo(
      () => ({
        month: createScheduleMonthlyView(),
        week: createScheduleWeeklyView({minHour: 7, maxHour: 19}),
        day: createScheduleDayView({minHour: 8, maxHour: 18}),
        list: createScheduleListView(),
      }),
      [],
    );
    type StoryScheduleView = (typeof views)[keyof typeof views];
    const [view, setView] = useState<StoryScheduleView>(() => views.week);
    const [date, setDate] = useState<Instant>(focusDate);
    const viewOptions = useMemo<
      ReadonlyArray<ScheduleViewSelectorOption<StoryScheduleView>>
    >(
      () => [
        {view: views.month, label: 'Month'},
        {view: views.week, label: 'Week'},
        {view: views.day, label: 'Day'},
        {view: views.list, label: 'List'},
      ],
      [views],
    );
    const paginationPlugin = useSchedulePaginationPlugin();
    const viewSelectorPlugin = useScheduleViewSelectorPlugin(viewOptions, {
      onChangeView: setView,
    });
    const plugins = useMemo(
      () => [paginationPlugin, viewSelectorPlugin],
      [paginationPlugin, viewSelectorPlugin],
    );

    return (
      <Schedule
        view={view}
        events={events}
        categories={categories}
        date={date}
        focusDate={focusDate}
        onChangeDate={setDate}
        timezoneID={STORY_TIMEZONE}
        plugins={plugins}
      />
    );
  },
};

// A fixed UTC week for the long-span contract (component:Schedule FR21): a
// 48-hour offsite and an exactly-24-hour handoff are all-day spans; a
// 23-hour-59-minute shift and an overnight deploy stay in the day columns;
// Tuesday's standup and review keep their full column width; Saturday's
// retreat has too long a title for its times to fit.
const longSpanEvents: CalendarEvent[] = [
  createEventFromISO({
    id: 'offsite',
    title: 'Offsite',
    category: 'Company',
    start: '2026-05-11T09:00:00.000Z',
    end: '2026-05-13T09:00:00.000Z',
  }),
  createEventFromISO({
    id: 'handoff',
    title: 'On-call handoff',
    category: 'Incident',
    start: '2026-05-14T08:00:00.000Z',
    end: '2026-05-15T08:00:00.000Z',
  }),
  createEventFromISO({
    id: 'retreat',
    title: 'Leadership planning retreat',
    category: 'Company',
    start: '2026-05-16T06:00:00.000Z',
    end: '2026-05-17T06:00:00.000Z',
  }),
  createEventFromISO({
    id: 'shift',
    title: 'Long shift',
    category: 'Focus',
    start: '2026-05-15T00:00:00.000Z',
    end: '2026-05-15T23:59:00.000Z',
  }),
  createEventFromISO({
    id: 'deploy',
    title: 'Late deploy',
    category: 'Launch',
    start: '2026-05-12T22:00:00.000Z',
    end: '2026-05-13T02:00:00.000Z',
  }),
  fixtureEvent({
    id: 'standup',
    title: 'Standup',
    category: 'Company',
    day: 12,
    start: [9],
    end: [9, 30],
  }),
  fixtureEvent({
    id: 'review',
    title: 'Design review',
    category: 'Design',
    day: 12,
    start: [10],
    end: [11],
  }),
];

export const LongTimedEvents: Story = {
  render: () => {
    const [date, setDate] = useState<Instant>(FIXTURE_DATE);
    const view = useMemo(
      () =>
        createScheduleWeeklyView({
          renderPopover: event => (
            <Text type="label" weight="bold">
              {event.title}
            </Text>
          ),
        }),
      [],
    );

    return (
      <Schedule
        view={view}
        events={longSpanEvents}
        categories={categories}
        date={date}
        focusDate={FIXTURE_DATE}
        onChangeDate={setDate}
        timezoneID={FIXTURE_TIMEZONE}
      />
    );
  },
};
