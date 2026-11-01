// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DateRangeInput',
  displayName: 'Date Range Input',
  group: 'DateInput',
  category: 'Form Controls',
  keywords: [
    'daterangepicker',
    'daterange',
    'range',
    'calendar',
    'filter',
    'analytics',
    'period',
    'schedule',
  ],
  props: [
    {name: 'label', type: 'string', description: 'Label text.', required: true},
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hide the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Helper text displayed below the label.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Show an "(optional)" indicator.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Mark the field as required.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disable the trigger and picker. The trigger stays focusable and exposes `aria-disabled`; opening is blocked.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the trigger (activation stays blocked). Use this instead of wrapping a disabled DateRangeInput in Tooltip.',
    },
    {
      name: 'value',
      type: 'DateRange | null',
      description:
        'Selected date range or null. Import the `DateRange` type from `@astryxdesign/core/DateRangeInput`; it is `{start: ISODateString, end: ISODateString}`. Do NOT redeclare your own DateRange type; use the exported one so TypeScript structurally matches.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: DateRange | null) => void',
      description:
        'Callback when the range changes. Called with null on clear.',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(value: DateRange | null) => void | Promise<void>',
      description:
        'Async action fired after onChange. Drives optimistic UI updates via useTransition.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Whether the input is in a loading state. Disables interaction and shows a spinner.',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISODateString',
      description:
        'Minimum selectable date. `ISODateString` is a template literal type (`\\`${number}${number}${number}${number}-${number}${number}-${number}${number}\\``). Pass a string literal like `"2026-01-28"`, not a runtime string variable. Import it from `@astryxdesign/core/Calendar` or use `as ISODateString` if computing the value dynamically.',
    },
    {
      name: 'max',
      type: 'ISODateString',
      description:
        'Maximum selectable date. Same template literal type as `min`: use a YYYY-MM-DD string literal or cast with `as ISODateString`.',
    },
    {
      name: 'dateConstraints',
      type: 'Array<(date: Date) => boolean>',
      description: 'Custom constraint functions to disable specific dates.',
    },
    {
      name: 'maxRangeSpan',
      type: 'number',
      description:
        'Maximum days a selected range may span, counting both endpoints (`7` = a 7-day window, start + 6). Once a start is picked, days beyond this distance are disabled so the range cannot stretch past the cap. Rolling window relative to the start; for fixed calendar bounds use `min`/`max`. Constrains selection only; it never rewrites a `value` already wider than the cap (flag that with `status`).',
    },
    {
      name: 'minRangeSpan',
      type: 'number',
      description:
        'Minimum days a selected range must span, counting both endpoints (`2` forbids a single-day range). Once a start is picked, days closer than this are disabled. Clicking the start again commits a one-day range when allowed, or cancels the in-progress selection when the minimum is longer. Defaults to 1 (same-day start and end allowed).',
    },
    {
      name: 'presets',
      type: 'Array<DateRangePreset>',
      description:
        'Preset ranges shown as quick-select options beside the calendar. A preset is disabled when either endpoint violates min, max, or dateConstraints, or when its span violates minRangeSpan or maxRangeSpan.',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: 'Shows a clear button when a range is selected.',
      default: 'true',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text when no range is selected.',
      default: "'Select date range'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size of the trigger.',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Status indicator for error, warning, or success states.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon.',
      default: "'attached'",
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text via info icon at label end.',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description: 'Number of months in the calendar.',
      default: '2',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'First day of week in the calendar. A number (0 = Sunday to 6 = Saturday) or a three-letter day name.',
      default: '0',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the Field box around the label, control, and status. containerClassName and containerStyle take a class name and inline styles for the same box. No effect (development warning) where no Field box renders: inside InputGroup (style the group) and in a horizontal-labels FormLayout.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the bordered element that holds the text, icons, and end controls, never the native input. controlClassName and controlStyle take a class name and inline styles for the same box. Replaces root xstyle, className, and style, which this component does not accept.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-date-range-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
      {className: 'astryx-date-range-input-toggle-icon', states: ['state']},
      {className: 'astryx-date-range-input-presets'},
      {
        className: 'astryx-date-range-input-preset',
        states: ['selected', 'disabled'],
      },
    ],
  },
  usage: {
    description:
      'DateRangeInput lets users select a start and end date from a dual-month calendar popover. Use it for filtering data by time period, report generation, analytics dashboards, and booking flows.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the range trigger, the element that is focused and announced. A DOM handler runs after DateRangeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Use presets for common ranges like "Last 7 days" to speed up selection.',
      },
      {
        guidance: true,
        description:
          'Use min/max to constrain selectable dates to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Keep hasClear enabled (default) so users can reset the filter.',
      },
      {
        guidance: true,
        description:
          'Provide clear labels and descriptions so users understand what the range controls.',
      },
      {
        guidance: false,
        description:
          'Use DateRangeInput when only a single date is needed; use DateInput instead.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateRangeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description:
          'Text above the trigger describing what date range is expected.',
      },
      {
        name: 'Field surface',
        required: true,
        description:
          'Bordered control containing the calendar toggle, range trigger, and end affordances.',
      },
      {
        name: 'Trigger button',
        required: true,
        description:
          'A button showing the formatted range or placeholder. Clicking opens the popover.',
      },
      {
        name: 'Calendar icon',
        required: true,
        description: 'A trailing icon that also opens the popover.',
      },
      {
        name: 'Calendar popover',
        required: true,
        description:
          'A dual-month calendar grid with range selection and hover preview.',
      },
      {
        name: 'Preset sidebar',
        required: false,
        description: 'A list of preset range options beside the calendar.',
      },
      {
        name: 'Preset button',
        required: false,
        description:
          'A quick-select action for one preset range, reflecting current and disabled states.',
      },
      {
        name: 'Clear button',
        required: false,
        description: 'A × button that resets the range to null.',
      },
      {
        name: 'Status message',
        required: false,
        description: 'An error, warning, or success message below the trigger.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'date range picker with dual-month calendar popover and preset ranges',
  usage: {
    description:
      'DateRangeInput lets users select start+end dates from a dual-month calendar. Use for filtering, reports, analytics, and booking.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the range trigger, the element that is focused and announced. A DOM handler runs after DateRangeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Use presets for common ranges like "Last 7 days" to speed up selection.',
      },
      {
        guidance: true,
        description:
          'Use min/max to constrain selectable dates to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Keep hasClear enabled (default) so users can reset the filter.',
      },
      {
        guidance: true,
        description:
          'Provide clear labels + descriptions so users understand what the range controls.',
      },
      {
        guidance: false,
        description:
          'Use DateRangeInput when only a single date is needed; use DateInput instead.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateRangeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
  },
  propDescriptions: {
    label: 'label text',
    isLabelHidden: 'visually hide label',
    description: 'helper text below label',
    isOptional: 'show "(optional)" indicator',
    isRequired: 'mark field required',
    isDisabled: 'disable trigger+picker',
    disabledMessage:
      'reason shown in a tooltip on hover/focus when disabled; describes the trigger',
    value:
      'selected range {start, end} or null; import DateRange type from @astryxdesign/core/DateRangeInput (do not redeclare)',
    onChange: 'callback on range change; null on clear',
    min: 'min selectable date: ISODateString template literal type (YYYY-MM-DD); use string literal or cast `as ISODateString`',
    max: 'max selectable date: ISODateString template literal type (YYYY-MM-DD); use string literal or cast `as ISODateString`',
    dateConstraints: 'custom constraint fns to disable dates',
    maxRangeSpan:
      'max days a range may span, both endpoints counted (7 = a 7-day window); caps the window from the picked start. Selection-only; does not rewrite an over-wide value',
    minRangeSpan:
      'min days a range must span, both endpoints counted (2 forbids a single-day range); repeated start click commits one day when allowed, otherwise cancels; default 1',
    presets:
      'preset ranges as quick-select options; disabled when an endpoint or span violates the corresponding constraints',
    hasClear: 'clear button when range is set (default true)',
    placeholder: 'placeholder when empty',
    size: 'trigger size',
    status: 'error/warning/success status',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    labelTooltip: 'tooltip via info icon at label end',
    numberOfMonths: 'months in calendar (default 2)',
    weekStartsOn:
      'first day of week in calendar (0=Sunday, or name e.g. "mon")',
    changeAction:
      'async action fired after onChange; drives optimistic UI updates via useTransition',
    isLoading: 'loading state; disables interaction + shows a spinner',
    containerXstyle:
      'Field box (label+control+status); also containerClassName/containerStyle. no effect in InputGroup or horizontal-labels FormLayout',
    controlXstyle:
      'visual control box (border/bg/icons), never the native input; also controlClassName/controlStyle. no root xstyle/className/style',
  },
};
