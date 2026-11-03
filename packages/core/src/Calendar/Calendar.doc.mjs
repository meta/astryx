// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Calendar',
  displayName: 'Calendar',
  category: 'Form Controls',
  keywords: [
    'calendar',
    'datepicker',
    'date picker',
    'rangepicker',
    'date range',
    'monthview',
    'daypicker',
  ],
  usage: {
    description:
      'Calendar lets the user pick a date or date range from a month grid. Use it in booking flows, scheduling UIs, date filters, or anywhere the user needs to see surrounding dates for context.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set min and max dates to limit selection to a valid window, like only future dates for a booking or the current quarter for a report.',
      },
      {
        guidance: true,
        description:
          'Use range mode when the user needs to pick a start and end date, like a trip or a time-off request.',
      },
      {
        guidance: true,
        description:
          'Use dateConstraints to disable specific dates like weekends or holidays, and explain why they are unavailable.',
      },
      {
        guidance: true,
        description:
          'Show two months side by side when the user frequently selects dates that span a month boundary.',
      },
      {
        guidance: false,
        description:
          'Use a calendar for dates far in the past or future like a birth date. A text input is faster for open-ended entry.',
      },
      {
        guidance: false,
        description:
          'Disable large blocks of dates without context. The user should understand why dates are unavailable.',
      },
    ],
    anatomy: [
      {
        name: 'Calendar root',
        required: true,
        description:
          'The container that holds the month header and the day grid.',
      },
      {
        name: 'Month header',
        required: true,
        description:
          'The month name and year with navigation arrows to move between months. The arrows mirror automatically under dir="rtl".',
      },
      {
        name: 'Day grid',
        required: true,
        description:
          'A 7-column grid of days with column headers for the day names.',
      },
      {
        name: 'Day button',
        required: true,
        description: 'One day in the grid; the control a date is picked with.',
      },
      {
        name: 'Selected day',
        required: false,
        description:
          'The currently selected date, highlighted. In range mode, the start and end dates plus the days between them.',
      },
      {
        name: 'Today marker',
        required: false,
        description: 'A subtle indicator on the current date for orientation.',
      },
    ],
  },
  props: [
    {
      name: 'mode',
      type: "'single' | 'range'",
      description: 'Selection mode.',
      default: "'single'",
    },
    {
      name: 'value',
      type: 'ISODateString | DateRange | null',
      description:
        'Controlled selected value. Use null for no selection; omit value or pass undefined for uncontrolled mode.',
    },
    {
      name: 'defaultValue',
      type: 'ISODateString | DateRange',
      description: 'Uncontrolled default value.',
    },
    {
      name: 'onChange',
      type: 'Function',
      description: 'Selection callback.',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description: 'Number of months to display.',
      default: '1',
    },
    {
      name: 'min',
      type: 'ISODateString',
      description: 'Minimum selectable date.',
    },
    {
      name: 'max',
      type: 'ISODateString',
      description: 'Maximum selectable date.',
    },
    {
      name: 'dateConstraints',
      type: 'Array<(date: Date) => boolean>',
      description: 'Custom constraint functions.',
    },
    {
      name: 'maxRangeSpan',
      type: 'number',
      description:
        'Range mode: max days a range may span, both endpoints counted (7 = a 7-day window). Caps the window from the picked start; before a start is picked every day stays selectable.',
    },
    {
      name: 'minRangeSpan',
      type: 'number',
      description:
        'Range mode: min days a range must span, both endpoints counted (2 forbids a single-day range). Clicking the start again commits a one-day range when allowed, or cancels the in-progress selection when the minimum is longer. Default 1.',
    },
    {
      name: 'focusDate',
      type: 'ISODateString',
      description:
        'Controlled visible month. Unset, the calendar opens on the selected date, else on today clamped into the min/max window.',
    },
    {
      name: 'onFocusDateChange',
      type: '(focusDate: ISODateString) => void',
      description: 'Navigation callback.',
    },
    {
      name: 'handleRef',
      type: 'React.Ref<CalendarHandle>',
      description:
        'Imperative handle for calendar navigation, including navigateTo().',
    },
    {
      name: 'hasOutsideDays',
      type: 'boolean',
      description: 'Show days from adjacent months.',
      default: 'true',
    },
    {
      name: 'hasWeekNumbers',
      type: 'boolean',
      description:
        'Show ISO 8601 week numbers. They are ISO 8601 week numbers in every calendar system.',
      default: 'false',
    },
    {
      name: 'hasVariableRowCount',
      type: 'boolean',
      description:
        'Give each month only the rows it needs. The default fixed 6-row grid keeps the same height from month to month; a variable row count trades that fixed height for a more compact grid.',
      default: 'false',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'First day of week. Accepts a number (0=Sunday) or a three-letter day name (e.g. "mon").',
      default: '0',
    },
    {
      name: 'calendar',
      type: "'gregory' | 'iso8601' | 'buddhist' | 'roc' | 'japanese' | 'persian' | 'indian' | 'hebrew' | 'chinese' | 'dangi' | 'coptic' | 'ethiopic' | 'ethioaa' | 'islamic-civil' | 'islamic-tbla' | 'islamic-umalqura'",
      description:
        "Calendar system the grid shows, such as 'persian', 'hebrew', or 'islamic-umalqura'. It sets the months, their names, and month and year navigation. value, min, max, focusDate, and every callback stay Gregorian ISO dates. Calendars other than gregory, iso8601, buddhist, roc, and japanese need Temporal; where the runtime lacks it, load a polyfill such as temporal-polyfill/full/global on the server and in the browser, or the grid shows Gregorian months. Chinese and Korean month starts come from the runtime's Temporal, and some polyfills start a few months one day apart from native Temporal; when you render on the server, load the same Temporal implementation on the server and in the browser.",
      default: 'the InternationalizationProvider calendar, else gregory',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-calendar', visualProps: ['mode']},
      {
        className: 'astryx-calendar-nav',
        visualProps: ['nav'],
        states: ['disabled'],
      },
      {
        className: 'astryx-calendar-day',
        states: ['selected', 'today', 'disabled', 'in-range', 'marker'],
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Calendar',
  displayName: 'Calendar',
  usage: {
    description:
      'Calendar lets the user pick a date or date range from a month grid. Use it in booking flows, scheduling UIs, date filters, or anywhere the user needs to see surrounding dates for context.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set min and max dates to limit selection to a valid window, like only future dates for a booking or the current quarter for a report.',
      },
      {
        guidance: true,
        description:
          'Use range mode when the user needs to pick a start and end date, like a trip or a time-off request.',
      },
      {
        guidance: true,
        description:
          'Use dateConstraints to disable specific dates like weekends or holidays, and explain why they are unavailable.',
      },
      {
        guidance: true,
        description:
          'Show two months side by side when the user frequently selects dates that span a month boundary.',
      },
      {
        guidance: false,
        description:
          'Use a calendar for dates far in the past or future like a birth date. A text input is faster for open-ended entry.',
      },
      {
        guidance: false,
        description:
          'Disable large blocks of dates without context. The user should understand why dates are unavailable.',
      },
    ],
  },
  props: [
    {
      name: 'mode',
      type: "'single' | 'range'",
      description: '选择模式。',
      default: "'single'",
    },
    {
      name: 'value',
      type: 'ISODateString | DateRange | null',
      description:
        '受控选中值。null 表示没有选中值；省略或传入 undefined 为非受控模式。',
    },
    {
      name: 'defaultValue',
      type: 'ISODateString | DateRange',
      description: '非受控默认值。',
    },
    {name: 'onChange', type: 'Function', description: '选择回调函数。'},
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description: '显示的月份数量。',
      default: '1',
    },
    {name: 'min', type: 'ISODateString', description: '可选择的最早日期。'},
    {name: 'max', type: 'ISODateString', description: '可选择的最晚日期。'},
    {
      name: 'dateConstraints',
      type: 'Array<(date: Date) => boolean>',
      description: '自定义约束函数。',
    },
    {
      name: 'maxRangeSpan',
      type: 'number',
      description:
        '范围模式：范围最多可跨越的天数，含首尾两端（7 = 7 天窗口）。选定起始日后限制窗口大小。',
    },
    {
      name: 'minRangeSpan',
      type: 'number',
      description:
        '范围模式：范围最少需跨越的天数，含首尾两端（2 表示禁止单日范围）。再次点击开始日期时，若最小范围允许则提交单日范围；否则取消进行中的选择。默认为 1。',
    },
    {
      name: 'focusDate',
      type: 'ISODateString',
      description:
        '受控可见月份。未设置时，日历打开时显示已选日期所在月份；若无选中值，则显示今天，并将其限制在 min/max 范围内。',
    },
    {
      name: 'onFocusDateChange',
      type: '(focusDate: ISODateString) => void',
      description: '导航回调函数。',
    },
    {
      name: 'handleRef',
      type: 'React.Ref<CalendarHandle>',
      description: '日历导航的命令式句柄，包括 navigateTo()。',
    },
    {
      name: 'hasOutsideDays',
      type: 'boolean',
      description: '显示相邻月份的日期。',
      default: 'true',
    },
    {
      name: 'hasWeekNumbers',
      type: 'boolean',
      description: '显示 ISO 8601 周数。在任何历法中都是 ISO 8601 周数。',
      default: 'false',
    },
    {
      name: 'hasVariableRowCount',
      type: 'boolean',
      description:
        '每个月只显示所需的行数。默认的固定 6 行网格使每个月高度相同；可变行数以固定高度换取更紧凑的网格。',
      default: 'false',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        '每周起始日。可为数字（0=周日）或三字母星期缩写（如 "mon"）。',
      default: '0',
    },
    {
      name: 'calendar',
      type: "'gregory' | 'iso8601' | 'buddhist' | 'roc' | 'japanese' | 'persian' | 'indian' | 'hebrew' | 'chinese' | 'dangi' | 'coptic' | 'ethiopic' | 'ethioaa' | 'islamic-civil' | 'islamic-tbla' | 'islamic-umalqura'",
      description:
        "网格显示的历法，如 'persian'、'hebrew' 或 'islamic-umalqura'。它决定月份、月份名称以及按月和按年的导航。value、min、max、focusDate 和所有回调仍为公历 ISO 日期。gregory、iso8601、buddhist、roc 和 japanese 以外的历法需要 Temporal；运行环境没有 Temporal 时，请在服务端和浏览器中加载 polyfill（如 temporal-polyfill/full/global），否则网格显示公历月份。农历（chinese）和韩国历（dangi）的月初取自运行环境的 Temporal，部分 polyfill 与原生 Temporal 有少数月份的月初相差一天；服务端渲染时，请在服务端和浏览器中加载同一种 Temporal 实现。",
      default: 'InternationalizationProvider 的历法，否则为 gregory',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-calendar',
        visualProps: ['mode'],
      },
      {
        className: 'astryx-calendar-nav',
        visualProps: ['nav'],
        states: ['disabled'],
      },
      {
        className: 'astryx-calendar-day',
        states: ['selected', 'today', 'disabled', 'in-range', 'marker'],
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'month grid for picking a date or date range',
  usage: {
    description:
      'Calendar lets the user pick a date or date range from a month grid. Use in booking, scheduling, date filters.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set min/max to limit selection to a valid window: only future dates for booking, current quarter for a report.',
      },
      {
        guidance: true,
        description:
          'Use range mode when user picks start + end dates: trip, time-off request.',
      },
      {
        guidance: true,
        description:
          'Use dateConstraints to disable specific dates (weekends/holidays); explain why unavailable.',
      },
      {
        guidance: true,
        description:
          'Show two months side by side when user frequently selects dates spanning a month boundary.',
      },
      {
        guidance: false,
        description:
          'Use for dates far in the past/future; text input is faster.',
      },
      {guidance: false, description: 'Disable dates without explaining why.'},
    ],
  },
  propDescriptions: {
    mode: 'selection mode',
    value: 'controlled selected value',
    defaultValue: 'uncontrolled default value',
    onChange: 'selection callback',
    numberOfMonths: 'months to display',
    min: 'minimum selectable date',
    max: 'maximum selectable date',
    dateConstraints: 'custom constraint fns',
    maxRangeSpan:
      'range mode: max days a range may span, both ends counted (7 = 7-day window)',
    minRangeSpan:
      'range mode: min days a range must span, both ends counted; repeated start click commits one day when allowed, otherwise cancels (default 1)',
    focusDate:
      'controlled visible month (default: selected date, else today clamped into min/max)',
    onFocusDateChange: 'navigation callback',
    handleRef: 'imperative navigation handle',
    hasOutsideDays: 'show days from adjacent months',
    hasWeekNumbers: 'show ISO 8601 week numbers, in every calendar system',
    hasVariableRowCount:
      'only the rows each month needs; trades the fixed 6-row height for a compact grid',
    weekStartsOn: 'first day of week (0=Sunday, or name e.g. "mon")',
    calendar:
      'calendar system shown (default: provider calendar, else gregory); values stay Gregorian ISO; non-Gregorian-aligned calendars need Temporal',
  },
};
