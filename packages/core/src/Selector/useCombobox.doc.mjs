// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCombobox',
  displayName: 'useCombobox',
  group: 'Selector',
  keywords: [
    'combobox',
    'listbox',
    'select',
    'dropdown',
    'highlight',
    'active option',
    'aria-activedescendant',
    'keyboard',
    'arrow keys',
    'headless',
    'autocomplete',
    'apg',
    'accessibility',
    'a11y',
  ],
  params: [
    {
      name: 'options',
      type: 'UseComboboxOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.selectableItems',
      type: 'ReadonlyArray<T extends {value: string; disabled?: boolean}>',
      description:
        'The options in the same order as they render: `SelectorOptionData`, or any option type with a string `value` and an optional `disabled`. Options with `disabled` cannot be picked and are skipped while moving through the open list; ArrowDown or ArrowUp that opens the list from `onKeyDown` still lands on the first or last option.',
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
      description:
        'Called when the hook hides the list; the hook resets the highlight first. When the caller closes the list itself (an outside press, say), it should also call `setHighlightedIndex(-1)`.',
      required: true,
    },
    {
      name: 'options.listboxId',
      type: 'string',
      description:
        "The listbox element's id. Option ids are derived from it through `getItemId`.",
      required: true,
    },
    {
      name: 'options.value',
      type: 'string',
      description:
        'The selected value. Without search, opening by a press, Enter or Space highlights it, or the first option when nothing is selected; ArrowDown and ArrowUp open on the first and last option.',
    },
    {
      name: 'options.onSelect',
      type: '(value: string) => void',
      description:
        'Called with the picked value. Picking also closes the list.',
    },
    {
      name: 'options.onClear',
      type: '() => void',
      description:
        'Clears the value. When provided, Delete or Backspace on the closed control clears it, so clearing is not pointer-only. Ignored while the list is open or with `hasSearch`.',
    },
    {
      name: 'options.hasSearch',
      type: 'boolean',
      description:
        'Whether the list has its own search field. Space then types instead of picking, opening by a press or Enter does not pre-highlight (ArrowDown and ArrowUp still open on the first and last option), and printable keys on the closed control go to `onSearchSeed`.',
      default: 'false',
    },
    {
      name: 'options.onSearchSeed',
      type: '(char: string) => void',
      description:
        'With `hasSearch`, receives each printable character except Space typed while the control has focus, opening the list first when it is closed, so type-to-find needs no separate open step.',
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
      description:
        'Index of the active option, or -1 when none is active. With `hasSearch`, opening by a press or Enter does not set one, so it stays -1 after the hook itself closes the list; ArrowDown and ArrowUp still open on the first or last option. Render it as the active option and name it in `aria-activedescendant` only while it points at a rendered option.',
    },
    {
      name: 'setHighlightedIndex',
      type: '(index: number) => void',
      description:
        'Sets the active option, for example from a filter that changes the options.',
    },
    {
      name: 'getItemId',
      type: '(index: number) => string',
      description:
        "The id to render on the option at `index`. Set the control's `aria-activedescendant` to `isOpen && highlightedIndex >= 0 && highlightedIndex < selectableItems.length ? getItemId(highlightedIndex) : undefined`, so it never names an option that does not exist, including in an empty list.",
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
        'Key handler for the control that keeps focus. ArrowDown and ArrowUp open the list or move the active option; Enter (and Space without search) picks it or opens the list; Escape and Tab close it; Home, End, PageUp and PageDown jump to the first or last option. An editable control that keeps Home and End for the caret does not pass them to this handler, as CommandPalette does.',
    },
    {
      name: 'onItemSelect',
      type: '(item: T) => void',
      description: 'Picks an option from a press on it, then closes the list.',
    },
    {
      name: 'onItemMouseEnter',
      type: '(item: T, index: number) => void',
      description:
        'Makes the hovered option active without scrolling the list or moving focus.',
    },
    {
      name: 'getFieldProps',
      type: '(props?: {onKeyDown?(event: React.KeyboardEvent): void}) => object',
      description:
        'Props for a single-line `input` you render: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` only while the listbox renders (`isOpen` with at least one option), `aria-activedescendant` only while an option is active, and the field\u2019s key handler. Pass your own `onKeyDown` here rather than beside the spread: it runs after the hook\u2019s handler unless that handler claimed the key, and it may be typed for its element.',
    },
    {
      name: 'getListboxProps',
      type: '() => object',
      description:
        'Props for the listbox you render, anywhere in the document, including the page\u2019s flow: its `id` and `role`, and a press handler that keeps focus in the field. Render it while `isOpen` and there are options, and name it with `aria-label` or `aria-labelledby`.',
    },
    {
      name: 'getOptionProps',
      type: '(index: number) => object',
      description:
        'Props for the option at `index`: its `id`, `role`, `aria-selected` (true on the active option), `aria-disabled` on a disabled one, a pointer move that makes it active without moving focus, and a press that picks it.',
    },
  ],
  usage: {
    description:
      'Tracks the active option of a single-select combobox and handles its keys, while DOM focus stays on the control. It powers Selector and CommandPalette; use it to build a combobox those components do not cover, including one over a single-line text field you render yourself, such as a search field whose results replace a page section, or an \u201cadd people\u201d field in a dialog. It renders nothing: you render the field, the listbox and the options, and spread `getFieldProps`, `getListboxProps` and `getOptionProps` onto them, or wire `role`, `aria-expanded`, `aria-controls` and `aria-activedescendant` yourself from `onKeyDown` and `getItemId` for a control such as a button.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Render each option with `id={getItemId(index)}` and set the control's `aria-activedescendant` only while `isOpen` and `highlightedIndex` points at a rendered option, as CommandPalette does.",
      },
      {
        guidance: true,
        description:
          "For type-to-select without a search field, run useTypeahead's handler first and fall through to this `onKeyDown` when it returns false, as Selector does.",
      },
      {
        guidance: true,
        description:
          'For a field you render, spread the prop getters, and set the active option yourself when a new query changes the options: the first option so Enter picks it, or -1 so Enter stays the field\u2019s.',
      },
      {
        guidance: true,
        description:
          'Announce the number of results through useAnnounce when the options change for a new query (AST-075 DEC-2). When nothing matches, announce the words the field shows for it.',
      },
      {
        guidance: false,
        description:
          'Render controls that are not options, such as a create button or an empty message, inside the listbox; render them beside it.',
      },
      {
        guidance: false,
        description:
          'Move DOM focus onto the options; the active option is announced through `aria-activedescendant` while focus stays on the control.',
      },
    ],
    accessibility: [
      {
        name: 'Focus stays in the field',
        category: 'Semantics',
        requirement: 'AST-075 FR1',
        description:
          'With the prop getters, moving the active option never moves focus out of the field. The field names the active option through `aria-activedescendant` and carries none while no option is active.',
      },
      {
        name: 'Expanded state follows the list',
        category: 'Semantics',
        requirement: 'AST-075 FR2',
        description:
          'While the listbox renders, the field exposes `aria-expanded="true"` and `aria-controls` naming it. Otherwise it exposes `aria-expanded="false"` and references nothing.',
      },
      {
        name: 'Roles',
        category: 'Semantics',
        requirement: 'AST-075 FR3',
        description:
          'The field is a `combobox` with `aria-autocomplete="list"`. The list is a `listbox` of `option`s with `aria-selected="true"` on the active one. You name the field and the listbox.',
      },
      {
        name: 'Keys',
        category: 'Keyboard',
        requirement: 'AST-075 FR4',
        description:
          'While the list shows, ArrowDown and ArrowUp move the active option and wrap; Enter picks an active option and only then stops the field\u2019s own Enter; Escape, whatever modifier is held, hides the list without closing an enclosing dialog or popover on the same press. While it is hidden, ArrowDown shows it when there are options. An open field with no options still takes Escape, which closes the list, so render an empty message while it is open. Home, End, other chords such as Shift+Enter, and every other key reach the field.',
      },
      {
        name: 'Input method',
        category: 'Keyboard',
        requirement: 'AST-075 FR5',
        description:
          'No key moves, picks or hides while an input method is composing text.',
      },
      {
        name: 'Pointer',
        category: 'Semantics',
        requirement: 'AST-075 FR6',
        description:
          'Moving the pointer over an option makes it active without moving focus; pressing an option picks it, and the field keeps focus through the press.',
      },
      {
        name: 'Result count',
        category: 'Content',
        requirement: 'AST-075 FR7',
        description:
          'Yours to announce: compose useAnnounce (AST-075 DEC-2) so each new query announces the number of options, or that there are none, once and politely. For none, announce the words the field shows.',
      },
    ],
  },
  relatedComponents: ['Selector', 'CommandPalette'],
  relatedHooks: ['useMultiCombobox', 'useTypeahead', 'useAnnounce'],
  importPath: '@astryxdesign/core/Selector',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Single-select combobox state + keys; focus stays on control. Powers Selector / CommandPalette, and comboboxes over a single-line field you render (search whose results replace a section, an add-people field). Renders nothing: spread getFieldProps / getListboxProps / getOptionProps, or wire role, aria-expanded, aria-controls, aria-activedescendant yourself.',
  paramDescriptions: {
    options: 'config.',
    'options.selectableItems':
      'options in render order: SelectorOptionData or any type w/ string value + optional disabled; disabled ones not pickable, skipped while moving in open list (onKeyDown ArrowDown/Up opening still lands first / last).',
    'options.isOpen': 'list shown; caller owns state.',
    'options.onOpen':
      'show list; return false to refuse (highlight untouched).',
    'options.onClose':
      'hook hides list; resets highlight first. caller closing itself (outside press): also setHighlightedIndex(-1).',
    'options.listboxId': 'listbox id; option ids derive from it (getItemId).',
    'options.value':
      'selected value; w/o search, press / Enter / Space opening highlights it (else first); ArrowDown/Up open on first / last.',
    'options.onSelect': 'called w/ picked value; picking closes.',
    'options.onClear':
      'clears value; Delete / Backspace on closed control. ignored when open or hasSearch.',
    'options.hasSearch':
      'list has own search field: Space types, press / Enter opening does not pre-highlight (ArrowDown/Up still first / last), printable keys on closed control -> onSearchSeed.',
    'options.onSearchSeed':
      'w/ hasSearch, each printable char except Space typed while control focused (opens first if closed).',
    'options.isDisabled': 'ignore clicks + keys.',
  },
  returnDescriptions: {
    highlightedIndex:
      'active option index, -1 = none. hasSearch: press / Enter opening sets none (stays -1 after hook closes); ArrowDown/Up still first / last. name in aria-activedescendant only when it points at a rendered option.',
    setHighlightedIndex: 'set active option (e.g. after filtering).',
    getItemId:
      'id for option at index; aria-activedescendant = isOpen && highlightedIndex >= 0 && highlightedIndex < selectableItems.length ? getItemId(highlightedIndex) : undefined (empty list safe).',
    onTriggerClick: 'toggle list from a press on control.',
    onKeyDown:
      'control keydown: ArrowDown/Up open or move; Enter (Space w/o search) picks or opens; Escape / Tab close; Home / End / PageUp / PageDown jump. editable control keeping Home / End for caret: do not pass them.',
    onItemSelect: 'pick from a press, then close.',
    onItemMouseEnter: 'hover makes option active; no scroll, no focus move.',
    getFieldProps:
      'input props: role=combobox, aria-expanded, aria-autocomplete=list, aria-controls only while listbox renders (isOpen + options), aria-activedescendant only while an option is active, key handler. pass own onKeyDown here (may be typed for its element): runs after hook unless hook claimed key.',
    getListboxProps:
      'listbox props (id, role, press keeps focus in field); render anywhere incl. page flow while isOpen + options; name it (aria-label / aria-labelledby).',
    getOptionProps:
      'option props at index: id, role, aria-selected on active, aria-disabled, pointer move activates w/o focus move, press picks.',
  },
  usage: {
    description:
      'Headless single-select combobox: active option + keys, focus stays on control. Caller renders + wires ARIA.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Option id = getItemId(index); aria-activedescendant only while open and highlightedIndex points at a rendered option.',
      },
      {
        guidance: true,
        description:
          'Type-to-select w/o search: run useTypeahead first, fall through when it returns false.',
      },
      {
        guidance: true,
        description:
          'Own field: spread the getters, set active option on new query (first: Enter picks; -1: Enter stays the field\u2019s).',
      },
      {
        guidance: true,
        description:
          'Announce result count via useAnnounce on new query (AST-075 DEC-2); for none, the words the field shows.',
      },
      {
        guidance: false,
        description:
          'Non-option controls (create button, empty message) inside listbox; render beside it.',
      },
      {
        guidance: false,
        description: 'Move DOM focus onto options; use aria-activedescendant.',
      },
    ],
    accessibility: [
      {
        name: 'Focus stays in the field',
        category: 'Semantics',
        requirement: 'AST-075 FR1',
        description:
          'moving active option never moves focus; aria-activedescendant names it, none while nothing active.',
      },
      {
        name: 'Expanded state follows the list',
        category: 'Semantics',
        requirement: 'AST-075 FR2',
        description:
          'listbox renders -> aria-expanded=true + aria-controls; else false + no reference.',
      },
      {
        name: 'Roles',
        category: 'Semantics',
        requirement: 'AST-075 FR3',
        description:
          'field = combobox + aria-autocomplete=list. listbox of options, aria-selected=true on active. you name field + listbox.',
      },
      {
        name: 'Keys',
        category: 'Keyboard',
        requirement: 'AST-075 FR4',
        description:
          'shown: ArrowDown/Up move (wrap), Enter picks active option then stops field Enter, Escape (any modifier) hides w/o closing enclosing dialog / popover same press. hidden: ArrowDown shows it w/ options. open field w/ no options still takes Escape (closes list): render an empty message while open. Home / End / other chords (Shift+Enter) / others reach field.',
      },
      {
        name: 'Input method',
        category: 'Keyboard',
        requirement: 'AST-075 FR5',
        description: 'no key moves / picks / hides during IME composition.',
      },
      {
        name: 'Pointer',
        category: 'Semantics',
        requirement: 'AST-075 FR6',
        description:
          'pointer move over option activates w/o focus move; press picks, field keeps focus.',
      },
      {
        name: 'Result count',
        category: 'Content',
        requirement: 'AST-075 FR7',
        description:
          'yours: compose useAnnounce (DEC-2), each new query announces count or none once, politely; none = the words the field shows.',
      },
    ],
  },
};
