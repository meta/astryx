// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Semantic HTML fixtures and one-outcome mutations for the Combobox contract. */

import type {ComboboxStateFacts} from './combobox';

export const COMBOBOX_SUBJECT_SELECTOR = '[data-combobox-subject]';
export const COMBOBOX_POPUP_SELECTOR = '[data-combobox-popup]';
export const COMBOBOX_ACTIVE_SELECTOR = '[data-combobox-active]';

export interface ComboboxFixture {
  readonly id: string;
  readonly html: string;
  readonly facts: ComboboxStateFacts;
}

const openFacts: ComboboxStateFacts = {
  name: 'Fruit',
  expanded: true,
  popupRole: 'listbox',
  popupVisible: true,
  activeDescendant: true,
  readOnly: false,
  busy: false,
  inertUnderOwnModal: false,
};

const closedFacts: ComboboxStateFacts = {
  ...openFacts,
  expanded: false,
  popupVisible: false,
  activeDescendant: false,
};

const fixtures: Readonly<Record<string, ComboboxFixture>> = {
  'conforming-open-input': {
    id: 'conforming-open-input',
    facts: openFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-list" aria-haspopup="listbox" aria-activedescendant="apple" aria-busy="false"><div data-combobox-popup id="fruit-list" role="listbox" aria-label="Fruit choices"><div data-combobox-active id="apple" role="option" aria-selected="false">Apple</div></div>',
  },
  'conforming-closed-input': {
    id: 'conforming-closed-input',
    facts: closedFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="false">',
  },
  'conforming-readonly-button': {
    id: 'conforming-readonly-button',
    facts: {
      ...closedFacts,
      name: 'Assigned owner',
      readOnly: true,
    },
    html: '<button data-combobox-subject role="combobox" aria-label="Assigned owner" aria-expanded="false" aria-readonly="true">Alice</button>',
  },
  'conforming-busy-input': {
    id: 'conforming-busy-input',
    facts: {...closedFacts, busy: true},
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="false" aria-busy="true">',
  },
  'conforming-modal-sheet-button': {
    id: 'conforming-modal-sheet-button',
    facts: {
      ...openFacts,
      popupRole: 'dialog',
      activeDescendant: false,
      inertUnderOwnModal: true,
    },
    html: '<button data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-sheet" aria-haspopup="dialog">Apple</button><dialog data-combobox-popup data-combobox-show-modal id="fruit-sheet" aria-label="Fruit"><div role="listbox" aria-label="Fruit choices"><div role="option" aria-selected="true">Apple</div></div></dialog>',
  },
  'inert-claim-without-modal-dialog': {
    id: 'inert-claim-without-modal-dialog',
    facts: {...openFacts, activeDescendant: false, inertUnderOwnModal: true},
    html: '<input data-combobox-subject role="button" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-list" aria-haspopup="listbox"><div data-combobox-popup id="fruit-list" role="listbox"><div role="option">Apple</div></div>',
  },
  'wrong-role': {
    id: 'wrong-role',
    facts: closedFacts,
    html: '<input data-combobox-subject role="button" aria-label="Fruit" aria-expanded="false">',
  },
  'missing-name': {
    id: 'missing-name',
    facts: closedFacts,
    html: '<input data-combobox-subject role="combobox" aria-expanded="false">',
  },
  'open-exposed-collapsed': {
    id: 'open-exposed-collapsed',
    facts: openFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="false" aria-controls="fruit-list" aria-haspopup="listbox" aria-activedescendant="apple"><div data-combobox-popup id="fruit-list" role="listbox"><div data-combobox-active id="apple" role="option">Apple</div></div>',
  },
  'broken-popup-reference': {
    id: 'broken-popup-reference',
    facts: openFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="missing-list" aria-haspopup="listbox" aria-activedescendant="apple"><div data-combobox-popup id="fruit-list" role="listbox"><div data-combobox-active id="apple" role="option">Apple</div></div>',
  },
  'wrong-popup-kind': {
    id: 'wrong-popup-kind',
    facts: {...openFacts, popupRole: 'dialog', activeDescendant: false},
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-dialog" aria-haspopup="listbox"><div data-combobox-popup id="fruit-dialog" role="dialog" aria-label="Fruit choices"></div>',
  },
  'broken-active-reference': {
    id: 'broken-active-reference',
    facts: openFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-list" aria-haspopup="listbox" aria-activedescendant="missing-option"><div data-combobox-popup id="fruit-list" role="listbox"><div data-combobox-active id="apple" role="option">Apple</div></div>',
  },
  'active-outside-popup': {
    id: 'active-outside-popup',
    facts: openFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="true" aria-controls="fruit-list" aria-haspopup="listbox" aria-activedescendant="apple"><div data-combobox-popup id="fruit-list" role="listbox"></div><div data-combobox-active id="apple" role="option">Apple</div>',
  },
  'readonly-missing-state': {
    id: 'readonly-missing-state',
    facts: {...closedFacts, name: 'Assigned owner', readOnly: true},
    html: '<button data-combobox-subject role="combobox" aria-label="Assigned owner" aria-expanded="false">Alice</button>',
  },
  'readonly-retains-surface': {
    id: 'readonly-retains-surface',
    facts: {...closedFacts, name: 'Assigned owner', readOnly: true},
    html: '<button data-combobox-subject role="combobox" aria-label="Assigned owner" aria-expanded="false" aria-readonly="true" aria-controls="owners" aria-activedescendant="alice">Alice</button>',
  },
  'busy-state-omitted': {
    id: 'busy-state-omitted',
    facts: {...closedFacts, busy: true},
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="false">',
  },
  'idle-exposed-busy': {
    id: 'idle-exposed-busy',
    facts: closedFacts,
    html: '<input data-combobox-subject role="combobox" aria-label="Fruit" aria-expanded="false" aria-busy="true">',
  },
};

export const CONFORMING_COMBOBOX_FIXTURES = [
  'conforming-open-input',
  'conforming-closed-input',
  'conforming-readonly-button',
  'conforming-busy-input',
  'conforming-modal-sheet-button',
] as const;

export const COMBOBOX_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'combobox.identity.named': [
    'wrong-role',
    'missing-name',
    'inert-claim-without-modal-dialog',
  ],
  'combobox.state.expanded': ['open-exposed-collapsed'],
  'combobox.popup.relationship': ['broken-popup-reference', 'wrong-popup-kind'],
  'combobox.active-descendant.owned': [
    'broken-active-reference',
    'active-outside-popup',
  ],
  'combobox.state.readonly-closed': [
    'readonly-missing-state',
    'readonly-retains-surface',
  ],
  'combobox.state.busy': ['busy-state-omitted', 'idle-exposed-busy'],
};

export function comboboxFixture(id: string): ComboboxFixture {
  const fixture = fixtures[id];
  if (fixture == null) {
    throw new Error(`unknown Combobox fixture: ${id}`);
  }
  return fixture;
}
