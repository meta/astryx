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
        'Shows Clear all in the Filters sheet footer. Read-only filters are never cleared.',
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
      'Lab prototype for trying the touch PowerSearch flow. Choose it explicitly on touch layouts (for example `const Search = isTouch ? MobilePowerSearch : PowerSearch`); it never switches on pointer type by itself. The whole field is one Manage filters trigger showing display-only tokens. Tapping it opens a tall Filters sheet listing each filter as a chevron row with its value in bold, Add filter at the top right, and sticky Clear all and Done actions. Opening a row edits that filter in a sheet with Cancel, Apply, and Remove. Add filter opens directly when no filter exists; when the config names a content-search field it carries that search with inline suggestions. Creating a filter drills field → operator (radios, only when a field has more than one) → value. Each step is its own BottomSheet; moving between steps is a BottomSheet replace handoff (the entering step rises above the leaving one under the one scrim), so the steps need no BottomSheetSwitcher. Single and multi-value choices are full-width rows with trailing checks; other value types use the matching Astryx input. Fields whose only operators are nested are left out with a development warning.',
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
          'Tall sheet with a heading, Add filter, a divided list of chevron rows, and sticky Clear all plus Done.',
      },
      {
        name: 'Add filter sheet',
        required: true,
        description:
          'Back, a field list grouped by field group (searchable past eight fields), or the content search with inline suggestions.',
      },
      {
        name: 'Value sheet',
        required: true,
        description:
          'Field or field-and-operator title, operator radios when needed, the value editor, and Cancel plus Add filter or Apply and Remove. A list value (string_list, entity_list) edits through the Lab MobileTokenizer: its trigger shows the staged tokens in the step, and tapping it opens a second, searchable sheet titled with the field name.',
      },
    ],
  },
};
