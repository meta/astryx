// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'MobilePowerSearch',
  displayName: 'Mobile Power Search',
  group: 'MobilePowerSearch',
  category: 'Form Controls',
  keywords: [
    'power search',
    'filters',
    'mobile',
    'touch',
    'bottom sheet',
    'filter builder',
  ],
  props: [
    {
      name: 'config',
      type: 'PowerSearchConfig',
      description:
        'Core PowerSearch configuration: fields, operators, and an optional contentSearchFieldKey.',
      required: true,
    },
    {
      name: 'filters',
      type: 'ReadonlyArray<PowerSearchFilter>',
      description: 'Currently active filters (Core PowerSearchFilter).',
      required: true,
    },
    {
      name: 'onChange',
      type: '(filters, changeType, index) => void',
      description:
        "Mirrors Core PowerSearch: the next filters plus 'add' | 'edit' | 'remove' and the affected index.",
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the field and its trigger.',
      default: "'Manage filters'",
    },
    {
      name: 'placeholder',
      type: 'string',
      description:
        'Trigger text when no filter is selected; also the content-search placeholder.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Field size; tokens follow it.',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the field; the sheet cannot open. Pair with disabledMessage to explain why.',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Filters stay visible in the Filters sheet but cannot be added, edited, or removed.',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows Clear all in the Filters sheet footer. Clear all removes every filter, read-only ones included, as the Core PowerSearch clear control does, and reports one `remove` change at the last index.',
      default: 'true',
    },
    {
      name: 'timezoneID',
      type: 'string',
      description:
        'IANA timezone for date values. Used by tokens, Filters rows, and the date editors alike, so a boundary date reads the same everywhere.',
    },
    {
      name: 'maxSearchResults',
      type: 'number',
      description:
        'Max suggestions for a non-empty field or content-search query.',
      default: '10',
    },
    {
      name: 'popoverSaveButtonLabel',
      type: 'string',
      description: "Label for the edit sheet's confirm action.",
      default: "'Apply' when editing, 'Add filter' when creating",
    },
    {
      name: 'components',
      type: 'PowerSearchComponents',
      description:
        'Core per-type Token and Editor overrides. Tokens render display-only (no onClick/onRemove); an Editor replaces the value sheet body.',
    },
    {
      name: 'resultCount',
      type: 'number | string',
      description:
        'Shown at the end of the field and announced when it changes.',
    },
  ],
  usage: {
    description:
      'Lab prototype for trying the touch PowerSearch flow. Choose it explicitly on touch layouts (for example `const Search = isTouch ? MobilePowerSearch : PowerSearch`); it never switches on pointer type by itself. The whole field is one Manage filters trigger showing display-only tokens. Tapping it opens a tall Filters sheet listing each filter with its value in bold and a direct trailing remove action, an Add filter icon button at the top right, and sticky Clear all and Done actions. One-tap boolean filters use the same trailing remove action as every other removable filter. When there are no filters, the centered Add filter action stands alone; the duplicate header add and footer Done controls are hidden. Clear all asks for confirmation, removes editable filters without closing the sheet, and preserves read-only filters. Opening the rest of a row edits that filter with Cancel and Apply. Add filter opens directly when no filter exists and leaves search unfocused until the user chooses it; when the config names a content-search field it carries that search with inline suggestions. Creating a filter drills field → operator (radios, only when a field has more than one) → value. A value editor that is the sheet’s only section sits directly on the sheet surface; multiple sections use separate muted containers. The previous step remains open beneath the current standalone BottomSheet, so Escape, a scrim press, or a downward swipe dismisses the current sheet and reveals that retained step; the Add filter header stays action-free. the stack keeps one scrim and blocks covered sheets. Single-value choices use persistent radio indicators and multi-value choices use persistent checkbox indicators. Searchable string and entity lists and date calendars remain inline in the value sheet; date-only and date-range selections honor timezoneID, while date-time operators keep their date-and-time input. Announcements made while a sheet is open are delivered inside that dialog. Filters remain keyed by identity across controlled reorder, stale filters stay visible and removable, and controlled removals re-home focus. The scroll viewport reaches the sheet edge while padded inner content aligns with the fixed header. Fields whose only operators are nested are left out with a development warning.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Try this in Lab/canary on touch layouts to validate the flow; the API mirrors Core PowerSearch so graduating is an import swap.',
      },
      {
        guidance: true,
        description:
          'Pass timezoneID whenever filters carry dates, so tokens, rows, and editors agree on the calendar day.',
      },
      {
        guidance: false,
        description:
          'Do not switch between MobilePowerSearch and PowerSearch while a sheet is open: the two keep separate draft state.',
      },
      {
        guidance: false,
        description:
          'Do not ship stable product on this Lab API; it has no theming, i18n, or spec contract yet.',
      },
    ],
    anatomy: [
      {
        name: 'Trigger field',
        required: true,
        description:
          'Bordered field with display-only tokens; the entire field opens the sheet.',
      },
      {
        name: 'Filters sheet',
        required: true,
        description:
          'Tall sheet with a heading, an Add filter icon button, editable rows with direct trailing remove actions, and sticky Clear all plus Done.',
      },
      {
        name: 'Add filter sheet',
        required: true,
        description:
          'A full-width Done footer when entered directly; otherwise the action-free header is followed by a field list grouped under General or each configured field group (searchable past eight fields), or the content search with inline suggestions.',
      },
      {
        name: 'Value sheet',
        required: true,
        description:
          'Field or field-and-operator title, operator radios when needed, the value editor, and Cancel plus Add filter or Apply. String and entity lists search and select inline in the current sheet; date-only and date-range values use an inline Calendar.',
      },
    ],
  },
};
