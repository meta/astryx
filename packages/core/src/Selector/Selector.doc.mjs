// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Field',
    required: false,
    description:
      'Standalone Field shell that provides the label and optional supporting content; omitted inside InputGroup.',
  },
  {
    name: 'Trigger',
    required: true,
    description:
      'Painted control that displays the current selection or placeholder and opens the selection surface when editable.',
  },
  {
    name: 'Icon-rendered start icon',
    required: false,
    description:
      'Optional leading semantic icon or icon component rendered through Icon.',
  },
  {
    name: 'Caller-rendered start content',
    required: false,
    description:
      'Optional arbitrary React content rendered directly at the start of the trigger.',
  },
  {
    name: 'Trigger clear button',
    required: false,
    description:
      'Shared clear action that removes the selected value when hasClear is enabled.',
  },
  {
    name: 'Status icon',
    required: false,
    description:
      'Status glyph shown in place of the disclosure indicator for attached or tooltip status.',
  },
  {
    name: 'Indicator icon',
    required: false,
    description:
      'Trailing chevron shown when status presentation does not replace it; reflects collapsed or expanded state.',
  },
  {
    name: 'Search row',
    required: false,
    description:
      'Panel header with a borderless search input and optional clear action.',
  },
  {
    name: 'Search icon',
    required: false,
    description:
      'Leading magnifier rendered through Icon inside the search row.',
  },
  {
    name: 'Search clear button',
    required: false,
    description:
      'Shared clear action shown in the search row while a query is present.',
  },
  {
    name: 'Option row',
    required: false,
    description: 'Selectable row for one supplied option.',
  },
  {
    name: 'SelectorOption-rendered content',
    required: false,
    description:
      'Option content rendered with SelectorOption, either by the default renderer or by renderOption when it returns SelectorOption.',
  },
  {
    name: 'Bare caller-rendered option content',
    required: false,
    description:
      'Arbitrary content returned directly by renderOption without opting into SelectorOption.',
  },
  {
    name: 'Option selection indicator',
    required: false,
    description:
      'Resolved selection mark rendered for each option in its checked or unchecked state. Its layout space collapses when the resolved indicator draws nothing.',
  },
  {
    name: 'Option divider',
    required: false,
    description:
      'Divider supplied in the public options data to separate adjacent option groups.',
  },
  {
    name: 'Section heading',
    required: false,
    description: 'Visible heading for a labeled group of option rows.',
  },
  {
    name: 'Empty state',
    required: false,
    description:
      'Message shown when the shared panel content has no options or no search matches.',
  },
  {
    name: 'Pointer popup',
    required: false,
    description:
      'Anchored painted surface that hosts the shared panel content for popover presentation.',
  },
  {
    name: 'Touch sheet heading',
    required: false,
    description:
      'Heading above the shared panel content in bottom-sheet presentation.',
  },
  {
    name: 'Touch sheet',
    required: false,
    description:
      'BottomSheet surface that hosts the same panel content for bottom-sheet presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Selector',
  displayName: 'Selector',
  group: 'Selector',
  category: 'Form Controls',
  keywords: [
    'selector',
    'select',
    'dropdown',
    'combobox',
    'picker',
    'listbox',
    'chooser',
    'autocomplete',
    'option',
    'selectmenu',
  ],
  theming: {
    targets: [
      {
        className: 'astryx-selector',
        visualProps: ['variant', 'size', 'status'],
        states: ['disabled', 'readonly'],
      },
      {className: 'astryx-selector-option'},
      {
        className: 'astryx-selector-option-row',
        visualProps: ['size'],
        states: ['selected', 'disabled'],
      },
      {className: 'astryx-selector-search'},
      {className: 'astryx-selector-section-heading'},
      {className: 'astryx-selector-empty-state'},
      {className: 'astryx-selector-indicator-icon', states: ['state']},
      {className: 'astryx-selector-check'},
      {className: 'astryx-selector-popup'},
    ],
  },
  description: 'Dropdown selector for choosing from a list of options.',
  playground: {
    defaults: {
      label: 'Fruit',
      options: [
        {value: 'apple', label: 'Apple'},
        {value: 'orange', label: 'Orange'},
        {value: 'banana', label: 'Banana'},
      ],
    },
  },
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text for accessibility.',
      required: true,
    },
    {
      name: 'options',
      type: 'SelectorOption[]',
      description:
        'Array of items: strings, objects with value/label/description/icon/disabled, dividers ({type: "divider"}), or sections ({type: "section", title, options}).',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: 'Currently selected value.',
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when the selection changes.',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows a clear (×) button when a value is selected. When true, onChange also accepts null to signal the user cleared the selection.',
      default: 'false',
    },
    {
      name: 'hasSearch',
      type: 'boolean',
      description:
        'Whether to show a search input for filtering options. As the user types, the match count (or "No results found") is announced to screen readers via a polite live region. The search field has built-in affordances: a leading magnifier icon and, once a query is typed, a trailing clear (✕) button that resets the query and returns focus to the input.',
      default: 'false',
    },
    {
      name: 'searchPlaceholder',
      type: 'string',
      description: 'Placeholder text for the search input.',
      default: "'Search...'",
    },
    {
      name: 'emptyText',
      type: 'ReactNode',
      description:
        'Content shown in the dropdown panel when there are no options to show, and announced in a polite live region when the panel opens. The announcement is the text this content renders, read from the DOM, so an element is announced as written and aria-hidden parts are left out of both. Not shown while isLoading.',
      default: "'No options'",
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        'Content shown in the dropdown panel when a search query matches no options, and announced in a polite live region at the same time. The announcement is the text this content renders, read from the DOM, so an element is announced as written and aria-hidden parts are left out of both.',
      default: "'No results found'",
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown when no value is selected.',
      default: "'Select...'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant for the selector.',
      default: "'md'",
    },
    {
      name: 'variant',
      type: "'input' | 'secondary' | 'ghost'",
      description:
        'Visual trigger style. input is the bordered input treatment for forms; secondary matches the secondary buttons of the active theme (borderless and neutral-filled by default) for navs and toolbars; ghost is borderless and transparent, matching ghost buttons for toolbar usage.',
      default: "'input'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disables the selector.',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Makes the selector read-only: the selected value stays visible, focusable, and included in form submission, and retains its combobox identity with aria-readonly. The selection surface, clear action, and disclosure indicator are removed. Unlike isDisabled, the control is not dimmed. isDisabled takes precedence when both are set.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'The HTML name attribute for form submissions. Renders a hidden input carrying the selected value, like a native select.',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the selector is disabled. With isDisabled, shows the reason as a tooltip on hover and keyboard focus of the trigger, which stays focusable (aria-disabled) like every disabled selector; activation stays blocked. Use this instead of wrapping a disabled Selector in Tooltip.',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hides the label while keeping it accessible.',
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
      description: 'Marks the field as optional.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Marks the field as required.',
      default: 'false',
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description: 'Validation status with an optional message.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the bordered input and is only valid for the input variant; secondary and ghost selectors detach attached status messages by default. Use tooltip for compact toolbar controls.',
      default:
        "'attached' for input selectors; 'detached' for secondary and ghost selectors",
    },
    {
      name: 'renderOption',
      type: '(option: SelectorOptionData) => ReactNode',
      description:
        'Custom render function for each selectable option in the dropdown. Use this instead of JSX children; dividers and sections are rendered by the selector.',
    },
    {
      name: 'renderValue',
      type: '(option: SelectorOptionData) => ReactNode',
      description:
        'Custom render function for the selected option inside the closed trigger. A one-line value follows the active size token, including compact or wide spacing scales with icons or a clear control. Padding accommodates the trigger line box, and each extra line grows the control by one line (28/32/36 for one line and 48/52/56 for two with the default tokens). Content inherits the trigger line height; content that sets a larger font should set its own line height so the trigger grows to fit it. Inside an InputGroup the group owns the row height: a SelectorOption folds onto one line and ellipsizes, and any taller node is cut off at the row.',
    },
    {
      name: 'indicatorPosition',
      type: "'start' | 'end'",
      description:
        'Which logical edge of the option row carries a rendered selection mark. An empty mark consumes no space, so selected and unselected labels may shift or have different available width. end is the house convention shared with Typeahead and CommandPalette.',
      default: "'end'",
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description:
        'How the option list is presented. adaptive uses a bottom sheet on compact touch screens and an anchored popover otherwise.',
      default: "'popover'",
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned. Without a width the field follows its displayed value and can shrink with its row (the value truncates) instead of overflowing it; use `<HStack wrap="wrap">` for filter bars so selectors move to a second line on phones.',
    },
    {
      name: 'startIcon',
      type: 'IconType | ReactNode',
      description: 'Icon displayed at the start of the selector trigger.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: 'Shows a loading spinner in the trigger.',
      default: 'false',
    },
    {
      name: 'onClick',
      type: '(event: MouseEvent) => void',
      description:
        'Click handler on the trigger button. Runs before the selector toggles its surface; preventDefault() does not keep it closed.',
    },
    {
      name: 'onFocus',
      type: '(event: FocusEvent) => void',
      description:
        "Focus handler on the trigger button. Runs before the selector's own focus handling.",
    },
    {
      name: 'onKeyDown',
      type: '(event: KeyboardEvent) => void',
      description:
        'Key handler on the trigger button. Runs after the built-in keyboard model and is skipped for keys it handles and cancels.',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description:
        'Class name for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description:
        'Inline styles for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the element that paints the border and background and holds the value, icons, and end controls. Never the trigger button itself.',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: 'Class name for the visual control box.',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the visual control box.',
    },
  ],
  components: [{name: 'SelectorOption'}],
  usage: {
    description:
      'A dropdown selector for choosing a single value from a list of options. Supports labels, validation, descriptions, and required/optional states. Use it in forms and settings when presenting a moderate number of options. Keyboard typeahead matches a native select: typing on the focused closed trigger selects the matching option directly, repeated presses cycle through options sharing a first letter, and spaces count as match characters ("new y" reaches "New York"). With the menu open, typing moves the highlight and Enter commits. With hasSearch, typing on the closed trigger opens the popup and seeds the search input.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a visible label so users understand what they are selecting.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to organize options when the list exceeds ~8 items.',
      },
      {
        guidance: true,
        description:
          'Use renderOption for custom option rows. Do not pass SelectorOption directly as JSX children.',
      },
      {
        guidance: true,
        description:
          'Set a meaningful placeholder that hints at the expected selection (e.g. "Choose a country" not "Select...").',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup only when the selector needs a short prefix or suffix addon as part of one decorated input surface.',
      },
      {
        guidance: true,
        description:
          'Use variant="secondary" when a selector sits in a nav or toolbar beside secondary buttons or a segmented control, so it shares their treatment instead of reading as a form field. Use variant="ghost" when a selector sits in a toolbar with ghost buttons. If validation status is needed there, prefer statusVariant="tooltip" so the toolbar height stays compact.',
      },
      {
        guidance: true,
        description:
          'Use presentation="adaptive" when the selector should become a bottom sheet on compact touch screens.',
      },
      {
        guidance: false,
        description:
          'Use for action menus; use Dropdown Menu for triggering commands or navigation.',
      },
      {
        guidance: false,
        description:
          'Use when there are only two options; use a SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Use Selector for navigation; links should be links, not dropdown options.',
      },
      {
        guidance: false,
        description:
          'Use for yes/no or on/off choices; use Switch or CheckboxInput instead.',
      },
      {
        guidance: false,
        description:
          'Put more than ~20 options without sections; consider Typeahead for large lists.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Selector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
    anatomy,
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'A dropdown selector for choosing a single value from a list of options. Supports labels, validation, descriptions, and required/optional states. Use it in forms and settings when presenting a moderate number of options. Keyboard typeahead matches a native select: typing on the focused closed trigger selects the matching option directly, repeated presses cycle through options sharing a first letter, and spaces count as match characters ("new y" reaches "New York"). With the menu open, typing moves the highlight and Enter commits. With hasSearch, typing on the closed trigger opens the popup and seeds the search input.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a visible label so users understand what they are selecting.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to organize options when the list exceeds ~8 items.',
      },
      {
        guidance: true,
        description:
          'Use renderOption for custom option rows. Do not pass SelectorOption directly as JSX children.',
      },
      {
        guidance: true,
        description:
          'Set a meaningful placeholder that hints at the expected selection (e.g. "Choose a country" not "Select...").',
      },
      {
        guidance: false,
        description:
          'Use for action menus; use Dropdown Menu for triggering commands or navigation.',
      },
      {
        guidance: false,
        description:
          'Use when there are only two options; use a SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Use Selector for navigation; links should be links, not dropdown options.',
      },
      {
        guidance: false,
        description:
          'Use for yes/no or on/off choices; use Switch or CheckboxInput instead.',
      },
      {
        guidance: false,
        description:
          'Put more than ~20 options without sections; consider Typeahead for large lists.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Selector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
    anatomy,
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    description:
      'A dropdown selector for choosing a single value from a list of options. Supports labels, validation, descriptions, and required/optional states. Use it in forms and settings when presenting a moderate number of options. Keyboard typeahead matches a native select: typing on the focused closed trigger selects the matching option directly, repeated presses cycle through options sharing a first letter, and spaces count as match characters ("new y" reaches "New York"). With the menu open, typing moves the highlight and Enter commits. With hasSearch, typing on the closed trigger opens the popup and seeds the search input.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a visible label so users understand what they are selecting.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to organize options when the list exceeds ~8 items.',
      },
      {
        guidance: true,
        description:
          'renderOption for custom rows; do not pass SelectorOption as JSX children.',
      },
      {
        guidance: true,
        description:
          'Set a meaningful placeholder that hints at the expected selection (e.g. "Choose a country" not "Select...").',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup only when the selector needs a short prefix or suffix addon.',
      },
      {
        guidance: true,
        description:
          'Use variant="secondary" in navs/toolbars beside secondary buttons; use variant="ghost" in toolbars with ghost buttons; prefer statusVariant="tooltip" for compact validation status.',
      },
      {
        guidance: false,
        description:
          'Use for action menus; use Dropdown Menu for triggering commands or navigation.',
      },
      {
        guidance: false,
        description:
          'Use when there are only two options; use a SegmentedControl or radio buttons instead.',
      },
      {
        guidance: false,
        description:
          'Use Selector for navigation; links should be links, not dropdown options.',
      },
      {
        guidance: false,
        description:
          'Use for yes/no or on/off choices; use Switch or CheckboxInput instead.',
      },
      {
        guidance: false,
        description:
          'Put more than ~20 options without sections; consider Typeahead for large lists.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Selector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
    anatomy,
  },
};
