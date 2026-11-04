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
      description: 'Year of the month to lay out.',
      required: true,
    },
    {
      name: 'options.month',
      type: 'number',
      description: 'Month to lay out, 1-based (1 is January, 12 is December).',
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
        'Use only as many week rows as the month needs (4 to 6) instead of a fixed 6-row grid.',
      default: 'false',
      required: false,
    },
  ],
  returns: [
    {
      name: 'days',
      type: 'CalendarDay[]',
      description:
        'Every cell of the grid in order, including the days from the previous and next months that fill the first and last weeks. Each day has date (a PlainDate), iso (YYYY-MM-DD), isOutside (true for a day outside the month) and dayNumber (1 to 31).',
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
    'options.year': 'year of the month.',
    'options.month': 'month, 1-based (1 = January).',
    'options.weekStartsOn':
      'first day of week, 0 (Sunday) to 6 (Saturday); first column of grid + dayNames.',
    'options.hasVariableRowCount':
      'only as many week rows as needed (4-6) vs fixed 6 rows.',
  },
  returnDescriptions: {
    days: 'every grid cell in order incl. filler days; each has date (PlainDate), iso, isOutside, dayNumber.',
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
