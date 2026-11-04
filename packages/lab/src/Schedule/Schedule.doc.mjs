// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Schedule',
  displayName: 'Schedule',
  group: 'Schedule',
  category: 'Content',

  usage: {
    description:
      "Schedule is a calendar surface that renders events as a month grid, a day or week time grid, or a list grouped by day: the layout comes from a view object you pass in. It handles timezone-aware date math, paging between ranges, and async event loading, and exposes header slots that plugins fill with navigation controls. Use it to display an existing schedule; build the week, day, or month view with renderPopover to let people open an event's details in a popover the view manages. It has no event selection, creation, or editing affordances.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Hold the rendered date in state and wire onChangeDate to it. Schedule never advances the date itself, so without that handler the built-in previous/Today/next controls render but nothing moves.',
      },
      {
        guidance: true,
        description:
          'Match the view to the density of the data: a month grid for at-a-glance load, a day or week time grid when start and end times matter, a list when the schedule is sparse.',
      },
      {
        guidance: true,
        description:
          'Wrap Schedule in InternationalizationProvider to choose the language, numbering, and field order used by its date and time labels. Schedule date values and calendar arithmetic remain Gregorian for every locale.',
      },
      {
        guidance: true,
        description:
          'Give each event a category string that matches a categories entry so its color is meaningful and screen readers announce the category name. An unmatched name still renders, but always in blue.',
      },
      {
        guidance: false,
        description:
          'Reach for Schedule when the user has to pick a date. It has no selection model; use DateInput, DateRangeInput, or Calendar instead.',
      },
      {
        guidance: false,
        description:
          'Rely on event color alone to carry meaning. Only ten colors exist, so they repeat on larger category sets; the accessible label already announces title, category, and time.',
      },
      {
        guidance: true,
        description:
          'When your page already pages the range with its own controls, keep date in your state and pass plugins={[]}: Schedule then renders the range title with no controls of its own, and your controls call the same setter as onChangeDate.',
      },
      {
        guidance: false,
        description:
          "Pass a custom plugins array without useSchedulePaginationPlugin when you still want Schedule's previous, Today, and next controls; a custom array replaces the default set rather than extending it.",
      },
    ],
    anatomy: [
      {
        name: 'Header start slot',
        required: false,
        description:
          'Leading header region filled by plugins. The default plugin set renders a previous / Today / next button group here.',
      },
      {
        name: 'Header title',
        required: true,
        description:
          'A level-2 heading naming the range on screen, e.g. "May 2026". The same text is the accessible name of the schedule region.',
      },
      {
        name: 'Loading spinner',
        required: false,
        description:
          'Sits beside the title while an async events loader is still pending, labelled "Loading events".',
      },
      {
        name: 'Header end slot',
        required: false,
        description:
          'Trailing header region, empty by default. The view selector plugin renders its menu here.',
      },
      {
        name: 'View body',
        required: true,
        description:
          'Whatever the view renders: a month grid, a day/week time grid with an hour gutter and an all-day row, or a list grouped under day headings. Grid views expose ARIA grid, columnheader, and gridcell roles and are marked aria-readonly. The day/week time grid scrolls inside one keyboard-reachable region named after the range; its day header, all-day row, and hour gutter stay pinned while the columns scroll. The all-day row also holds timed events that last 24 hours or more, as one span across their days.',
      },
      {
        name: 'Event',
        required: false,
        description:
          'One pill (grid views) or row with a color dot (list view) per event, tinted by its category and dimmed once it is in the past. In the day and week grids, events that happen at the same time share the column side by side, and when the view is built with renderPopover each event with content is a button that opens the view\'s popover. In the month grid a week row shows at most three levels of chips; a busy day shows two and a "+N more" button that opens a popover listing every event of that day. A month chip leads with the title; the start time of a timed event follows it only when both fit. When the month view is built with renderPopover, each chip with content is a button that opens the same popover as its day\'s "+N more", and each later day a chip covers names its event for screen readers.',
      },
      {
        name: 'Current time line',
        required: false,
        description:
          'A line across the day or week time grid at the current time, on the current day only. It ticks once a minute and is absent during server rendering. When the rendered range includes today, the grid opens scrolled to one hour before this line (clamped to the grid) once per range, and then leaves the scroll position alone until the person pages to another range or switches views.',
      },
    ],
  },

  props: [
    {
      name: 'view',
      type: 'ScheduleView<Options>',
      description:
        "The view object that owns the layout and the date range each page covers. Build one with createScheduleMonthlyView, createScheduleWeeklyView, createScheduleDayView, or createScheduleListView; each factory takes its own options (weekStartsOn, minHour/maxHour/hourHeight, days). The week, day, and month factories also take renderPopover(event): return the content for an event and the view renders that event as a button that opens a popover it manages — one popover for the view, named by the event title, with the system's standard surface, padding, Escape and light dismiss, and focus return; return null to leave an event read-only. In the month view that popover also shows a busy day's list, and a row in the list opens its event in place. The list view has no interaction option.",
      required: true,
    },
    {
      name: 'events',
      type: 'ReadonlyArray<CalendarEvent> | ((start: Instant, end: Instant) => Promise<ReadonlyArray<CalendarEvent>>)',
      description:
        "Either a static array, filtered to the events overlapping the rendered range and sorted by start, or a loader called with that range's start and end epoch milliseconds. A loader suspends while pending; the header shows a spinner and the view renders empty. Results are cached per loader identity and range, so keep the loader reference stable (useCallback) or every re-render refetches. When your page already holds the events, pass them as an array; Schedule picks out each range's events without a loader.",
      required: true,
    },
    {
      name: 'categories',
      type: "ReadonlyArray<{label: string, color: 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray'}>",
      description:
        'Category definitions matched to each event by label === event.category. The match supplies the event\'s color and the category name in its accessible label. An event whose category names no entry keeps that name but falls back to blue; an event with no category is announced as "Event" in blue. A category can stand for any grouping you color by — an event kind, a calendar, or a team; to color events by calendar, give each calendar its own entry.',
      default: '[]',
    },
    {
      name: 'date',
      type: 'Instant',
      description:
        'Unix epoch milliseconds anywhere inside the range to render; the view expands it to a full month, week, day, or list window. Fully controlled; Schedule never changes it, so pair it with onChangeDate.',
      required: true,
    },
    {
      name: 'focusDate',
      type: 'Instant',
      description:
        'Unix epoch milliseconds marking the day treated as "today": in the month, week, and day views that cell gets aria-current="date" and the highlighted styling. The list view ignores it. When omitted it is captured once at mount and never advances afterwards.',
      default: 'Date.now() at mount',
    },
    {
      name: 'onChangeDate',
      type: '(date: Instant) => void',
      description:
        'Called with the epoch milliseconds to render next when a pagination plugin pages backward or forward, or when Today is pressed. Paging preserves the time of day; Today passes the current time.',
    },
    {
      name: 'timezoneID',
      type: 'string',
      description:
        'IANA timezone ID (e.g. "America/Los_Angeles") used for every date calculation and every formatted label, so the same events regroup across days when it changes.',
      default: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
    },
    {
      name: 'plugins',
      type: 'ReadonlyArray<SchedulePlugin>',
      description:
        'Header plugins, applied in order; each may wrap or replace the start, center, and end header content. Supplying an array replaces the default pagination controls; compose useSchedulePaginationPlugin and useScheduleViewSelectorPlugin to keep both.',
      default: 'defaultSchedulePlugins',
    },
    {
      name: 'headingLevel',
      type: '2 | 3 | 4 | 5 | 6',
      description:
        'Heading level for sub-headings inside the schedule (the weekday and day column headers in the grid views, and the day headings in the list view), so the schedule nests correctly under the surrounding page outline. The header range title is always a level-2 heading.',
      default: '3',
    },
  ],
};
