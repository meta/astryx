// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCalendarNavigation',
  displayName: 'useCalendarNavigation',
  keywords: [
    'calendar',
    'navigation',
    'month',
    'previous',
    'next',
    'page',
    'monthYearLabel',
    'pendingFocus',
    'keyboard',
    'focus',
    'arrow keys',
  ],
  params: [
    {
      name: 'options',
      type: 'UseCalendarNavigationOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.initialValue',
      type: 'ISODateString',
      description:
        'Date (any day within it) whose month shows first in uncontrolled use.',
      required: false,
    },
    {
      name: 'options.focusDate',
      type: 'ISODateString',
      description:
        'Controlled focus date (which month is visible). Provide together with onFocusDateChange for controlled use.',
      required: false,
    },
    {
      name: 'options.onFocusDateChange',
      type: '(focusDate: ISODateString) => void',
      description:
        'Called with the new focus month when navigation changes it.',
      required: false,
    },
    {
      name: 'options.numberOfMonths',
      type: '1 | 2',
      description:
        'How many months to display; visibleMonths lists each. Default 1.',
      default: '1',
      required: false,
    },
  ],
  returns: [
    {
      name: 'baseMonth',
      type: 'PlainDate',
      description:
        'The first day of the focus month — the anchor visibleMonths and the label build on.',
    },
    {
      name: 'visibleMonths',
      type: 'PlainDate[]',
      description:
        'The months to render, one PlainDate each (first-of-month), numberOfMonths long.',
    },
    {
      name: 'monthYearLabel',
      type: 'string',
      description:
        'The stand-alone month-year header label for the visible months (locale-aware; two months join with an en dash).',
    },
    {
      name: 'navigateMonth',
      type: '(delta: number, focusedDate?: ISODateString, offset?: number) => void',
      description:
        'Move by delta months (−1 previous, +1 next). With focusedDate, also computes the day to focus in the new month: delta × offset days from it (offset 1 for horizontal arrows, 7 for vertical), recorded via pendingFocus.',
    },
    {
      name: 'pendingFocus',
      type: 'ISODateString | null',
      description:
        'The date a navigation wants focused in the newly shown month. After moving focus there, call clearPendingFocus.',
    },
    {
      name: 'clearPendingFocus',
      type: '() => void',
      description: 'Clears pendingFocus once its target has been focused.',
    },
  ],
  usage: {
    description:
      'Manages which month a calendar shows: previous/next navigation, the month-year label, and pending focus so keyboard focus can move across months. The label is stand-alone and locale-aware, and numberOfMonths 2 renders a two-up view whose months share one navigation. pendingFocus is the piece a custom grid cannot derive itself: pressing ArrowRight on the last day of a month must show the next month and focus its first day — navigateMonth(1, focusedDate, 1) records that target, the grid focuses it after the month flips, then clears it. Calendar uses this hook internally; reach for it when you build your own day grid or a pager over months.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render the header from monthYearLabel instead of formatting baseMonth yourself — it is stand-alone (nominative) and locale-aware, which a hand-formatted date is not.',
      },
      {
        guidance: true,
        description:
          'Pass the currently focused day and the movement offset to navigateMonth (1 horizontal, 7 vertical) so pendingFocus lands on the day the arrow key implies.',
      },
      {
        guidance: true,
        description:
          'Focus pendingFocus in an effect after it appears, then clearPendingFocus — the target only exists once the new month has rendered.',
      },
      {
        guidance: false,
        description:
          'Set the focus month state yourself around this hook; the uncontrolled initialValue/onFocusDateChange pair already covers controlled and uncontrolled use.',
      },
    ],
  },
  relatedComponents: ['Calendar'],
  relatedHooks: ['useCalendarConstraints'],
  importPath: '@astryxdesign/core',
  category: 'calendar',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Month navigation for custom day grids: baseMonth/visibleMonths, locale-aware stand-alone monthYearLabel, navigateMonth(delta, focusedDate?, offset?) and pendingFocus/clearPendingFocus for arrow-key focus across month flips.',
  paramDescriptions: {
    options: 'config object.',
    'options.initialValue': 'date whose month shows first (uncontrolled).',
    'options.focusDate':
      'controlled visible-month date; pair with onFocusDateChange.',
    'options.onFocusDateChange': 'new focus month callback.',
    'options.numberOfMonths': 'months displayed (1 or 2).',
  },
  returnDescriptions: {
    baseMonth: 'first day of the focus month.',
    visibleMonths: 'months to render as PlainDates.',
    monthYearLabel: 'stand-alone locale-aware header label.',
    navigateMonth:
      '(delta, focusedDate?, offset?) — moves months; computes pendingFocus at delta×offset days from focusedDate.',
    pendingFocus: 'ISO date to focus in the newly shown month; null when idle.',
    clearPendingFocus: 'clears it after focusing.',
  },
  usage: {
    description:
      'Which month shows, its label, and cross-month keyboard focus for custom grids. Arrow off the last day: navigateMonth(1, focused, 1) records the first day of the next month; focus it after render, then clear.',
    bestPractices: [
      {
        guidance: true,
        description: 'Header from monthYearLabel, not hand-formatted.',
      },
      {
        guidance: true,
        description: 'Pass focused day + offset (1/7) to navigateMonth.',
      },
      {
        guidance: true,
        description: 'Effect: focus pendingFocus, then clearPendingFocus.',
      },
      {
        guidance: false,
        description: 'External focus-month state around the hook.',
      },
    ],
  },
};
