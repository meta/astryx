// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Explicit Selector states bound to the reusable Combobox contract, plus the
 * states that stay out of it and why.
 */

import type {ComboboxStateFacts} from '@astryxdesign/a11y-spec';

export interface SelectorComboboxScenario {
  readonly id:
    'closed' | 'open' | 'read-only' | 'busy' | 'sheet-open' | 'search-active';
  /** `trigger` is the Selector button; `search` is the popup's search input. */
  readonly binding: 'Selector.trigger' | 'Selector.search';
  readonly storyId: string;
  readonly open: boolean;
  /** Move the highlight to the first option from the search input. */
  readonly highlightFirst?: boolean;
  readonly props: {
    readonly isReadOnly?: boolean;
    readonly isLoading?: boolean;
    readonly value?: string;
    readonly presentation?: 'bottom-sheet';
    readonly hasSearch?: boolean;
  };
  readonly facts: ComboboxStateFacts;
}

const baseFacts: ComboboxStateFacts = {
  name: 'Fruit',
  expanded: false,
  popupRole: 'listbox',
  popupVisible: false,
  activeDescendant: false,
  readOnly: false,
  busy: false,
  inertUnderOwnModal: false,
};

export const SELECTOR_COMBOBOX_SCENARIOS: ReadonlyArray<SelectorComboboxScenario> =
  [
    {
      id: 'closed',
      binding: 'Selector.trigger',
      storyId: 'a11y-combobox-pattern--selector-closed',
      open: false,
      props: {},
      facts: baseFacts,
    },
    {
      id: 'open',
      binding: 'Selector.trigger',
      storyId: 'a11y-combobox-pattern--selector-open',
      open: true,
      props: {},
      facts: {
        ...baseFacts,
        expanded: true,
        popupVisible: true,
        activeDescendant: true,
      },
    },
    {
      id: 'read-only',
      binding: 'Selector.trigger',
      storyId: 'a11y-combobox-pattern--selector-read-only',
      open: false,
      props: {isReadOnly: true, value: 'apple'},
      facts: {...baseFacts, readOnly: true},
    },
    {
      id: 'busy',
      binding: 'Selector.trigger',
      storyId: 'a11y-combobox-pattern--selector-busy',
      open: false,
      props: {isLoading: true},
      facts: {...baseFacts, busy: true},
    },
    {
      // AR1: the touch presentation's popup is a modal dialog that contains
      // the listbox, and the trigger declares aria-haspopup="dialog".
      id: 'sheet-open',
      binding: 'Selector.trigger',
      storyId: 'a11y-combobox-pattern--selector-sheet-open',
      open: true,
      props: {presentation: 'bottom-sheet'},
      facts: {
        ...baseFacts,
        expanded: true,
        popupRole: 'dialog',
        popupVisible: true,
        activeDescendant: true,
        // The modal sheet makes the trigger inert, so the browser leaves it
        // out of the accessibility tree until the sheet closes.
        inertUnderOwnModal: true,
      },
    },
    {
      // With hasSearch, focus moves into the popup's search input, which owns
      // the combobox role and reports the highlighted option.
      id: 'search-active',
      binding: 'Selector.search',
      storyId: 'a11y-combobox-pattern--selector-search-active',
      open: true,
      highlightFirst: true,
      props: {hasSearch: true},
      facts: {
        ...baseFacts,
        name: 'Search options',
        expanded: true,
        popupVisible: true,
        activeDescendant: true,
      },
    },
  ];

/** Selector states that change a combobox outcome but are not bound here. */
export const SELECTOR_COMBOBOX_EXCLUSIONS = [
  {
    owner: 'Selector trigger with hasSearch',
    reason:
      'Editable search mode moves combobox semantics to the popup search input, bound as Selector.search; the trigger is not a combobox in that mode.',
  },
  {
    owner: 'Selector search input inside the bottom sheet',
    reason:
      'The search input keeps the semantics bound in search-active; the sheet changes only its modal host, which the modal-dialog owner covers.',
  },
  {
    owner: 'Selector interaction suites',
    reason:
      'Keyboard activation, arrow/Home/End/typeahead movement, Escape, Tab, and selection policy are verified by Selector.test.tsx (AR3); this contract encodes semantics only.',
  },
  {
    owner: 'Disabled and disabledMessage triggers',
    reason:
      'Availability state belongs to the disabled-state owners; this contract has no disabled expectation.',
  },
  {
    owner:
      'MultiSelector, Typeahead, Tokenizer, PowerSearch, ComplexSelector, CommandPalette',
    reason:
      'Later bounded adopters; this first binding is limited to Selector.',
  },
] as const;
