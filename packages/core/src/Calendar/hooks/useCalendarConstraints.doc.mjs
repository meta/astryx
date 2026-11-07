// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCalendarConstraints',
  displayName: 'useCalendarConstraints',
  keywords: [
    'calendar',
    'date',
    'disabled',
    'constraints',
    'min',
    'max',
    'range',
    'span',
    'booking',
    'availability',
    'isDateDisabled',
    'closed',
  ],
  params: [
    {
      name: 'options',
      type: 'UseCalendarConstraintsOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.min',
      type: 'ISODateString',
      description:
        'Minimum selectable date (inclusive). Dates before it are disabled.',
      required: false,
    },
    {
      name: 'options.max',
      type: 'ISODateString',
      description:
        'Maximum selectable date (inclusive). Dates after it are disabled.',
      required: false,
    },
    {
      name: 'options.dateConstraints',
      type: 'ReadonlyArray<(date: Date) => boolean>',
      description:
        'Custom rules receiving a native Date. A date is disabled if ANY function returns false — e.g. block a weekday the venue is closed.',
      required: false,
    },
    {
      name: 'options.maxRangeSpan',
      type: 'number',
      description:
        'Maximum days a range may span, counting both endpoints (7 allows a 7-day window). In range mode, once a start is picked, dates further than this from it are disabled. No effect until rangeAnchor is set.',
      required: false,
    },
    {
      name: 'options.minRangeSpan',
      type: 'number',
      description:
        'Minimum days a range must span, counting both endpoints (2 forbids a single-day range). In range mode, once a start is picked, dates closer than this to it are disabled.',
      required: false,
    },
    {
      name: 'options.rangeAnchor',
      type: 'PlainDate | null',
      description:
        'The in-progress range start (first click, awaiting the second). Span constraints are measured from this date; null when no selection is underway.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isDateDisabled',
      type: '(date: PlainDate) => boolean',
      description:
        'Whether a PlainDate is disabled under the combined rules. Drive both the visual state and pickability of each day cell from this one check.',
    },
    {
      name: 'minDate',
      type: 'PlainDate | null',
      description: 'The parsed min bound, or null when none was set.',
    },
    {
      name: 'maxDate',
      type: 'PlainDate | null',
      description: 'The parsed max bound, or null when none was set.',
    },
  ],
  usage: {
    description:
      'Gives an isDateDisabled check built from min/max bounds, range-span bounds and custom rules, for any day grid you render yourself. Range spans count both endpoints (a span of 7 is a 7-day window) and apply only once a rangeAnchor exists — the in-progress start of a range selection — so a booking UI caps the reachable window from the check-in date by passing the picked date as the anchor. Custom dateConstraints receive a native Date and disable a day when any rule returns false, which covers fixed closures (a weekday the venue is closed) that bounds cannot express. Calendar uses this hook internally; reach for it directly when you build a custom day grid or another picker on top of the same rules.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Drive both the disabled styling and the click handling from the single isDateDisabled check, so a day that looks disabled can never be picked.',
      },
      {
        guidance: true,
        description:
          'Pass the picked start date as rangeAnchor the moment a range selection begins; span constraints have no effect without it, and it should be null again when the selection resets.',
      },
      {
        guidance: true,
        description:
          'Remember spans count both endpoints: maxRangeSpan 7 allows a 7-day window (6 nights), and minRangeSpan 2 forbids a single-day range.',
      },
      {
        guidance: false,
        description:
          'Re-derive the disabled set outside the hook — combining min, max, span and custom rules by hand drifts from what the hook computes.',
      },
    ],
  },
  relatedComponents: ['Calendar'],
  relatedHooks: ['useCalendarNavigation'],
  importPath: '@astryxdesign/core',
  category: 'calendar',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'isDateDisabled from min/max bounds, range-span bounds (both endpoints counted; active only with rangeAnchor) and custom (date: Date) => boolean rules. Calendar uses it internally; use it for custom day grids.',
  paramDescriptions: {
    options: 'config object.',
    'options.min': 'inclusive lower bound.',
    'options.max': 'inclusive upper bound.',
    'options.dateConstraints': 'custom rules; disabled when ANY returns false.',
    'options.maxRangeSpan':
      'max range days incl. endpoints; needs rangeAnchor.',
    'options.minRangeSpan':
      'min range days incl. endpoints; needs rangeAnchor.',
    'options.rangeAnchor': 'in-progress range start; null when idle.',
  },
  returnDescriptions: {
    isDateDisabled: '(PlainDate) => boolean under the combined rules.',
    minDate: 'parsed min or null.',
    maxDate: 'parsed max or null.',
  },
  usage: {
    description:
      'One check for day-cell disabled state and pickability in custom grids. Anchor a range to apply span caps from the picked start; custom rules cover fixed closures.',
    bestPractices: [
      {
        guidance: true,
        description: 'One isDateDisabled drives styling AND clicks.',
      },
      {
        guidance: true,
        description: 'rangeAnchor = picked start; null on reset.',
      },
      {
        guidance: true,
        description: 'Spans count both endpoints (7 = 6 nights).',
      },
      {guidance: false, description: 'Re-deriving the disabled set by hand.'},
    ],
  },
};
