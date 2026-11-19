// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Dialog',
    required: true,
    description: 'Modal surface that contains the command palette.',
  },
  {
    name: 'Input',
    required: true,
    description:
      'Search region containing the query field and its supporting visuals.',
  },
  {
    name: 'Search glyph',
    required: true,
    description: 'Search symbol rendered by Icon in the default Input.',
  },
  {
    name: 'Query field',
    required: true,
    description: 'Native text field used to enter a search query.',
  },
  {
    name: 'Loading spinner',
    required: false,
    description:
      'Spinner shown in the default Input while a search is pending.',
  },
  {
    name: 'List',
    required: true,
    description:
      'Scrollable results container: a listbox while selectable results exist, otherwise the Empty state as plain content.',
  },
  {
    name: 'Item',
    required: false,
    description: 'Selectable command result rendered inside the List.',
  },
  {
    name: 'Group',
    required: false,
    description: 'Optional collection of Items that share a heading.',
  },
  {
    name: 'Group heading',
    required: false,
    description: 'Visible heading rendered for a Group.',
  },
  {
    name: 'Empty',
    required: false,
    description: 'Message shown when the current result set is empty.',
  },
  {
    name: 'Footer',
    required: false,
    description:
      'Footer region for default keyboard guidance or caller-provided content.',
  },
  {
    name: 'Keyboard shortcut',
    required: false,
    description:
      'Painted key badges rendered by Kbd in the default Footer guidance.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CommandPalette',
  displayName: 'Command Palette',
  group: 'CommandPalette',
  category: 'Overlay',
  keywords: [
    'command',
    'spotlight',
    'launcher',
    'omnibox',
    'quicksearch',
    'palette',
    'finder',
    'search',
    'modal',
    'dialog',
    'navigation',
    'commandmenu',
    'cmdk',
  ],
  description:
    'Root component. Manages open state, search, keyboard navigation, and composition slots.',
  // Intentionally a contained isInline preview, not playground.overlay: the
  // component stays visible on load and knobs stay live, whereas a real
  // showModal() overlay makes the page inert — see ComponentPlaygroundConfig.overlay
  // in docs-types.ts (#3657).
  playground: {
    defaults: {
      isOpen: true,
      isInline: true,
      onOpenChange: undefined,
    },
  },
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the command palette dialog is visible.',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Called when the palette visibility changes.',
      required: true,
    },
    {
      name: 'searchSource',
      type: 'SearchSource<T>',
      description:
        'Search source providing items via search(query) and bootstrap(). Use createStaticSource for static lists.',
      required: true,
    },
    {
      name: 'input',
      type: 'ReactNode',
      description:
        'Input slot. Defaults to CommandPaletteInput with standard behavior.',
      default: '<CommandPaletteInput />',
      slotElements: [
        {
          __element: 'TextInput',
          props: {
            label: 'Input',
            placeholder: 'Type here...',
          },
        },
      ],
    },
    {
      name: 'footer',
      type: 'ReactNode',
      description:
        'Footer slot. Defaults to CommandPaletteFooter showing keyboard hints.',
      default: '<CommandPaletteFooter />',
      slotElements: [
        {
          __element: 'Text',
          props: {
            type: 'body',
          },
          children: 'Footer content',
        },
      ],
    },
    {
      name: 'renderItem',
      type: '(item: T, isSelected: boolean) => ReactNode',
      description:
        'Per-item render function for non-interactive presentation content such as labels, icons, descriptions, and shortcut hints. Do not return buttons or links inside the option. Auto-grouping by auxiliaryData.group is preserved. When omitted, renders label text.',
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description: 'Content shown when a search query returns no results.',
      default: "'No results'",
    },
    {
      name: 'emptyBootstrapText',
      type: 'ReactNode',
      description:
        'Content shown when there is no search query and bootstrap() returns nothing.',
      default: "'Type to search'",
    },
    {
      name: 'value',
      type: 'string',
      description: 'Controlled selected value for picker mode.',
    },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      description: 'Called when the selected value changes in picker mode.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the command palette dialog.',
      default: "'Command palette'",
    },
    {
      name: 'width',
      type: 'number | string',
      description: 'Width of the dialog.',
      default: '640',
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description: 'Maximum height of the dialog.',
      default: '480',
    },
    {
      name: 'isInline',
      type: 'boolean',
      description:
        'Renders command palette content inline without modal behavior. Automatically disables input auto-focus and initial highlighted-item auto-scroll. For documentation previews and showcases only.',
      default: 'false',
    },
  ],
  components: [
    {name: 'CommandPaletteInput'},
    {name: 'CommandPaletteList'},
    {name: 'CommandPaletteItem'},
    {name: 'CommandPaletteGroup'},
    {name: 'CommandPaletteFooter'},
    {name: 'CommandPaletteEmpty'},
  ],
  theming: {
    targets: [
      {className: 'astryx-command-palette-empty'},
      {className: 'astryx-command-palette-footer'},
      {className: 'astryx-command-palette-group'},
      {className: 'astryx-command-palette-group-heading'},
      {className: 'astryx-command-palette-input'},
      {
        className: 'astryx-command-palette-item',
        states: ['highlighted', 'selected', 'disabled'],
      },
      {className: 'astryx-command-palette-list'},
    ],
  },
  usage: {
    anatomy,
    description:
      'CommandPalette is a searchable dialog for quick access to commands, navigation, and actions. Use it as a keyboard-driven launcher powered by SearchSource for filtering and selection.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a searchSource with bootstrap results so users see useful options before typing.',
      },
      {
        guidance: true,
        description:
          'Use auxiliaryData.group on items to automatically organize results into labeled sections.',
      },
      {
        guidance: true,
        description:
          'Provide a specific label when more than one command palette can appear in the same product surface.',
      },
      {
        guidance: true,
        description:
          'Keep renderItem content non-interactive; each rendered row is one option, so buttons and links cannot be nested inside it.',
      },
      {
        guidance: false,
        description:
          'Intercept query-field keyboard events without preserving active IME composition and native Home/End caret movement.',
      },
      {
        guidance: false,
        description:
          'Use CommandPalette for simple dropdowns or menus; use Menu or Selector for inline selections.',
      },
      {
        guidance: false,
        description:
          'Add too many groups or items; curate results to keep the palette fast and scannable.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    anatomy,
    description:
      'CommandPalette is a searchable dialog for quick access to commands, navigation, and actions. Use it as a keyboard-driven launcher powered by SearchSource for filtering and selection.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a searchSource with bootstrap results so users see useful options before typing.',
      },
      {
        guidance: true,
        description:
          'Use auxiliaryData.group on items to automatically organize results into labeled sections.',
      },
      {
        guidance: true,
        description:
          'Provide a specific label when more than one command palette can appear in the same product surface.',
      },
      {
        guidance: true,
        description:
          'Keep renderItem content non-interactive; each rendered row is one option, so buttons and links cannot be nested inside it.',
      },
      {
        guidance: false,
        description:
          'Intercept query-field keyboard events without preserving active IME composition and native Home/End caret movement.',
      },
      {
        guidance: false,
        description:
          'Use CommandPalette for simple dropdowns or menus; use Menu or Selector for inline selections.',
      },
      {
        guidance: false,
        description:
          'Add too many groups or items; curate results to keep the palette fast and scannable.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'searchSource-driven command palette dialog; filtering, keyboard nav, grouping, selection; same SearchSource interface as Typeahead',
  usage: {
    anatomy,
    description:
      'CommandPalette is a searchable dialog for quick access to commands, navigation, and actions. Use it as a keyboard-driven launcher powered by SearchSource for filtering and selection.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a searchSource with bootstrap results so users see useful options before typing.',
      },
      {
        guidance: true,
        description:
          'Use auxiliaryData.group on items to automatically organize results into labeled sections.',
      },
      {
        guidance: true,
        description:
          'Provide a specific label when more than one command palette can appear in the same product surface.',
      },
      {
        guidance: true,
        description:
          'Keep renderItem content non-interactive; each rendered row is one option, so buttons and links cannot be nested inside it.',
      },
      {
        guidance: false,
        description:
          'Intercept query-field keyboard events without preserving active IME composition and native Home/End caret movement.',
      },
      {
        guidance: false,
        description:
          'Use CommandPalette for simple dropdowns or menus; use Menu or Selector for inline selections.',
      },
      {
        guidance: false,
        description:
          'Add too many groups or items; curate results to keep the palette fast and scannable.',
      },
    ],
  },
};
