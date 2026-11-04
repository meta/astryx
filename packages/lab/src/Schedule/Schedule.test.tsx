// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {useMemo, useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {createEventFromISO} from './CalendarEvent';
import {Schedule} from './Schedule';
import {createScheduleDayView} from './DayView';
import {createScheduleListView} from './ListView';
import {createScheduleMonthlyView} from './MonthlyView';
import {createScheduleWeeklyView} from './WeeklyView';
import {sortEvents} from './dateMath';
import {formatWithPlainDate} from './shared';
import {useScheduleViewSelectorPlugin} from './plugins/ViewSelectorPlugin';
import type {
  CalendarEvent,
  Instant,
  ScheduleCategory,
  SchedulePlugin,
} from './types';

describe('createEventFromISO', () => {
  it('creates all-day PlainDate events from date-only ISO strings', () => {
    const event = createEventFromISO({
      id: 'planning',
      title: 'Planning offsite',
      category: 'Planning',
      start: '2026-05-13',
      end: '2026-05-14',
    });

    expect(event).toEqual({
      id: 'planning',
      title: 'Planning offsite',
      category: 'Planning',
      start: {year: 2026, month: 5, day: 13},
      end: {year: 2026, month: 5, day: 14},
    });
  });

  it('creates instant events from date-time ISO strings', () => {
    const event = createEventFromISO({
      id: 'standup',
      title: 'Standup',
      start: '2026-05-13T16:00:00.000Z',
      end: '2026-05-13T16:30:00.000Z',
    });

    expect(typeof event.start).toBe('number');
    expect(event.start).toBe(Date.parse('2026-05-13T16:00:00.000Z'));
  });
});

describe('Schedule date formatting', () => {
  it('keeps Gregorian fields when options request another calendar', () => {
    expect(
      formatWithPlainDate(
        {year: 2026, month: 8, day: 22},
        'UTC',
        {
          year: 'numeric',
          calendar: 'buddhist',
        },
        'en',
      ),
    ).toBe('2026');
  });

  it('formats Gregorian dates with the requested locale', () => {
    const date = {year: 2026, month: 8, day: 22};
    expect(
      formatWithPlainDate(
        date,
        'UTC',
        {month: 'long', year: 'numeric'},
        'th-TH',
      ),
    ).toBe(
      new Intl.DateTimeFormat('th-TH', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
        calendar: 'gregory',
      }).format(new Date(Date.UTC(2026, 7, 22, 12))),
    );
  });
});

describe('Schedule', () => {
  const categories: ScheduleCategory[] = [
    {label: 'Sync', color: 'blue'},
    {label: 'Design', color: 'purple'},
    {label: 'Blocked', color: 'red'},
    {label: 'Migration', color: 'pink'},
  ];
  const events: CalendarEvent[] = [
    createEventFromISO({
      id: 'visible',
      title: 'Visible sync',
      category: 'Sync',
      start: '2026-05-13T16:00:00.000Z',
      end: '2026-05-13T16:30:00.000Z',
    }),
    createEventFromISO({
      id: 'all-day',
      title: 'Design review',
      category: 'Design',
      start: '2026-05-13',
      end: '2026-05-13',
    }),
    createEventFromISO({
      id: 'outside',
      title: 'Outside range',
      category: 'Blocked',
      start: '2026-08-13',
      end: '2026-08-13',
    }),
  ];

  it('filters array events to the active view range', async () => {
    render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Visible sync')).toBeInTheDocument();
    });
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.queryByText('Outside range')).not.toBeInTheDocument();
  });

  it('renders monthly dates and times with the provider locale', async () => {
    render(
      <InternationalizationProvider locale="fr-FR">
        <Schedule
          view={createScheduleMonthlyView()}
          events={events}
          categories={categories}
          date={Date.UTC(2026, 4, 13)}
          focusDate={Date.UTC(2026, 4, 13)}
          timezoneID="UTC"
        />
      </InternationalizationProvider>,
    );

    expect(screen.getByRole('heading', {name: 'mai 2026'})).toBeInTheDocument();
    expect(screen.getByRole('table', {name: 'mai 2026'})).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'mercredi'}),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Visible sync, Sync, 16:00 - 16:30'),
    ).toBeInTheDocument();
  });

  it('leads each month chip with the title and gives an all-day chip no time', () => {
    // component:Schedule FR18: whether the time fits is layout, which jsdom
    // cannot measure; the order of title and time is checkable here.
    render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    const chipText = (title: string) =>
      Array.from(document.querySelectorAll('[aria-hidden="true"] span')).find(
        chip =>
          chip.parentElement?.closest('span') == null &&
          chip.textContent?.includes(title),
      )?.textContent ?? null;
    expect(chipText('Visible sync')).toBe('Visible sync4:00 PM');
    expect(chipText('Design review')).toBe('Design review');
  });

  it('renders monthly weekday headings at the configured headingLevel (default 3)', async () => {
    render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Visible sync')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', {level: 3}).length).toBeGreaterThan(
      0,
    );
  });

  it('renders list day headings at the configured headingLevel (default 3)', async () => {
    render(
      <Schedule
        view={createScheduleListView({days: 7})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Visible sync')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', {level: 3}).length).toBeGreaterThan(
      0,
    );
  });

  it('loads async events with Instant range boundaries', async () => {
    const loader = vi.fn(
      async (_start: Instant, _end: Instant) =>
        [
          createEventFromISO({
            id: 'async',
            title: 'Loaded event',
            start: '2026-05-13T17:00:00.000Z',
            end: '2026-05-13T18:00:00.000Z',
          }),
        ] as CalendarEvent[],
    );

    render(
      <Schedule
        view={createScheduleDayView()}
        events={loader}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    const [start, end] = loader.mock.calls[0];
    expect(typeof start).toBe('number');
    expect(typeof end).toBe('number');
    expect(start).toBe(Date.UTC(2026, 4, 13));
    expect(end).toBe(Date.UTC(2026, 4, 14));
    expect(await screen.findByText('Loaded event')).toBeInTheDocument();
  });

  it('renders list view grouped by localized day', async () => {
    const listEvents = [
      ...events,
      createEventFromISO({
        id: 'overnight',
        title: 'Overnight migration',
        category: 'Migration',
        start: '2026-05-13T23:00:00.000Z',
        end: '2026-05-14T02:00:00.000Z',
      }),
    ];

    render(
      <Schedule
        view={createScheduleListView({days: 7})}
        events={listEvents}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Wed')).toBeInTheDocument();
    });
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('Visible sync')).toBeInTheDocument();
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.getAllByText('11:00 PM - 2:00 AM')).toHaveLength(2);
  });

  it('isolates each painted time in the locale direction, whatever the layout direction', async () => {
    const renderList = (locale: string) =>
      render(
        <InternationalizationProvider locale={locale} dir="rtl">
          <div dir="rtl">
            <Schedule
              view={createScheduleListView({days: 7})}
              events={events}
              categories={categories}
              date={Date.UTC(2026, 4, 13)}
              timezoneID="UTC"
            />
          </div>
        </InternationalizationProvider>,
      );
    const timesOf = async () => {
      await waitFor(() => {
        expect(screen.getByText('Visible sync')).toBeInTheDocument();
      });
      return Array.from(document.querySelectorAll('bdi')).map(time => [
        time.textContent,
        time.getAttribute('dir'),
      ]);
    };

    const english = renderList('en-US');
    expect(await timesOf()).toEqual([
      ['All day', 'ltr'],
      ['4:00 PM - 4:30 PM', 'ltr'],
    ]);
    english.unmount();

    // A right-to-left locale keeps its 24-hour range start first.
    renderList('he-IL');
    const hebrew = await timesOf();
    expect(hebrew.map(([, dir]) => dir)).toEqual(['rtl', 'rtl']);
    expect(hebrew[1][0]).toMatch(/^16:00\s?-\s?16:30$/u);
  });

  it('renders weekly view with the same month title as monthly view', () => {
    render(
      <Schedule
        view={createScheduleWeeklyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(screen.getByRole('region', {name: 'May 2026'})).toBeInTheDocument();
  });

  it('exposes the month view as a table with week row headers and date-named cells', () => {
    render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    // component:Schedule AR7: a table, not an interactive grid.
    const table = screen.getByRole('table', {name: 'May 2026'});
    expect(table).not.toHaveAttribute('aria-readonly');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(
      screen.getAllByRole('columnheader').map(header => header.textContent),
    ).toEqual(['Week', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(
      screen.getByRole('columnheader', {name: 'Wednesday'}),
    ).toHaveAttribute('aria-colindex', '5');
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(6);
    expect(rowHeaders[2].textContent).toMatch(/^May 10\s*–\s*16, 2026$/);
    expect(screen.getAllByRole('row')).toHaveLength(7);
    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(row.querySelectorAll('[role="rowheader"]')).toHaveLength(1);
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(7);
    }
    expect(
      screen.getByRole('cell', {name: 'Wednesday, May 13, 2026'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('cell', {name: 'Wednesday, May 13, 2026'}),
    ).toHaveAttribute('aria-current', 'date');
    expect(
      screen.getByText('Visible sync, Sync, 4:00 PM - 4:30 PM'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Design review, Design, all day'),
    ).toBeInTheDocument();
  });

  it('makes the scrollable month table keyboard-focusable', () => {
    // The month table is a horizontal scroll container that may hold no
    // focusable descendants, so it needs tabindex="0" itself for
    // scrollable-region-focusable to pass and for keyboard scrolling.
    render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(screen.getByRole('table', {name: 'May 2026'})).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('exposes time grid views as ARIA grids', () => {
    render(
      <Schedule
        view={createScheduleDayView({minHour: 8, maxHour: 10})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(
      screen.getByRole('grid', {name: 'Schedule time grid'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'Wednesday, May 13, 2026'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'Wednesday, May 13, 2026'}),
    ).toHaveAttribute('aria-colindex', '2');
    expect(
      screen.getByRole('columnheader', {name: 'Wednesday, May 13, 2026'}),
    ).toHaveAttribute('aria-current', 'date');
    expect(
      screen.getByRole('gridcell', {
        name: 'Wednesday, May 13, 2026 all day. Design review, Design, all day',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', {name: 'Wednesday, May 13, 2026 8 AM'}),
    ).toBeInTheDocument();
  });

  it('exposes timed events in the accessible time grid cells', () => {
    render(
      <Schedule
        view={createScheduleDayView({minHour: 16, maxHour: 17})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(
      screen.getByRole('gridcell', {
        name: 'Wednesday, May 13, 2026 4 PM. Visible sync, Sync, 4:00 PM - 4:30 PM',
      }),
    ).toBeInTheDocument();
  });

  it('exposes all-day events in the accessible time grid cells', () => {
    render(
      <Schedule
        view={createScheduleDayView({minHour: 8, maxHour: 10})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(
      screen.getByRole('gridcell', {
        name: 'Wednesday, May 13, 2026 all day. Design review, Design, all day',
      }),
    ).toBeInTheDocument();
  });

  it('renders the time grid inside one named scroll viewport', () => {
    render(
      <Schedule
        view={createScheduleWeeklyView({minHour: 8, maxHour: 17})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    const viewport = screen.getByRole('region', {name: 'May 2026 time grid'});
    const content = viewport.querySelector('[data-scroll-content]');
    expect(content).not.toBeNull();
    // Header cells, the all-day row, the hour gutter, and the day columns are
    // items of the same grid, so no part of the painted header lives outside
    // the viewport's own scrolling content.
    const headerCells = viewport.querySelectorAll('h3');
    expect(headerCells).toHaveLength(7);
    headerCells.forEach(cell => {
      expect(cell.parentElement?.parentElement).toBe(content);
    });
    expect(
      screen.getByText('Visible sync').closest('[data-scroll-content]'),
    ).toBe(content);
    // The hidden read-only grid repeats the hour as a row header; the painted
    // gutter label is the one inside the viewport.
    const gutterLabel = screen
      .getAllByText('9 AM')
      .find(label => viewport.contains(label));
    expect(gutterLabel?.closest('[data-scroll-content]')).toBe(content);
  });

  it('keeps every painted time-grid part hidden from assistive technology', () => {
    render(
      <Schedule
        view={createScheduleWeeklyView({minHour: 8, maxHour: 10})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    const viewport = screen.getByRole('region', {name: 'May 2026 time grid'});
    const content = viewport.querySelector('[data-scroll-content]');
    expect(content).not.toBeNull();
    const parts = Array.from(content?.children ?? []);
    // corner + 7 header cells + all-day label + all-day row + gutter + 7 columns
    expect(parts).toHaveLength(18);
    parts.forEach(part => {
      expect(part).toHaveAttribute('aria-hidden', 'true');
    });
    // The read-only grid stays the accessible representation of the events.
    expect(
      screen.getByRole('gridcell', {
        name: 'Wednesday, May 13, 2026 all day. Design review, Design, all day',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Visible sync/})).toBeNull();
  });

  it('labels list day headings with the full date', () => {
    render(
      <Schedule
        view={createScheduleListView({days: 7})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );

    expect(
      screen.getByRole('heading', {name: 'Wednesday, May 13, 2026'}),
    ).toBeInTheDocument();
  });

  it('calls onChangeDate with the previous view date preserving time of day', () => {
    const onChangeDate = vi.fn();
    render(
      <Schedule
        view={createScheduleDayView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13, 15, 6) as Instant}
        onChangeDate={onChangeDate}
        timezoneID="UTC"
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Previous day'}));
    expect(onChangeDate).toHaveBeenCalledWith(Date.UTC(2026, 4, 12, 15, 6));
  });

  it('allows plugins to customize header slots', () => {
    const plugin: SchedulePlugin = {
      renderHeader: (_startContent, centerContent, endContent) => ({
        startContent: <span>Custom start</span>,
        centerContent,
        endContent,
      }),
    };

    render(
      <Schedule
        view={createScheduleDayView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13) as Instant}
        timezoneID="UTC"
        plugins={[plugin]}
      />,
    );

    expect(screen.getByText('Custom start')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Previous day'}),
    ).not.toBeInTheDocument();
  });

  it('renders a view selector plugin in the header end slot', () => {
    const onChangeView = vi.fn();
    const dayView = createScheduleDayView();
    const monthView = createScheduleMonthlyView();
    const viewOptions = [
      {view: monthView, label: 'Month'},
      {view: dayView, label: 'Day'},
    ];

    function ScheduleWithViewSelector() {
      const viewSelectorPlugin = useScheduleViewSelectorPlugin(viewOptions, {
        onChangeView,
      });
      return (
        <Schedule
          view={dayView}
          events={events}
          categories={categories}
          date={Date.UTC(2026, 4, 13) as Instant}
          timezoneID="UTC"
          plugins={[viewSelectorPlugin]}
        />
      );
    }

    render(<ScheduleWithViewSelector />);

    expect(screen.getByRole('button', {name: /Day/})).toBeInTheDocument();
  });
});

describe('Schedule across a midnight that daylight saving skips', () => {
  // Both zones spring forward at local midnight: the day starts at 01:00.
  const cases = [
    {
      timezoneID: 'America/Santiago',
      date: Date.UTC(2026, 8, 8, 15),
      week: [
        'Sunday, September 6, 2026',
        'Monday, September 7, 2026',
        'Tuesday, September 8, 2026',
        'Wednesday, September 9, 2026',
        'Thursday, September 10, 2026',
        'Friday, September 11, 2026',
        'Saturday, September 12, 2026',
      ],
    },
    {
      timezoneID: 'America/Havana',
      date: Date.UTC(2026, 2, 10, 15),
      week: [
        'Sunday, March 8, 2026',
        'Monday, March 9, 2026',
        'Tuesday, March 10, 2026',
        'Wednesday, March 11, 2026',
        'Thursday, March 12, 2026',
        'Friday, March 13, 2026',
        'Saturday, March 14, 2026',
      ],
    },
  ];
  const renderPopover = () => null;
  const dayGroups = () =>
    screen
      .getAllByRole('group')
      .map(group => group.getAttribute('aria-label') ?? '')
      .filter(name => /, \d{4}$/u.test(name));

  it.each(cases)(
    'keeps seven days in the week and one in the day view in $timezoneID',
    ({timezoneID, date, week}) => {
      const {unmount} = render(
        <Schedule
          view={createScheduleWeeklyView({renderPopover})}
          events={[]}
          date={date}
          timezoneID={timezoneID}
        />,
      );
      expect(dayGroups()).toEqual(week);
      unmount();
      render(
        <Schedule
          view={createScheduleDayView({renderPopover})}
          events={[]}
          date={date - 2 * 24 * 60 * 60 * 1000}
          timezoneID={timezoneID}
        />,
      );
      expect(dayGroups()).toEqual([week[0]]);
    },
  );

  it('keeps seven days in the week and one in the day view that end at the skipped midnight', () => {
    // Santiago's week of Sunday, August 30, 2026 ends on Saturday, September 5;
    // its end is the start of September 6, a midnight that never happens.
    const timezoneID = 'America/Santiago';
    const date = Date.UTC(2026, 8, 5, 15);
    const {unmount} = render(
      <Schedule
        view={createScheduleWeeklyView({renderPopover})}
        events={[]}
        date={date}
        timezoneID={timezoneID}
      />,
    );
    expect(dayGroups()).toEqual([
      'Sunday, August 30, 2026',
      'Monday, August 31, 2026',
      'Tuesday, September 1, 2026',
      'Wednesday, September 2, 2026',
      'Thursday, September 3, 2026',
      'Friday, September 4, 2026',
      'Saturday, September 5, 2026',
    ]);
    unmount();
    render(
      <Schedule
        view={createScheduleDayView({renderPopover})}
        events={[]}
        date={date}
        timezoneID={timezoneID}
      />,
    );
    expect(dayGroups()).toEqual(['Saturday, September 5, 2026']);
  });
});

describe('sortEvents', () => {
  it('sorts mixed all-day and instant events by start time', () => {
    const sortedEvents = sortEvents(
      [
        createEventFromISO({
          id: 'instant-later',
          title: 'A later timed event',
          start: '2026-05-14T16:00:00.000Z',
          end: '2026-05-14T17:00:00.000Z',
        }),
        createEventFromISO({
          id: 'all-day-earlier',
          title: 'Z earlier all-day event',
          start: '2026-05-13',
          end: '2026-05-13',
        }),
        createEventFromISO({
          id: 'instant-earliest',
          title: 'Middle timed event',
          start: '2026-05-12T16:00:00.000Z',
          end: '2026-05-12T17:00:00.000Z',
        }),
      ],
      'UTC',
    );

    expect(sortedEvents.map(event => event.id)).toEqual([
      'instant-earliest',
      'all-day-earlier',
      'instant-later',
    ]);
  });
});

describe('Schedule event popover', () => {
  const categories: ScheduleCategory[] = [
    {label: 'Sync', color: 'blue'},
    {label: 'Design', color: 'purple'},
  ];
  const events: CalendarEvent[] = [
    createEventFromISO({
      id: 'later',
      title: 'Later sync',
      category: 'Sync',
      start: '2026-05-13T17:00:00.000Z',
      end: '2026-05-13T17:30:00.000Z',
    }),
    createEventFromISO({
      id: 'earlier',
      title: 'Earlier sync',
      category: 'Sync',
      start: '2026-05-13T16:00:00.000Z',
      end: '2026-05-13T16:30:00.000Z',
    }),
    createEventFromISO({
      id: 'tuesday',
      title: 'Tuesday sync',
      category: 'Sync',
      start: '2026-05-12T16:00:00.000Z',
      end: '2026-05-12T16:30:00.000Z',
    }),
    createEventFromISO({
      id: 'all-day',
      title: 'Design review',
      category: 'Design',
      start: '2026-05-13',
      end: '2026-05-13',
    }),
  ];
  const renderPopover = (event: CalendarEvent) => (
    <p>Details for {event.title}</p>
  );

  function renderWeek(
    options: Parameters<typeof createScheduleWeeklyView>[0] = {},
    eventSource: ReadonlyArray<CalendarEvent> = events,
  ) {
    return render(
      <Schedule
        view={createScheduleWeeklyView({minHour: 8, maxHour: 20, ...options})}
        events={eventSource}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
  }

  function eventButtons() {
    return screen.queryAllByRole('button', {name: /sync|Design review/});
  }

  function dialogOf(button: HTMLElement): HTMLElement {
    const controls = button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const layer = document.getElementById(controls ?? '');
    expect(layer).not.toBeNull();
    const dialog =
      layer?.getAttribute('role') === 'dialog'
        ? layer
        : layer?.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    return dialog as HTMLElement;
  }

  it('paints a timed event that ends exactly at midnight on the day it starts', () => {
    const lateSync = createEventFromISO({
      id: 'late',
      title: 'Late sync',
      category: 'Sync',
      start: '2026-05-13T22:00:00.000Z',
      end: '2026-05-14T00:00:00.000Z',
    });
    const {unmount} = renderWeek({minHour: 0, maxHour: 24}, [lateSync]);
    // Painted: a block outside the hidden read-only grid.
    const grid = screen.getByRole('grid', {name: 'Schedule time grid'});
    expect(
      screen
        .getAllByText('Late sync')
        .filter(element => !grid.contains(element)),
    ).toHaveLength(1);
    unmount();

    renderWeek({minHour: 0, maxHour: 24, renderPopover}, [lateSync]);
    const wednesday = screen.getByRole('group', {
      name: 'Wednesday, May 13, 2026',
    });
    expect(
      Array.from(wednesday.querySelectorAll('button')).map(button =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Late sync, 10:00 PM - 12:00 AM, Sync, Wednesday, May 13, 2026',
    ]);
    const thursday = screen.getByRole('group', {
      name: 'Thursday, May 14, 2026',
    });
    expect(thursday.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps the read-only grid and renders no button when the option is absent', () => {
    renderWeek();
    expect(eventButtons()).toEqual([]);
    expect(
      screen.getByRole('grid', {name: 'Schedule time grid'}),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders each event with content as a named popup button grouped by day', () => {
    renderWeek({renderPopover});
    expect(screen.queryByRole('grid')).toBeNull();
    const allDay = screen.getByRole('group', {name: 'All-day events'});
    const allDayButton = allDay.querySelector('button');
    expect(allDayButton?.getAttribute('aria-label')).toBe(
      'Design review, all day, Design, Wednesday, May 13, 2026',
    );
    const wednesday = screen.getByRole('group', {
      name: 'Wednesday, May 13, 2026',
    });
    expect(
      Array.from(wednesday.querySelectorAll('button')).map(button =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Earlier sync, 4:00 PM - 4:30 PM, Sync, Wednesday, May 13, 2026',
      'Later sync, 5:00 PM - 5:30 PM, Sync, Wednesday, May 13, 2026',
    ]);
    for (const button of eventButtons()) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button.getAttribute('aria-controls')).toBe(
        eventButtons()[0].getAttribute('aria-controls'),
      );
      expect(button.closest('[aria-hidden="true"]')).toBeNull();
    }
  });

  it('opens one popover named by the event, switches between events, and closes on Escape', () => {
    renderWeek({renderPopover});
    const earlier = screen.getByRole('button', {name: /^Earlier sync/});
    const later = screen.getByRole('button', {name: /^Later sync/});

    fireEvent.click(earlier);
    expect(earlier).toHaveAttribute('aria-expanded', 'true');
    expect(later).toHaveAttribute('aria-expanded', 'false');
    const dialog = dialogOf(earlier);
    expect(dialog).toHaveAttribute('aria-label', 'Earlier sync');
    expect(dialog).toHaveTextContent('Details for Earlier sync');
    // jsdom cannot show a native popover, so the dialog is queried by role
    // attribute rather than through the accessibility tree.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    // A pointer press on another block closes the popover ahead of the
    // browser's light dismiss; the click that follows opens the pressed block.
    fireEvent.pointerDown(later);
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(later);
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
    expect(later).toHaveAttribute('aria-expanded', 'true');
    expect(dialogOf(later)).toHaveAttribute('aria-label', 'Later sync');
    expect(dialogOf(later)).toHaveTextContent('Details for Later sync');
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    fireEvent.keyDown(dialogOf(later), {key: 'Escape'});
    expect(later).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Details for Later sync')).toBeNull();
  });

  it('closes when the open block is clicked again or dismissed by the browser', () => {
    renderWeek({renderPopover});
    const earlier = screen.getByRole('button', {name: /^Earlier sync/});
    fireEvent.pointerDown(earlier);
    fireEvent.click(earlier);
    expect(earlier).toHaveAttribute('aria-expanded', 'true');
    // The press on the open block closes it, whether or not the browser's
    // light dismiss already did.
    fireEvent.pointerDown(earlier);
    fireEvent.click(earlier);
    expect(earlier).toHaveAttribute('aria-expanded', 'false');

    fireEvent.pointerDown(earlier);
    fireEvent.click(earlier);
    expect(earlier).toHaveAttribute('aria-expanded', 'true');
    // A browser light dismiss reaches the layer as a toggle to closed.
    const layer = document.getElementById(
      earlier.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    const toggle = new Event('toggle');
    Object.defineProperty(toggle, 'newState', {value: 'closed'});
    fireEvent(layer, toggle);
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves an event without content read-only but still exposed', () => {
    renderWeek({
      renderPopover: event =>
        event.id === 'later' ? null : renderPopover(event),
    });
    expect(screen.queryByRole('button', {name: /^Later sync/})).toBeNull();
    const wednesday = screen.getByRole('group', {
      name: 'Wednesday, May 13, 2026',
    });
    const staticBlock = wednesday.querySelector(
      '[aria-label^="Later sync"]',
    ) as HTMLElement;
    expect(staticBlock.tagName).toBe('DIV');
    expect(staticBlock).not.toHaveAttribute('aria-haspopup');
    expect(staticBlock.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('button', {name: /^Earlier sync/})).toBeVisible();
  });

  it('re-renders the open content with the event object of the same id and closes when it leaves', () => {
    const {rerender} = renderWeek({renderPopover});
    const view = createScheduleWeeklyView({
      minHour: 8,
      maxHour: 20,
      renderPopover,
    });
    const earlier = screen.getByRole('button', {name: /^Earlier sync/});
    fireEvent.click(earlier);
    expect(dialogOf(earlier)).toHaveTextContent('Details for Earlier sync');

    const renamed = events.map(event =>
      event.id === 'earlier'
        ? {...event, title: 'Earlier sync (moved)'}
        : event,
    );
    rerender(
      <Schedule
        view={view}
        events={renamed}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    const renamedButton = screen.getByRole('button', {
      name: /^Earlier sync \(moved\)/,
    });
    expect(renamedButton).toHaveAttribute('aria-expanded', 'true');
    expect(dialogOf(renamedButton)).toHaveAttribute(
      'aria-label',
      'Earlier sync (moved)',
    );
    expect(dialogOf(renamedButton)).toHaveTextContent(
      'Details for Earlier sync (moved)',
    );

    rerender(
      <Schedule
        view={view}
        events={renamed.filter(event => event.id !== 'earlier')}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        focusDate={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    expect(screen.queryByRole('button', {name: /^Earlier sync/})).toBeNull();
    expect(screen.queryByText(/Details for Earlier sync/)).toBeNull();
    expect(
      screen.queryAllByRole('button', {name: /sync/, expanded: true}),
    ).toEqual([]);
  });

  it('closes when the range is paged away from the open event', () => {
    function Paged() {
      const [date, setDate] = useState<Instant>(Date.UTC(2026, 4, 13));
      const view = useMemo(
        () =>
          createScheduleWeeklyView({minHour: 8, maxHour: 20, renderPopover}),
        [],
      );
      return (
        <Schedule
          view={view}
          events={events}
          categories={categories}
          date={date}
          onChangeDate={setDate}
          timezoneID="UTC"
        />
      );
    }
    render(<Paged />);
    const earlier = screen.getByRole('button', {name: /^Earlier sync/});
    fireEvent.click(earlier);
    expect(dialogOf(earlier)).toHaveTextContent('Details for Earlier sync');
    fireEvent.click(screen.getByRole('button', {name: 'Next week'}));
    expect(screen.queryByRole('button', {name: /^Earlier sync/})).toBeNull();
    expect(screen.queryByText(/Details for Earlier sync/)).toBeNull();
  });

  it('leaves the month and list views read-only', () => {
    const {rerender} = render(
      <Schedule
        view={createScheduleMonthlyView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    expect(eventButtons()).toEqual([]);
    rerender(
      <Schedule
        view={createScheduleListView()}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    expect(eventButtons()).toEqual([]);
  });

  it('exposes the same option on the day view', () => {
    render(
      <Schedule
        view={createScheduleDayView({minHour: 8, maxHour: 20, renderPopover})}
        events={events}
        categories={categories}
        date={Date.UTC(2026, 4, 13)}
        timezoneID="UTC"
      />,
    );
    const earlier = screen.getByRole('button', {name: /^Earlier sync/});
    fireEvent.click(earlier);
    expect(dialogOf(earlier)).toHaveTextContent('Details for Earlier sync');
  });
});

describe('Schedule month overflow', () => {
  // component:Schedule FR15–FR17 and AR7. May 2026 in UTC: Wednesday May 13
  // holds five events and needs five levels; Friday May 15 holds four.
  const categories: ScheduleCategory[] = [
    {label: 'Company', color: 'blue'},
    {label: 'Launch', color: 'green'},
  ];
  const timed = (id: string, title: string, day: number, hour: number) =>
    createEventFromISO({
      id,
      title,
      category: 'Company',
      start: `2026-05-${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
      end: `2026-05-${day}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
    });
  const events: CalendarEvent[] = [
    createEventFromISO({
      id: 'conference',
      title: 'Conference',
      category: 'Launch',
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
      title: 'Offsite',
      category: 'Company',
      start: '2026-05-11',
      end: '2026-05-13',
    }),
    timed('alpha', 'Alpha review', 13, 9),
    timed('bravo', 'Bravo sync', 13, 11),
    timed('charlie', 'Charlie demo', 13, 14),
    timed('friday-1', 'Friday one', 15, 9),
    timed('friday-2', 'Friday two', 15, 10),
    timed('friday-3', 'Friday three', 15, 11),
    timed('friday-4', 'Friday four', 15, 12),
  ];

  function MonthAt({source = events}: {source?: ReadonlyArray<CalendarEvent>}) {
    const [date, setDate] = useState<Instant>(Date.UTC(2026, 4, 13));
    const view = useMemo(() => createScheduleMonthlyView(), []);
    return (
      <Schedule
        view={view}
        events={source}
        categories={categories}
        date={date}
        focusDate={Date.UTC(2026, 4, 13)}
        onChangeDate={setDate}
        timezoneID="UTC"
      />
    );
  }

  function dialogOf(button: HTMLElement): HTMLElement {
    const layer = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    );
    expect(layer).not.toBeNull();
    const dialog =
      layer?.getAttribute('role') === 'dialog'
        ? layer
        : layer?.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    return dialog as HTMLElement;
  }

  it('gives a busy day a named "+N more" button in its cell', () => {
    render(<MonthAt />);
    const wednesday = screen.getByRole('button', {
      name: '3 more events, Wednesday, May 13, 2026',
    });
    expect(wednesday).toHaveTextContent('+3 more');
    expect(wednesday).toHaveAttribute('type', 'button');
    expect(wednesday).toHaveAttribute('aria-haspopup', 'dialog');
    expect(wednesday).toHaveAttribute('aria-expanded', 'false');
    expect(wednesday.getAttribute('aria-controls')).toBeTruthy();
    expect(wednesday.closest('[role="cell"]')).toHaveAttribute(
      'aria-label',
      'Wednesday, May 13, 2026',
    );
    expect(wednesday.closest('[aria-hidden="true"]')).toBeNull();
    expect(
      screen.getByRole('button', {name: '2 more events, Friday, May 15, 2026'}),
    ).toHaveTextContent('+2 more');
    // Monday needs three levels and Thursday one: nothing is counted there.
    expect(screen.getAllByRole('button', {name: /more events?,/})).toHaveLength(
      2,
    );
    // The cell's hidden list still names every event of the busy day.
    const cell = wednesday.closest('[role="cell"]') as HTMLElement;
    expect(cell.querySelectorAll('li')).toHaveLength(5);
  });

  it('opens one popover named by the day that lists every event of it, switches days, and closes on Escape', () => {
    render(<MonthAt />);
    const wednesday = screen.getByRole('button', {name: /^3 more events,/});
    const friday = screen.getByRole('button', {name: /^2 more events,/});

    fireEvent.click(wednesday);
    expect(wednesday).toHaveAttribute('aria-expanded', 'true');
    const dialog = dialogOf(wednesday);
    expect(dialog).toHaveAttribute('aria-label', 'Wednesday, May 13, 2026');
    expect(
      Array.from(dialog.querySelectorAll('li')).map(item => item.textContent),
    ).toEqual([
      'All dayConference',
      'All dayOffsite',
      '9:00 AM - 10:00 AM' + 'Alpha review',
      '11:00 AM - 12:00 PM' + 'Bravo sync',
      '2:00 PM - 3:00 PM' + 'Charlie demo',
    ]);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    // A press on another day's button closes the popover ahead of the
    // browser's light dismiss; the click that follows opens that day.
    fireEvent.pointerDown(friday);
    expect(wednesday).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(friday);
    expect(friday).toHaveAttribute('aria-expanded', 'true');
    expect(dialogOf(friday)).toHaveAttribute(
      'aria-label',
      'Friday, May 15, 2026',
    );
    expect(dialogOf(friday).querySelectorAll('li')).toHaveLength(4);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    fireEvent.keyDown(dialogOf(friday), {key: 'Escape'});
    expect(friday).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when the open day is pressed again, dismissed, or paged away', () => {
    render(<MonthAt />);
    const wednesday = screen.getByRole('button', {name: /^3 more events,/});
    fireEvent.pointerDown(wednesday);
    fireEvent.click(wednesday);
    expect(wednesday).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(wednesday);
    fireEvent.click(wednesday);
    expect(wednesday).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wednesday);
    expect(wednesday).toHaveAttribute('aria-expanded', 'true');
    const layer = document.getElementById(
      wednesday.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    const toggle = new Event('toggle');
    Object.defineProperty(toggle, 'newState', {value: 'closed'});
    fireEvent(layer, toggle);
    expect(wednesday).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wednesday);
    expect(dialogOf(wednesday)).toHaveAttribute(
      'aria-label',
      'Wednesday, May 13, 2026',
    );
    fireEvent.click(screen.getByRole('button', {name: 'Next month'}));
    expect(screen.queryByRole('button', {name: /more events?,/})).toBeNull();
    expect(screen.queryByText('Alpha review')).toBeNull();
  });

  it('closes when the open day stops being busy and moves focus to that day', () => {
    const {rerender} = render(<MonthAt />);
    const friday = screen.getByRole('button', {name: /^2 more events,/});
    fireEvent.click(friday);
    expect(friday).toHaveAttribute('aria-expanded', 'true');
    // Focus is inside the open dialog, as Popover's auto-focus leaves it.
    const dialog = dialogOf(friday);
    const focusTarget = dialog.querySelector<HTMLElement>('button, [tabindex]');
    (focusTarget ?? dialog).focus();
    rerender(
      <MonthAt source={events.filter(event => event.id !== 'friday-4')} />,
    );
    expect(
      screen.queryByRole('button', {name: /Friday, May 15, 2026$/}),
    ).toBeNull();
    expect(document.querySelector('[role="dialog"] li')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('cell', {name: 'Friday, May 15, 2026'}),
    );
  });

  it('adds no button to a month whose days fit in three levels', () => {
    render(<MonthAt source={events.slice(0, 4)} />);
    expect(screen.queryByRole('button', {name: /more events?,/})).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Schedule month event popover', () => {
  // component:Schedule FR19–FR20 and AR8, on May 2026 in UTC. Wednesday May 13
  // is busy: the conference span and Alpha review are painted, and "+3 more"
  // counts Offsite, Bravo sync, and Charlie demo. The holiday has no content.
  const categories: ScheduleCategory[] = [
    {label: 'Company', color: 'blue'},
    {label: 'Launch', color: 'green'},
  ];
  const timed = (id: string, title: string, day: number, hour: number) =>
    createEventFromISO({
      id,
      title,
      category: 'Company',
      start: `2026-05-${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
      end: `2026-05-${day}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
    });
  const events: CalendarEvent[] = [
    createEventFromISO({
      id: 'conference',
      title: 'Conference',
      category: 'Launch',
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
      title: 'Offsite',
      category: 'Company',
      start: '2026-05-11',
      end: '2026-05-13',
    }),
    timed('alpha', 'Alpha review', 13, 9),
    timed('bravo', 'Bravo sync', 13, 11),
    timed('charlie', 'Charlie demo', 13, 14),
    createEventFromISO({
      id: 'holiday',
      title: 'Holiday',
      category: 'Company',
      start: '2026-05-25',
      end: '2026-05-25',
    }),
  ];
  const renderPopover = (event: CalendarEvent) =>
    event.id === 'holiday' ? null : <p>{event.title} details</p>;

  function MonthAt({
    source = events,
    withPopover = true,
  }: {
    source?: ReadonlyArray<CalendarEvent>;
    withPopover?: boolean;
  }) {
    const [date, setDate] = useState<Instant>(Date.UTC(2026, 4, 13));
    const view = useMemo(
      () =>
        createScheduleMonthlyView(withPopover ? {renderPopover} : undefined),
      [withPopover],
    );
    return (
      <Schedule
        view={view}
        events={source}
        categories={categories}
        date={date}
        focusDate={Date.UTC(2026, 4, 13)}
        onChangeDate={setDate}
        timezoneID="UTC"
      />
    );
  }

  function openDialog(): HTMLElement {
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ).filter(dialog => dialog.textContent !== '');
    expect(dialogs).toHaveLength(1);
    return dialogs[0];
  }

  const cell = (name: string) => screen.getByRole('cell', {name});

  it('keeps chips painted decoration without the option', () => {
    render(<MonthAt withPopover={false} />);
    expect(screen.queryByRole('button', {name: /^Conference,/})).toBeNull();
    expect(screen.getAllByRole('button', {name: /more events?,/})).toHaveLength(
      1,
    );
  });

  it('renders each chip with content as a named button in the cell where it starts, and the null chip as text', () => {
    render(<MonthAt />);
    const conference = screen.getByRole('button', {name: /^Conference,/});
    expect(conference.getAttribute('aria-label')).toMatch(
      /^Conference, all day, Launch, May 10\s*–\s*13, 2026$/u,
    );
    expect(conference).toHaveAttribute('aria-haspopup', 'dialog');
    expect(conference).toHaveAttribute('aria-expanded', 'false');
    expect(conference.closest('[role="cell"]')).toBe(
      cell('Sunday, May 10, 2026'),
    );
    const alpha = screen.getByRole('button', {name: /^Alpha review,/});
    expect(alpha).toHaveAttribute(
      'aria-label',
      'Alpha review, 9:00 AM - 10:00 AM, Company, Wednesday, May 13, 2026',
    );
    expect(alpha.closest('[role="cell"]')).toBe(
      cell('Wednesday, May 13, 2026'),
    );
    // Events behind "+3 more" have no chip button.
    expect(screen.queryByRole('button', {name: /^Bravo sync,/})).toBeNull();
    // The holiday has no content: static text with its name, never a button.
    expect(screen.queryByRole('button', {name: /^Holiday,/})).toBeNull();
    expect(
      within(cell('Monday, May 25, 2026')).getByText(
        'Holiday, all day, Company, Monday, May 25, 2026',
      ),
    ).toBeInTheDocument();
    // The buttons are the cells' events: no hidden list repeats them.
    expect(cell('Wednesday, May 13, 2026').querySelectorAll('li')).toHaveLength(
      0,
    );
  });

  it('names a chip as static text on each later day it covers, so no covered day reads as free', () => {
    render(<MonthAt />);
    const monday = cell('Monday, May 11, 2026');
    const mention = within(monday).getByText(
      /^Conference, all day, Launch, since Sunday, May 10, 2026$/u,
    );
    expect(mention.closest('button')).toBeNull();
    expect(mention).not.toHaveAttribute('tabindex');
    expect(
      within(monday).queryByRole('button', {name: /^Conference,/}),
    ).toBeNull();
    // Tuesday is covered by three spans, two from Sunday and one from Monday.
    const tuesday = cell('Tuesday, May 12, 2026');
    expect(tuesday).toHaveTextContent(
      'Hack week, all day, Launch, since Sunday, May 10, 2026',
    );
    expect(tuesday).toHaveTextContent(
      'Offsite, all day, Company, since Monday, May 11, 2026',
    );
    // On busy Wednesday the cut Offsite is counted, not mentioned.
    const wednesday = cell('Wednesday, May 13, 2026');
    expect(wednesday).toHaveTextContent(/Conference, all day, Launch, since/);
    expect(wednesday).not.toHaveTextContent(/Offsite, all day, Company, since/);
  });

  it('opens one popover named by the event with its content, switches events, and closes on Escape', () => {
    render(<MonthAt />);
    const conference = screen.getByRole('button', {name: /^Conference,/});
    const alpha = screen.getByRole('button', {name: /^Alpha review,/});
    fireEvent.click(conference);
    expect(conference).toHaveAttribute('aria-expanded', 'true');
    expect(openDialog()).toHaveAttribute('aria-label', 'Conference');
    expect(openDialog()).toHaveTextContent('Conference details');

    fireEvent.pointerDown(alpha);
    fireEvent.click(alpha);
    expect(conference).toHaveAttribute('aria-expanded', 'false');
    expect(alpha).toHaveAttribute('aria-expanded', 'true');
    expect(openDialog()).toHaveAttribute('aria-label', 'Alpha review');

    fireEvent.keyDown(openDialog(), {key: 'Escape'});
    expect(alpha).toHaveAttribute('aria-expanded', 'false');
  });

  it('hands an event from a busy day\u2019s list to the same popover, with "+N more" as its trigger', () => {
    render(<MonthAt />);
    const more = screen.getByRole('button', {name: /^3 more events,/});
    fireEvent.click(more);
    const list = openDialog();
    expect(list).toHaveAttribute('aria-label', 'Wednesday, May 13, 2026');
    // jsdom does not show native popovers, so their content is queried with
    // hidden elements included.
    const bravo = within(list).getByRole('button', {
      name: /^Bravo sync,/,
      hidden: true,
    });
    expect(bravo).toHaveAttribute(
      'aria-label',
      'Bravo sync, 11:00 AM - 12:00 PM, Company, Wednesday, May 13, 2026',
    );
    fireEvent.click(bravo);
    const event = openDialog();
    expect(event).toHaveAttribute('aria-label', 'Bravo sync');
    expect(event).toHaveTextContent('Bravo sync details');
    expect(more).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(event, {key: 'Escape'});
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when the open chip\u2019s event leaves and moves focus to the cell where it started', () => {
    const {rerender} = render(<MonthAt />);
    const conference = screen.getByRole('button', {name: /^Conference,/});
    fireEvent.click(conference);
    expect(conference).toHaveAttribute('aria-expanded', 'true');
    openDialog().focus();
    rerender(
      <MonthAt source={events.filter(event => event.id !== 'conference')} />,
    );
    expect(document.querySelectorAll('[role="dialog"]').length).toBeLessThan(2);
    expect(screen.queryByRole('button', {name: /^Conference,/})).toBeNull();
    expect(document.activeElement).toBe(cell('Sunday, May 10, 2026'));
  });
});
