// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTypeahead',
  displayName: 'useTypeahead',
  keywords: [
    'typeahead',
    'type to focus',
    'first character',
    'keyboard',
    'search',
    'jump',
    'menu',
    'listbox',
    'select',
    'apg',
    'accessibility',
    'a11y',
  ],
  params: [
    {
      name: 'options',
      type: 'UseTypeaheadOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.getItemLabels',
      type: '() => ReadonlyArray<string | null | undefined>',
      description:
        "Returns the item labels in DOM order. A null or empty entry marks a non-matchable slot and keeps indices aligned with the caller's items.",
      required: true,
    },
    {
      name: 'options.onMatch',
      type: '(index: number) => void',
      description:
        "Called with the index of the matched item so the caller can focus or select it; typically useListFocus's focusItem.",
      required: true,
    },
    {
      name: 'options.getCurrentIndex',
      type: '() => number',
      description:
        'The index to search from, usually the focused item, so repeated presses of one letter cycle through matches. A negative value means nothing is current.',
      default: '() => -1',
    },
    {
      name: 'options.resetMs',
      type: 'number',
      description:
        'Milliseconds of inactivity after which the typed buffer resets.',
      default: '750',
    },
    {
      name: 'options.isDisabled',
      type: '(index: number) => boolean',
      description: 'Whether an index should be skipped, e.g. disabled items.',
    },
  ],
  returns: [
    {
      name: 'onKeyDown',
      type: '(e: React.KeyboardEvent | KeyboardEvent) => boolean',
      description:
        'Keydown handler. Returns true when it consumed a printable character, so the caller can stop its own key handling.',
    },
    {
      name: 'reset',
      type: '() => void',
      description:
        'Clears the pending buffer, e.g. when the collection closes.',
    },
  ],
  usage: {
    description:
      "Adds APG type-to-focus search to a collection: printable keystrokes are buffered (resetting after a pause), and the first item whose label starts with the buffer (ignoring case, accents, the stroked letters đ ł ø ħ ŧ ƀ and Turkish ı/İ, the same in every locale; a typed accent prefers the exact match) is reported through onMatch. Pressing the same letter repeatedly cycles through the matches rather than filtering deeper. It moves nothing itself; pair it with the collection's own focus management, most often useListFocus or useGridFocus.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Wire onMatch to the focus manager you already have (useListFocus.focusItem) instead of moving focus yourself.',
      },
      {
        guidance: true,
        description:
          'Let it see the key event first and fall through to arrow-key navigation only when it returns false.',
      },
      {
        guidance: true,
        description:
          'Pass getCurrentIndex so repeated presses of one letter walk through matches instead of sticking on the first.',
      },
      {
        guidance: false,
        description:
          'Use it on a text input; the field already receives the characters, and typeahead would fight the value.',
      },
    ],
  },
  relatedComponents: ['DropdownMenu', 'Selector', 'TreeList'],
  relatedHooks: ['useListFocus', 'useGridFocus', 'useTreeFocus'],
  importPath: '@astryxdesign/core/hooks',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'APG type-to-focus search for a collection. Buffers printable keys (resets after pause), matches labels by prefix ignoring case, accents, stroked letters + Turkish ı/İ in every locale (typed accent prefers exact match), reports index via onMatch. Same letter pressed repeatedly cycles matches. Moves nothing itself; pair w/ useListFocus / useGridFocus.',
  paramDescriptions: {
    options: 'config.',
    'options.getItemLabels':
      'item labels in DOM order; null / empty = non-matchable slot, indices stay aligned.',
    'options.onMatch':
      'called w/ matched index so caller focuses / selects (e.g. useListFocus focusItem).',
    'options.getCurrentIndex':
      'index to search from (usually focused item) so repeat presses cycle. negative = nothing current.',
    'options.resetMs': 'ms of inactivity before typed buffer resets.',
    'options.isDisabled': 'whether an index is skipped (e.g. disabled items).',
  },
  returnDescriptions: {
    onKeyDown:
      'keydown handler; true = consumed a printable char, caller can stop its own handling.',
    reset: 'clears pending buffer (e.g. on close).',
  },
  usage: {
    description:
      'Type-to-jump for menus / listboxes / trees. Buffered prefix match w/ APG same-letter cycling; reports index, caller owns focus.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Wire onMatch to existing focus manager (useListFocus.focusItem), do not move focus yourself.',
      },
      {
        guidance: true,
        description:
          'Give it the key event first; fall through to arrow navigation when it returns false.',
      },
      {
        guidance: true,
        description:
          'Pass getCurrentIndex so repeat presses walk matches instead of sticking on first.',
      },
      {
        guidance: false,
        description: 'Use on a text input; field already gets the characters.',
      },
    ],
  },
};
