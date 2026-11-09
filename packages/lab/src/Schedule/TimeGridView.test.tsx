// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {useState} from 'react';
import {createEventFromISO} from './CalendarEvent';
import {Schedule} from './Schedule';
import {createScheduleDayView} from './DayView';
import {createScheduleWeeklyView} from './WeeklyView';
import {getInitialTimeGridOffset} from './timeGridScrollMemory';
import type {CalendarEvent, Instant, ScheduleEventSource} from './types';

const VIEWPORT = {clientWidth: 1000, clientHeight: 600, scrollWidth: 1000};
// 24 hours at 100px plus the pinned header (56px) and all-day row (~27px).
const SCROLL_HEIGHT = 2483;

const events: CalendarEvent[] = [
  createEventFromISO({
    id: 'visible',
    title: 'Visible sync',
    start: '2026-05-13T16:00:00.000Z',
    end: '2026-05-13T16:30:00.000Z',
  }),
];

function isViewport(element: unknown): element is HTMLElement {
  return (
    element instanceof HTMLElement && element.hasAttribute('data-scroll-axis')
  );
}

/**
 * jsdom lays out nothing, so the time-grid viewport is given the geometry a
 * browser would measure: 24 hours of content in a 600px-tall viewport.
 */
function mockViewportGeometry(scrollHeight = SCROLL_HEIGHT) {
  const geometry: Record<string, number> = {...VIEWPORT, scrollHeight};
  for (const key of Object.keys(geometry)) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return isViewport(this) ? geometry[key] : 0;
      },
    });
  }
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const computed = nativeGetComputedStyle(element);
    if (!isViewport(element)) {
      return computed;
    }
    return new Proxy(computed, {
      get(target, property) {
        if (property === 'overflowX' || property === 'overflowY') {
          return 'auto';
        }
        return Reflect.get(target, property, target);
      },
    });
  });
}

function restoreViewportGeometry() {
  for (const key of [...Object.keys(VIEWPORT), 'scrollHeight']) {
    // Deleting the shadowing getter exposes jsdom's own again.
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
  vi.restoreAllMocks();
}

function viewport(): HTMLElement {
  return screen.getByRole('region', {name: /time grid$/});
}

function Harness({
  initialDate,
  eventSource = events,
  view = createScheduleWeeklyView(),
  timezoneID = 'UTC',
}: {
  initialDate: Instant;
  eventSource?: ScheduleEventSource;
  view?: ReturnType<typeof createScheduleWeeklyView>;
  timezoneID?: string;
}) {
  const [date, setDate] = useState<Instant>(initialDate);
  return (
    <Schedule
      view={view}
      events={eventSource}
      date={date}
      onChangeDate={setDate}
      timezoneID={timezoneID}
    />
  );
}

describe('getInitialTimeGridOffset', () => {
  const days = [
    {year: 2026, month: 5, day: 10},
    {year: 2026, month: 5, day: 11},
    {year: 2026, month: 5, day: 12},
    {year: 2026, month: 5, day: 13},
  ];
  const geometry = {
    timezoneID: 'UTC',
    minHour: 0,
    hourHeight: 100,
    scrollHeight: SCROLL_HEIGHT,
    clientHeight: 600,
  };

  it('opens one hour above now when today is in the range', () => {
    expect(
      getInitialTimeGridOffset({
        ...geometry,
        currentTime: Date.UTC(2026, 4, 13, 14, 0),
        days,
      }),
    ).toBe(1302);
  });

  it('opens at the top when today is not in the range', () => {
    expect(
      getInitialTimeGridOffset({
        ...geometry,
        currentTime: Date.UTC(2026, 6, 1, 14, 0),
        days,
      }),
    ).toBe(0);
  });

  it('clamps to the top shortly after the window starts', () => {
    expect(
      getInitialTimeGridOffset({
        ...geometry,
        currentTime: Date.UTC(2026, 4, 13, 0, 20),
        days,
      }),
    ).toBe(0);
  });

  it('clamps to the end of the grid near midnight', () => {
    expect(
      getInitialTimeGridOffset({
        ...geometry,
        currentTime: Date.UTC(2026, 4, 13, 23, 50),
        days,
      }),
    ).toBe(SCROLL_HEIGHT - 600);
  });

  it('measures from the configured first hour', () => {
    expect(
      getInitialTimeGridOffset({
        ...geometry,
        minHour: 7,
        currentTime: Date.UTC(2026, 4, 13, 9, 0),
        days,
      }),
    ).toBe(102);
  });
});

describe('time grid initial position', () => {
  beforeEach(() => {
    mockViewportGeometry();
  });

  afterEach(() => {
    restoreViewportGeometry();
    vi.useRealTimers();
  });

  it('opens a week containing today one hour before now', () => {
    vi.setSystemTime(Date.UTC(2026, 4, 13, 14, 0));
    render(<Harness initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant} />);
    expect(viewport().scrollTop).toBe(1302);
  });

  it('opens a day containing today one hour before now', () => {
    vi.setSystemTime(Date.UTC(2026, 4, 13, 9, 30));
    render(
      <Harness
        initialDate={Date.UTC(2026, 4, 13, 9, 30) as Instant}
        view={createScheduleDayView()}
      />,
    );
    expect(viewport().scrollTop).toBe(852);
  });

  it('opens a range without today at its configured start', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 14, 0));
    render(<Harness initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant} />);
    expect(viewport().scrollTop).toBe(0);
  });

  it('leaves the person\u2019s own scroll alone across a clock tick and a data refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 4, 13, 14, 0));
    const {rerender} = render(
      <Harness initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant} />,
    );
    expect(viewport().scrollTop).toBe(1302);

    viewport().scrollTop = 500;
    fireEvent.scroll(viewport());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(viewport().scrollTop).toBe(500);

    rerender(
      <Harness
        initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant}
        eventSource={[...events]}
      />,
    );
    expect(viewport().scrollTop).toBe(500);
  });

  it('positions again when the person opens another range', () => {
    vi.setSystemTime(Date.UTC(2026, 4, 13, 14, 0));
    render(<Harness initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant} />);
    expect(viewport().scrollTop).toBe(1302);

    fireEvent.click(screen.getByRole('button', {name: 'Next week'}));
    expect(viewport().scrollTop).toBe(0);

    fireEvent.click(screen.getByRole('button', {name: 'Previous week'}));
    expect(viewport().scrollTop).toBe(1302);
  });

  it('restores the offset when loaded content replaces the suspended fallback', async () => {
    vi.setSystemTime(Date.UTC(2026, 4, 13, 14, 0));
    let resolveEvents: (value: ReadonlyArray<CalendarEvent>) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<ReadonlyArray<CalendarEvent>>(resolve => {
          resolveEvents = resolve;
        }),
    );
    render(
      <Harness
        initialDate={Date.UTC(2026, 4, 13, 14, 0) as Instant}
        eventSource={loader}
      />,
    );
    const fallbackViewport = viewport();
    expect(fallbackViewport.scrollTop).toBe(1302);

    fallbackViewport.scrollTop = 700;
    fireEvent.scroll(fallbackViewport);

    // The loader is invoked in a microtask after the first render.
    await waitFor(() => {
      expect(loader).toHaveBeenCalled();
    });
    await act(async () => {
      resolveEvents(events);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('Visible sync')).toBeInTheDocument();
    });
    const loadedViewport = viewport();
    expect(loadedViewport).not.toBe(fallbackViewport);
    expect(loadedViewport.scrollTop).toBe(700);
  });
});

describe('time grid long spans', () => {
  // component:Schedule FR21: a timed event of 24 hours or more is a span in
  // the all-day row; a shorter one stays a block in each day it touches.
  const spanEvents: CalendarEvent[] = [
    createEventFromISO({
      id: 'offsite',
      title: 'Offsite',
      start: '2026-05-11T09:00:00.000Z',
      end: '2026-05-13T09:00:00.000Z',
    }),
    createEventFromISO({
      id: 'handoff',
      title: 'On-call handoff',
      start: '2026-05-14T08:00:00.000Z',
      end: '2026-05-15T08:00:00.000Z',
    }),
    createEventFromISO({
      id: 'shift',
      title: 'Long shift',
      start: '2026-05-15T00:00:00.000Z',
      end: '2026-05-15T23:59:00.000Z',
    }),
    createEventFromISO({
      id: 'deploy',
      title: 'Late deploy',
      start: '2026-05-12T22:00:00.000Z',
      end: '2026-05-13T02:00:00.000Z',
    }),
  ];
  const date = Date.UTC(2026, 4, 13, 12) as Instant;
  const popoverView = createScheduleWeeklyView({
    renderPopover: event => <p>{event.title} details</p>,
  });
  const allDay = () => screen.getByRole('group', {name: 'All-day events'});
  const day = (name: string) => screen.getByRole('group', {name});
  const buttonsIn = (group: HTMLElement, title: string) =>
    within(group).queryAllByRole('button', {
      name: new RegExp(`^${title},`),
    });

  it('paints a timed event of 24 hours or more as one all-day span named with its dates', () => {
    render(
      <Harness
        initialDate={date}
        eventSource={spanEvents}
        view={popoverView}
      />,
    );
    const [offsite, ...others] = buttonsIn(allDay(), 'Offsite');
    expect(others).toEqual([]);
    expect(offsite.getAttribute('aria-label')).toMatch(
      /^Offsite, May 11(,| at) 9:00\sAM\s–\sMay 13(,| at) 9:00\sAM, .+, Monday, May 11, 2026$/u,
    );
    for (const name of [
      'Monday, May 11, 2026',
      'Tuesday, May 12, 2026',
      'Wednesday, May 13, 2026',
    ]) {
      expect(buttonsIn(day(name), 'Offsite')).toEqual([]);
    }
    expect(buttonsIn(allDay(), 'On-call handoff')).toHaveLength(1);
  });

  it('keeps a timed event shorter than 24 hours in the day columns', () => {
    render(
      <Harness
        initialDate={date}
        eventSource={spanEvents}
        view={popoverView}
      />,
    );
    expect(buttonsIn(allDay(), 'Long shift')).toEqual([]);
    expect(buttonsIn(day('Friday, May 15, 2026'), 'Long shift')).toHaveLength(
      1,
    );
    expect(buttonsIn(allDay(), 'Late deploy')).toEqual([]);
    expect(buttonsIn(day('Tuesday, May 12, 2026'), 'Late deploy')).toHaveLength(
      1,
    );
    expect(
      buttonsIn(day('Wednesday, May 13, 2026'), 'Late deploy'),
    ).toHaveLength(1);
  });

  it('leads a span pill with its title and follows it with its start and end times', () => {
    render(
      <Harness
        initialDate={date}
        eventSource={spanEvents}
        view={popoverView}
      />,
    );
    const offsite = buttonsIn(allDay(), 'Offsite')[0];
    // Whether the times fit is layout; their order in the pill is not.
    expect(offsite.textContent).toMatch(/^Offsite9:00\sAM - 9:00\sAM$/u);
  });

  it('measures the threshold on the event\u2019s own instants across daylight-saving days', () => {
    // America/Los_Angeles: March 8, 2026 lasts 23 hours and November 1,
    // 2026 lasts 25. Midnight to midnight is a block on the first and a span
    // on the second.
    const dstEvents: CalendarEvent[] = [
      createEventFromISO({
        id: 'spring',
        title: 'Spring day',
        start: '2026-03-08T08:00:00.000Z',
        end: '2026-03-09T07:00:00.000Z',
      }),
      createEventFromISO({
        id: 'fall',
        title: 'Fall day',
        start: '2026-11-01T07:00:00.000Z',
        end: '2026-11-02T08:00:00.000Z',
      }),
    ];
    const {unmount} = render(
      <Harness
        initialDate={Date.UTC(2026, 2, 10, 20) as Instant}
        eventSource={dstEvents}
        view={popoverView}
        timezoneID="America/Los_Angeles"
      />,
    );
    expect(buttonsIn(allDay(), 'Spring day')).toEqual([]);
    expect(buttonsIn(day('Sunday, March 8, 2026'), 'Spring day')).toHaveLength(
      1,
    );
    unmount();
    render(
      <Harness
        initialDate={Date.UTC(2026, 10, 3, 20) as Instant}
        eventSource={dstEvents}
        view={popoverView}
        timezoneID="America/Los_Angeles"
      />,
    );
    expect(buttonsIn(allDay(), 'Fall day')).toHaveLength(1);
    expect(buttonsIn(day('Sunday, November 1, 2026'), 'Fall day')).toEqual([]);
  });

  it('lists a long timed event in the hidden grid’s all-day cells and in no hour cell', () => {
    render(<Harness initialDate={date} eventSource={spanEvents} />);
    const grid = screen.getByRole('grid', {name: 'Schedule time grid'});
    const offsiteCells = within(grid)
      .getAllByRole('gridcell')
      .map(cell => cell.getAttribute('aria-label') ?? '')
      .filter(label => label.includes('Offsite'));
    expect(offsiteCells.map(label => label.split('.')[0])).toEqual([
      'Monday, May 11, 2026 all day',
      'Tuesday, May 12, 2026 all day',
      'Wednesday, May 13, 2026 all day',
    ]);
    // Each entry names the span by its title, its category, and its start and
    // end with their dates (component:Schedule AR2).
    for (const label of offsiteCells) {
      expect(label.split('. ')[1]).toMatch(
        /^Offsite, Event, May 11(,| at) 9:00\sAM\s–\sMay 13(,| at) 9:00\sAM$/u,
      );
    }
  });
});
