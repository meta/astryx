// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCalendarConstraints',
  displayName: 'useCalendarConstraints',
  group: 'Calendar',
  keywords: [
    'calendar',
    'constraints',
    'isDateDisabled',
    'dateConstraints',
    'min',
    'max',
    'rangeSpan',
    'rangeAnchor',
    'disabled dates',
    'hotel booking',
  ],
  params: [
    {
      name: 'options',
      type: 'UseCalendarConstraintsOptions',
      description: 'Configuration for date bounds, range-span limits, and custom rules.',
      required: true,
    },
    {
      name: 'options.min',
      type: 'ISODateString',
      description:
        'Earliest selectable date in ISO format (YYYY-MM-DD). Dates strictly before this are disabled.',
      required: false,
    },
    {
      name: 'options.max',
      type: 'ISODateString',
      description:
        'Latest selectable date in ISO format (YYYY-MM-DD). Dates strictly after this are disabled.',
      required: false,
    },
    {
      name: 'options.dateConstraints',
      type: 'ReadonlyArray<(date: Date) => boolean>',
      description:
        'Custom date constraint predicates. Receives a native Date; if any returns false, the date is disabled.',
      required: false,
    },
    {
      name: 'options.maxRangeSpan',
      type: 'number',
      description:
        'Maximum days a range may span, counting both endpoints (a value of 7 allows a 7-day window). Inactive until rangeAnchor is set.',
      required: false,
    },
    {
      name: 'options.minRangeSpan',
      type: 'number',
      description:
        'Minimum days a range must span, counting both endpoints. Disables dates that would make the range shorter than minRangeSpan days (except rangeAnchor itself, which remains enabled so pickers forbidding single-day selections must refuse a second click on the anchor).',
      required: false,
    },
    {
      name: 'options.rangeAnchor',
      type: 'PlainDate | null',
      description:
        'The in-progress range start date. Span constraints are measured from this date. Null when no selection is underway.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isDateDisabled',
      type: '(date: PlainDate) => boolean',
      description:
        'Predicate returning true when a PlainDate falls outside min/max bounds, is closer to rangeAnchor than minRangeSpan allows (except rangeAnchor itself), exceeds maxRangeSpan relative to rangeAnchor, or fails any dateConstraints predicate.',
    },
    {
      name: 'minDate',
      type: 'PlainDate | null',
      description: 'Parsed minimum date as a PlainDate object, or null if min was not provided.',
    },
    {
      name: 'maxDate',
      type: 'PlainDate | null',
      description: 'Parsed maximum date as a PlainDate object, or null if max was not provided.',
    },
  ],
  usage: {
    description:
      'Provides date constraint validation for calendar views and custom range pickers. It combines boundary dates, span limits measured from an in-progress range start, and custom rules (such as weekly closures or blackout dates) into an isDateDisabled predicate. Calendar uses it internally to disable day buttons; use it directly when building bespoke scheduling interfaces or range pickers.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass rangeAnchor only after the user selects an initial range start, so all eligible start dates remain selectable before the first click.',
      },
      {
        guidance: true,
        description:
          'Use dateConstraints for recurring or dynamic rules, such as disabling closed weekdays, past holidays, or sold-out dates.',
      },
      {
        guidance: false,
        description:
          'Perform slow network calls or heavy calculations inside dateConstraints predicates, because isDateDisabled is evaluated synchronously for each day rendered in the grid.',
      },
    ],
  },
  relatedComponents: ['Calendar'],
  relatedHooks: ['useCalendarDays', 'useCalendarNavigation'],
  importPath: '@astryxdesign/core/Calendar',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Provides date constraint validation combining min/max bounds, range-span caps relative to rangeAnchor, and custom rule functions into isDateDisabled.',
  paramDescriptions: {
    options: 'Date constraint configuration.',
    'options.min': 'Earliest selectable ISO date.',
    'options.max': 'Latest selectable ISO date.',
    'options.dateConstraints': 'Array of predicates returning false for disabled dates.',
    'options.maxRangeSpan': 'Max days in range counting endpoints, measured from rangeAnchor.',
    'options.minRangeSpan': 'Min days in range counting endpoints, measured from rangeAnchor.',
    'options.rangeAnchor': 'Active range start PlainDate for span constraints.',
  },
  returnDescriptions: {
    isDateDisabled: 'Function returning true if PlainDate violates any constraint.',
    minDate: 'Parsed min PlainDate or null.',
    maxDate: 'Parsed max PlainDate or null.',
  },
  usage: {
    description:
      'Combines bounds, spans, and predicates into isDateDisabled for calendar and date-picker layouts.',
    bestPractices: [
      {
        guidance: true,
        description: 'Set rangeAnchor only while actively picking a range end.',
      },
      {
        guidance: true,
        description: 'Use dateConstraints for recurring blackout dates or closures.',
      },
      {
        guidance: false,
        description: 'Run expensive computation inside dateConstraints.',
      },
    ],
  },
};
