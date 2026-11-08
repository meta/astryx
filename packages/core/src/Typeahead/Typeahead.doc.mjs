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
    name: 'Input surface',
    required: true,
    description:
      'Painted control surface containing the editable input or the selected token.',
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
      'Optional arbitrary React content rendered directly at the start of the input surface.',
  },
  {
    name: 'Selected token',
    required: false,
    description:
      'Token that presents the selected item while the control is not in edit mode.',
  },
  {
    name: 'Spinner',
    required: false,
    description:
      'Loading indicator shown at the end of the input surface while a search is in flight.',
  },
  {
    name: 'Clear button',
    required: false,
    description:
      'Shared clear action that removes the selected item when hasClear is enabled.',
  },
  {
    name: 'Dropdown',
    required: false,
    description:
      'Anchored listbox surface containing the current search results.',
  },
  {
    name: 'Empty state',
    required: false,
    description: 'Message shown after a completed search returns no results.',
  },
  {
    name: 'Result row',
    required: false,
    description:
      'Stable option wrapper that owns highlight, selection, pointer, and keyboard behavior.',
  },
  {
    name: 'Default item content',
    required: false,
    description:
      'Standard TypeaheadItem label and supporting content rendered inside a result row when renderItem and item.element are absent.',
  },
  {
    name: 'Caller-rendered item content',
    required: false,
    description:
      'Caller-owned result content supplied through renderItem or item.element inside the stable result row.',
  },
  {
    name: 'Result group heading',
    required: false,
    description: 'Visible heading for a labeled group of result rows.',
  },
  {
    name: 'Selected result state',
    required: false,
    description:
      'Selected styling and trailing check presented on the current result row.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Typeahead',
  displayName: 'Typeahead',
  group: 'Typeahead',
  category: 'Form Controls',
  keywords: [
    'typeahead',
    'autocomplete',
    'combobox',
    'searchbox',
    'autosuggest',
    'select',
    'dropdown',
    'lookup',
    'searchable',
    'suggestion',
    'picker',
  ],
  description:
    'Styled typeahead with label, description, validation, and all field features. Wraps BaseTypeahead with Field for the primary use case.',
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the input.',
      required: true,
    },
    {
      name: 'searchSource',
      type: 'SearchSource<T>',
      description:
        'Data source providing search and bootstrap methods. `search(query, context)` may call `context.update(items)` to show matches it already has before it returns; the value it returns is the final list, and every list after the first for a query keeps the shown rows first and adds new rows after them.',
      required: true,
    },
    {
      name: 'value',
      type: 'T | null',
      description: 'Currently selected item, or null if nothing is selected.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(item: T | null) => void',
      description: 'Called when the selection changes.',
      required: true,
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Input placeholder text.',
    },
    {
      name: 'hasEntriesOnFocus',
      type: 'boolean',
      description: 'Show bootstrap results on focus before typing.',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: 'Show clear button to deselect the current value.',
      default: 'true',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the input. The field keeps its tab stop: it is announced as disabled (aria-disabled), is read-only, and opens and picks nothing.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus, and the reason describes the field (activation stays blocked). Use this instead of wrapping a disabled Typeahead in Tooltip, so the reason is attached to the field itself.',
    },
    {
      name: 'maxMenuItems',
      type: 'number',
      description: 'Maximum number of dropdown items to display.',
      default: '10',
    },
    {
      name: 'minQueryLength',
      type: 'number',
      description:
        'Minimum query length before the search source is queried. Below it no search runs and the menu stays closed.',
      default: '1',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description:
        'Validation status object with type and message for error/warning/success states.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip reveals the message in an info-tip button.',
      default: "'attached'",
    },
    {
      name: 'renderItem',
      type: '(item: T) => ReactNode',
      description:
        'Custom render function for dropdown items. Default renders TypeaheadItem.',
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
      name: 'isRequired',
      type: 'boolean',
      description: 'Marks the field as required.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Shows an optional indicator on the label.',
      default: 'false',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text shown on the label.',
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        'Content shown when the query matched nothing. Takes a ReactNode, so the dead end can carry a link or a create row. Announced in a polite live region as the text it renders, read from the DOM; aria-hidden parts stay out of both, and content that renders no text announces nothing. null counts as not given, like undefined, and falls through to the default; pass an empty string to render nothing.',
      default: "'No results found'",
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Auto-focus the input on mount.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Input and token size.',
      default: "'md'",
    },
    {
      name: 'debounceMs',
      type: 'number',
      description:
        'Debounce delay in ms before triggering search. Set to 0 for synchronous sources, and for a source that shows local matches through `context.update` and delays its own server request.',
      default: '150',
    },
    {
      name: 'onChangeQuery',
      type: '(query: string) => void',
      description: 'Callback fired when the search query text changes.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback when the dropdown opens or closes.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'startIcon',
      type: 'IconType | ReactNode',
      description: 'SVG icon component displayed at the start of the input.',
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
        'StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input.',
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
  components: [{name: 'BaseTypeahead'}, {name: 'TypeaheadItem'}],
  theming: {
    targets: [
      {className: 'astryx-typeahead', visualProps: ['status', 'size']},
      {className: 'astryx-typeahead-dropdown'},
      {className: 'astryx-typeahead-empty-state'},
      {className: 'astryx-typeahead-item'},
    ],
  },
  usage: {
    anatomy,
    description:
      'A searchable input for selecting a single item from a large or dynamic dataset. Results appear as the user types, with support for async data sources, debounced search, and custom item rendering. Use it when the option list is too large for a Selector dropdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide descriptive placeholder text that hints at what users can search for.',
      },
      {
        guidance: true,
        description:
          'Show suggestions on focus when users benefit from seeing popular or recent options before typing.',
      },
      {
        guidance: true,
        description:
          'Add a search delay for remote data sources to avoid excessive network requests.',
      },
      {
        guidance: true,
        description:
          'For a remote source, show the matches the page already has at once: call `context.update(local)` in `search`, pass `debounceMs={0}`, delay the server request in the source, and return the server answer with the shown rows first.',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup when the typeahead needs a single-line prefix or suffix addon.',
      },
      {
        guidance: false,
        description:
          'Use for short, static option lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description: 'Use for multi-selection; use Tokenizer instead.',
      },
      {
        guidance: false,
        description:
          'Place multiple Typeaheads adjacent to each other without clear labels differentiating them.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Typeahead in Tooltip to explain why it is disabled; disabled triggers swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'A searchable input for selecting a single item from a large or dynamic dataset. Results appear as the user types, with support for async data sources, debounced search, and custom item rendering. Use it when the option list is too large for a Selector dropdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide descriptive placeholder text that hints at what users can search for.',
      },
      {
        guidance: true,
        description:
          'Show suggestions on focus when users benefit from seeing popular or recent options before typing.',
      },
      {
        guidance: true,
        description:
          'Add a search delay for remote data sources to avoid excessive network requests.',
      },
      {
        guidance: true,
        description:
          'For a remote source, show the matches the page already has at once: call `context.update(local)` in `search`, pass `debounceMs={0}`, delay the server request in the source, and return the server answer with the shown rows first.',
      },
      {
        guidance: false,
        description:
          'Use for short, static option lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description: 'Use for multi-selection; use Tokenizer instead.',
      },
      {
        guidance: false,
        description:
          'Place multiple Typeaheads adjacent to each other without clear labels differentiating them.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Typeahead in Tooltip to explain why it is disabled; disabled triggers swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Searchable dropdown for single-item selection w/ keyboard navigation. Supports async+sync search via searchSource interface.',
  usage: {
    description:
      'A searchable input for selecting a single item from a large or dynamic dataset. Results appear as the user types, with support for async data sources, debounced search, and custom item rendering. Use it when the option list is too large for a Selector dropdown.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide descriptive placeholder text that hints at what users can search for.',
      },
      {
        guidance: true,
        description:
          'Show suggestions on focus when users benefit from seeing popular or recent options before typing.',
      },
      {
        guidance: true,
        description:
          'Add a search delay for remote data sources to avoid excessive network requests.',
      },
      {
        guidance: true,
        description:
          'For a remote source, show the matches the page already has at once: call `context.update(local)` in `search`, pass `debounceMs={0}`, delay the server request in the source, and return the server answer with the shown rows first.',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup when the typeahead needs a single-line prefix or suffix addon.',
      },
      {
        guidance: false,
        description:
          'Use for short, static option lists; use Selector for better discoverability.',
      },
      {
        guidance: false,
        description: 'Use for multi-selection; use Tokenizer instead.',
      },
      {
        guidance: false,
        description:
          'Place multiple Typeaheads adjacent to each other without clear labels differentiating them.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled Typeahead in Tooltip to explain why it is disabled; disabled triggers swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};
