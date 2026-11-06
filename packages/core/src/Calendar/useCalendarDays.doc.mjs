// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCalendarDays',
  displayName: 'useCalendarDays',
  group: 'Calendar',
  keywords: [
    'calendar',
    'month',
    'grid',
    'weeks',
    'days',
    'weekday names',
    'week start',
    'date picker',
  ],
  params: [
    {
      name: 'options',
      type: 'UseCalendarDaysOptions',
      description: 'The month to lay out and how.',
      required: true,
    },
    {
      name: 'options.year',
      type: 'number',
      description:
        'Year of the month to lay out, as options.calendar numbers it.',
      required: true,
    },
    {
      name: 'options.month',
      type: 'number',
      description:
        "The month's position in its year under options.calendar, 1-based. In the Gregorian calendar 1 is January and 12 is December; other calendars number months as Temporal.PlainDate does, so a Hebrew leap year runs from 1 to 13.",
      required: true,
    },
    {
      name: 'options.weekStartsOn',
      type: 'DayOfWeek',
      description:
        'First day of the week, from 0 (Sunday) to 6 (Saturday). It sets the first column of both the grid and dayNames.',
      default: '0',
      required: false,
    },
    {
      name: 'options.hasVariableRowCount',
      type: 'boolean',
      description:
        'Use only as many week rows as the month needs instead of a fixed 6-row grid. That is 4 to 6 for a Gregorian month, and 1 or 2 for the short thirteenth month of the Coptic and Ethiopic calendars.',
      default: 'false',
      required: false,
    },
    {
      name: 'options.calendar',
      type: 'CalendarSystem',
      description:
        "The calendar system that numbers year, month and each day's dayNumber. Every day keeps its Gregorian date and iso. The hook never reads the InternationalizationProvider calendar. Calendars other than gregory, iso8601, buddhist, roc and japanese need Temporal; without it the hook uses Gregorian numbers and warns once in development.",
      default: "'gregory'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'days',
      type: 'CalendarDay[]',
      description:
        'Every cell of the grid in order, including the days from the previous and next months that fill the first and last weeks. Each day has date (a PlainDate), iso (YYYY-MM-DD), isOutside (true for a day outside the month) and dayNumber (its day of the calendar month).',
    },
    {
      name: 'weeks',
      type: 'CalendarDay[][]',
      description: 'The same days grouped into rows of seven.',
    },
    {
      name: 'dayNames',
      type: 'string[]',
      description:
        "Weekday header names for the current locale (from InternationalizationProvider), starting at weekStartsOn. Abbreviated where every name fits the column, otherwise the locale's narrow names.",
    },
    {
      name: 'totalCells',
      type: 'number',
      description:
        'Number of cells in the grid: 42 for the fixed grid, otherwise rows times seven.',
    },
  ],
  usage: {
    description:
      "Builds the day grid for one month: every date to show, including the previous and next months' days that fill the first and last weeks, grouped into weeks, plus localized weekday header names that start on weekStartsOn. It is the layout Calendar uses, for a custom month view such as a compact availability grid or a mini calendar. It returns data only: rendering, selection, keyboard navigation and the grid's accessibility semantics are the caller's.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Render dayNames as the header row so the header follows weekStartsOn and the locale together with the grid.',
      },
      {
        guidance: true,
        description:
          'Style days with isOutside differently, for example dimmed, so the filler days read as part of the next or previous month.',
      },
      {
        guidance: false,
        description:
          'Use it to build a date picker that people choose from; use Calendar, which adds selection, keyboard navigation and grid semantics.',
      },
    ],
  },
  relatedComponents: ['Calendar'],
  relatedHooks: ['useLocale'],
  importPath: '@astryxdesign/core/Calendar',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Builds one month's day grid: every date incl. previous/next month filler days, grouped into weeks, + localized weekday names starting at weekStartsOn. Calendar's layout, for custom month views. Data only: rendering, selection, keyboard nav, a11y semantics are the caller's.",
  paramDescriptions: {
    options: 'month to lay out + how.',
    'options.year': 'year of the month, numbered by options.calendar.',
    'options.month':
      "month's position in its options.calendar year, 1-based (gregory 1 = January; Hebrew leap year 1-13).",
    'options.weekStartsOn':
      'first day of week, 0 (Sunday) to 6 (Saturday); first column of grid + dayNames.',
    'options.hasVariableRowCount':
      'only as many week rows as needed (Gregorian 4-6, Coptic/Ethiopic 13th month 1-2) vs fixed 6 rows.',
    'options.calendar':
      "calendar system numbering year, month, dayNumber; default 'gregory'. Dates stay Gregorian; provider calendar ignored. Non-Gregorian-aligned systems need Temporal.",
  },
  returnDescriptions: {
    days: 'every grid cell in order incl. filler days; each has date (PlainDate), iso, isOutside, dayNumber (day of the calendar month).',
    weeks: 'days grouped into rows of 7.',
    dayNames:
      'locale weekday header names starting at weekStartsOn; abbreviated where all fit, else narrow.',
    totalCells: 'cell count: 42 fixed, else rows x 7.',
  },
  usage: {
    description:
      "Month day grid (filler days, weeks, localized weekday names from weekStartsOn). Calendar's layout, for custom month views. Data only; rendering, selection, keyboard nav + a11y semantics are the caller's.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Render dayNames as the header row so it follows weekStartsOn + locale.',
      },
      {
        guidance: true,
        description: 'Style isOutside days differently (e.g. dimmed).',
      },
      {
        guidance: false,
        description: 'Build a selectable date picker with it; use Calendar.',
      },
    ],
  },
};
