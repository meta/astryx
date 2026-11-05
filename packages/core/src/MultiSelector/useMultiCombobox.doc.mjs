// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useMultiCombobox',
  displayName: 'useMultiCombobox',
  group: 'MultiSelector',
  keywords: [
    'combobox',
    'multi-select',
    'multiselect',
    'listbox',
    'grid',
    'toggle',
    'highlight',
    'active option',
    'aria-activedescendant',
    'keyboard',
    'headless',
    'apg',
    'accessibility',
    'a11y',
  ],
  params: [
    {
      name: 'options',
      type: 'UseMultiComboboxOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.selectableItems',
      type: 'MultiSelectorOptionData[]',
      description:
        'The options in the same order as they render. Options with `disabled` cannot be toggled and are skipped while moving through the open list; ArrowDown or ArrowUp that opens the list still lands on the first or last option.',
      required: true,
    },
    {
      name: 'options.isOpen',
      type: 'boolean',
      description: 'Whether the list is shown. The caller owns this state.',
      required: true,
    },
    {
      name: 'options.onOpen',
      type: '() => unknown',
      description:
        'Called to show the list. Return `false` to refuse; the hook then leaves the highlight alone.',
      required: true,
    },
    {
      name: 'options.onClose',
      type: '() => void',
      description: 'Called to hide the list. The highlight resets first.',
      required: true,
    },
    {
      name: 'options.onToggle',
      type: '(itemValue: string) => void',
      description:
        'Called with the value of the option to add or remove. Toggling keeps the list open.',
      required: true,
    },
    {
      name: 'options.listboxId',
      type: 'string',
      description:
        "The listbox (or grid) element's id. Option and action-cell ids are derived from it.",
      required: true,
    },
    {
      name: 'options.hasSearch',
      type: 'boolean',
      description:
        'Whether the list has its own search field. Space then types instead of toggling, opening by a press or Enter does not pre-highlight (ArrowDown and ArrowUp still open on the first and last option), Delete and Backspace edit the query, and type-to-select is off. Home and End still jump to the first and last option, so a search input that keeps them for the caret should stop them before this handler and rely on PageUp and PageDown.',
      default: 'false',
    },
    {
      name: 'options.onClear',
      type: '() => void',
      description:
        'Clears every selected value. When provided, Delete or Backspace on the closed control clears them, so clearing is not pointer-only. Ignored while the list is open or with `hasSearch`.',
    },
    {
      name: 'options.hasValue',
      type: 'boolean',
      description:
        'Whether anything is selected. The Delete and Backspace clear is skipped when false.',
      default: 'false',
    },
    {
      name: 'options.isGrid',
      type: 'boolean',
      description:
        "Whether each row pairs an option cell with an action cell. The inline-end arrow then moves the highlight to the row's action and the inline-start arrow back, following visual direction in right-to-left layouts, and Enter on the action runs `onActivateAction` instead of toggling.",
      default: 'false',
    },
    {
      name: 'options.rowHasAction',
      type: '(index: number) => boolean',
      description:
        'In a grid, whether the row at `index` has an action cell to move to.',
    },
    {
      name: 'options.onActivateAction',
      type: '(index: number) => void',
      description:
        "In a grid, runs the control in the highlighted row's action cell. The selection does not change.",
    },
    {
      name: 'options.isDisabled',
      type: 'boolean',
      description: 'Whether the control ignores clicks and keys.',
      default: 'false',
    },
  ],
  returns: [
    {
      name: 'highlightedIndex',
      type: 'number',
      description: 'Index of the active row, or -1 when none is active.',
    },
    {
      name: 'setHighlightedIndex',
      type: '(index: number) => void',
      description:
        "Sets the active row, for example after filtering. The highlight lands on the row's option cell.",
    },
    {
      name: 'highlightedCell',
      type: "'option' | 'action'",
      description:
        "Which cell of the active row is highlighted; `'action'` only in a grid.",
    },
    {
      name: 'activeDescendantId',
      type: 'string | undefined',
      description:
        "The id to pass as the control's `aria-activedescendant`: the active option, or its action cell in a grid. Undefined while the list is closed or nothing is active.",
    },
    {
      name: 'getItemId',
      type: '(index: number) => string',
      description: 'The id to render on the option at `index`.',
    },
    {
      name: 'getActionCellId',
      type: '(index: number) => string',
      description:
        'In a grid, the id to render on the action cell of row `index`.',
    },
    {
      name: 'onTriggerClick',
      type: '() => void',
      description: 'Toggles the list from a press on the control.',
    },
    {
      name: 'onKeyDown',
      type: '(e: React.KeyboardEvent) => void',
      description:
        'Key handler for the control that keeps focus. ArrowDown and ArrowUp open the list or move the active row; Enter (and Space without search) toggles the active option and keeps the list open; Escape and Tab close it; Home, End, PageUp and PageDown jump to the first or last option; without search, typed characters move to the first option whose label starts with them.',
    },
    {
      name: 'onItemMouseEnter',
      type: "(item: MultiSelectorOptionData, index: number, cell?: 'option' | 'action') => void",
      description:
        'Makes the hovered option, or its action cell, active without scrolling the list or moving focus.',
    },
  ],
  usage: {
    description:
      'Tracks the active option of a multi-select combobox and handles its keys, while DOM focus stays on the control. It powers MultiSelector; unlike useCombobox, toggling an option keeps the list open, and rows can carry an action cell. It renders nothing and sets no attributes: the caller renders the control and the list, and wires the ARIA attributes from what it returns.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Render each option with `id={getItemId(index)}` and pass `activeDescendantId` as the control's `aria-activedescendant`.",
      },
      {
        guidance: true,
        description:
          'Use `isGrid` only when rows carry a control next to the option; give each action cell `id={getActionCellId(index)}`.',
      },
      {
        guidance: true,
        description:
          'Announce the number of results through useAnnounce when the options change for a new query.',
      },
      {
        guidance: false,
        description:
          'Close the list after each toggle; a multi-select stays open so several options can be picked in a row.',
      },
    ],
  },
  relatedComponents: ['MultiSelector'],
  relatedHooks: ['useCombobox', 'useAnnounce'],
  importPath: '@astryxdesign/core/MultiSelector',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Multi-select combobox state + keys; focus stays on control. Powers MultiSelector. Toggle keeps list open; rows may carry an action cell (grid). Renders nothing, sets no attrs: caller renders + wires ARIA.',
  paramDescriptions: {
    options: 'config.',
    'options.selectableItems':
      'options in render order; disabled ones not toggleable, skipped while moving in open list (ArrowDown/Up opening still lands first / last).',
    'options.isOpen': 'list shown; caller owns state.',
    'options.onOpen':
      'show list; return false to refuse (highlight untouched).',
    'options.onClose': 'hide list; highlight resets first.',
    'options.onToggle': 'add / remove value; list stays open.',
    'options.listboxId':
      'listbox / grid id; option + action-cell ids derive from it.',
    'options.hasSearch':
      'own search field: Space types, press / Enter opening does not pre-highlight (ArrowDown/Up still first / last), Delete / Backspace edit query, no type-to-select. Home / End still jump; stop them first to keep them for the caret, use PageUp / PageDown.',
    'options.onClear':
      'clear all; Delete / Backspace on closed control. ignored when open or hasSearch.',
    'options.hasValue': 'anything selected; clear skipped when false.',
    'options.isGrid':
      'rows = option + action cell; inline-end / inline-start arrows move between them (RTL-aware); Enter on action -> onActivateAction.',
    'options.rowHasAction': 'grid: row at index has an action cell.',
    'options.onActivateAction':
      "grid: run highlighted row's action; selection unchanged.",
    'options.isDisabled': 'ignore clicks + keys.',
  },
  returnDescriptions: {
    highlightedIndex: 'active row index, -1 = none.',
    setHighlightedIndex: 'set active row (lands on option cell).',
    highlightedCell: "'option' | 'action' (action only in grid).",
    activeDescendantId:
      'control aria-activedescendant: active option or its action cell; undefined when closed / none.',
    getItemId: 'id for option at index.',
    getActionCellId: 'grid: id for action cell of row index.',
    onTriggerClick: 'toggle list from a press on control.',
    onKeyDown:
      'control keydown: ArrowDown/Up open or move; Enter (Space w/o search) toggles, stays open; Escape / Tab close; Home / End / PageUp / PageDown jump; typed chars jump by label prefix (w/o search).',
    onItemMouseEnter:
      'hover makes option / action cell active; no scroll, no focus move.',
  },
  usage: {
    description:
      'Headless multi-select combobox: active option + keys, focus stays on control; toggle keeps list open. Caller renders + wires ARIA.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Option id = getItemId(index); control aria-activedescendant = activeDescendantId.',
      },
      {
        guidance: true,
        description:
          'isGrid only when rows carry a control; action cell id = getActionCellId(index).',
      },
      {
        guidance: true,
        description: 'Announce result count via useAnnounce on new query.',
      },
      {
        guidance: false,
        description: 'Close after each toggle; multi-select stays open.',
      },
    ],
  },
};
