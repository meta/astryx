// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file radio-group.fixtures.ts
 * @input Uses ./radio-group (RadioGroupStateFacts)
 * @output Plain-HTML conforming and deliberately violating radio-group fixtures
 * @position Mutation proof for the reusable contract; no Astryx component code.
 */

import type {RadioGroupStateFacts} from './radio-group';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const RADIO_GROUP_SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface RadioGroupFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: RadioGroupStateFacts;
  readonly html: string;
}

function groupFacts(
  overrides: Partial<RadioGroupStateFacts> = {},
): RadioGroupStateFacts {
  return {
    part: 'group',
    role: 'radiogroup',
    checked: null,
    selection: null,
    optionRelations: [],
    selectedOption: null,
    disabled: null,
    description: null,
    required: false,
    invalid: false,
    operable: false,
    tabReachable: false,
    spaceSelection: false,
    pointerSelection: false,
    arrowSelection: false,
    pointerCancellation: false,
    visibleLabel: false,
    movement: 'horizontal-ltr',
    ...overrides,
  };
}

function optionFacts(
  overrides: Partial<RadioGroupStateFacts> = {},
): RadioGroupStateFacts {
  return {
    part: 'option',
    role: 'radio',
    checked: false,
    selection: null,
    optionRelations: [],
    selectedOption: null,
    disabled: false,
    description: null,
    required: false,
    invalid: false,
    operable: false,
    tabReachable: false,
    spaceSelection: false,
    pointerSelection: false,
    arrowSelection: false,
    pointerCancellation: false,
    visibleLabel: true,
    movement: 'none',
    ...overrides,
  };
}

export const RADIO_GROUP_FIXTURES: readonly RadioGroupFixture[] = [
  {
    id: 'conforming-radio-option',
    summary: 'an unchecked direct radio option',
    facts: optionFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false">Standard</div>`,
  },
  {
    id: 'conforming-radio-option-checked',
    summary: 'a checked direct radio option',
    facts: optionFacts({checked: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="true">Standard</div>`,
  },
  {
    id: 'conforming-radio-option-disabled',
    summary: 'an unavailable direct radio option',
    facts: optionFacts({disabled: true, operable: false, tabReachable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" aria-disabled="true">Standard</div>`,
  },
  {
    id: 'conforming-menu-radio-option',
    summary: 'an unchecked radio option inside a menu',
    facts: optionFacts({role: 'menuitemradio', tabReachable: false}),
    html: `<div role="menu"><div role="group" aria-label="Sort by"><div ${SUBJECT_ATTRIBUTE} role="menuitemradio" aria-checked="false">Newest</div></div></div>`,
  },
  {
    id: 'conforming-pointer-option',
    summary: 'an operable radio option whose selection happens on click',
    facts: optionFacts({
      operable: true,
      tabReachable: true,
      pointerCancellation: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" tabindex="0" onclick="this.setAttribute('aria-checked','true')">Standard</div>`,
  },
  {
    id: 'conforming-group',
    summary: 'a named direct radio group',
    facts: groupFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-menu-group',
    summary: 'a named group of radio menu items',
    facts: groupFacts({role: 'group', movement: 'none'}),
    html: `<div role="menu"><div ${SUBJECT_ATTRIBUTE} role="group" aria-label="Sort by"><div role="menuitemradio" aria-checked="true">Newest</div><div role="menuitemradio" aria-checked="false">Oldest</div></div></div>`,
  },
  {
    id: 'conforming-described-group',
    summary: 'a radio group with attached supporting text',
    facts: groupFacts({description: 'Choose one delivery speed.'}),
    html: `<p id="hint">Choose one delivery speed.</p><div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-describedby="hint"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-required-group',
    summary: 'a radio group that declares the required choice',
    facts: groupFacts({required: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-required="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-invalid-group',
    summary: 'a radio group exposed as being in error',
    facts: groupFacts({invalid: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-invalid="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-disabled-group',
    summary: 'an unavailable radio group exposed as disabled',
    facts: groupFacts({disabled: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-disabled="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-group-one-selected',
    summary: 'a radio group with exactly its declared option selected',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-group-none-selected',
    summary: 'a radio group that intentionally starts with no option selected',
    facts: groupFacts({
      selection: 'none',
      optionRelations: ['first', 'second'],
      selectedOption: null,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="false">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'conforming-focus-selected',
    summary:
      'a native radio group entered at its selected option and left as one Tab stop',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      spaceSelection: true,
      pointerSelection: true,
      arrowSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><label><input data-a11y-related="first" type="radio" name="delivery" checked>Standard</label><label><input data-a11y-related="second" type="radio" name="delivery">Express</label></div><button type="button">After</button>`,
  },
  {
    id: 'conforming-focus-none-selected',
    summary: 'an unselected native radio group entered at its first option',
    facts: groupFacts({
      selection: 'none',
      optionRelations: ['first', 'second'],
      selectedOption: null,
      operable: true,
      tabReachable: true,
      spaceSelection: true,
      pointerSelection: true,
      arrowSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><label><input data-a11y-related="first" type="radio" name="delivery">Standard</label><label><input data-a11y-related="second" type="radio" name="delivery">Express</label></div><button type="button">After</button>`,
  },
  {
    id: 'conforming-arrow-rtl',
    summary:
      'a right-to-left horizontal radio group with logical arrow movement',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      arrowSelection: true,
      movement: 'horizontal-rtl',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} dir="rtl" role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0" onkeydown="if (event.key === 'ArrowLeft') { this.setAttribute('aria-checked','false'); const next=this.nextElementSibling; next.setAttribute('aria-checked','true'); next.focus(); }">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1" onkeydown="if (event.key === 'ArrowRight') { this.setAttribute('aria-checked','false'); const previous=this.previousElementSibling; previous.setAttribute('aria-checked','true'); previous.focus(); }">Express</div></div>`,
  },
  {
    id: 'conforming-arrow-vertical',
    summary: 'a vertical radio group with down and up arrow movement',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      arrowSelection: true,
      movement: 'vertical',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0" onkeydown="if (event.key === 'ArrowDown') { this.setAttribute('aria-checked','false'); const next=this.nextElementSibling; next.setAttribute('aria-checked','true'); next.focus(); }">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1" onkeydown="if (event.key === 'ArrowUp') { this.setAttribute('aria-checked','false'); const previous=this.previousElementSibling; previous.setAttribute('aria-checked','true'); previous.focus(); }">Express</div></div>`,
  },
  {
    id: 'conforming-pointer-group',
    summary:
      'a radio group whose pointer selection can move to an alternative and back',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      pointerSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><label><input data-a11y-related="first" type="radio" name="delivery" checked>Standard</label><label><input data-a11y-related="second" type="radio" name="delivery">Express</label></div>`,
  },
  {
    id: 'violating-group-role',
    summary:
      'a single-choice set exposed as a toolbar instead of its adopted group role',
    facts: groupFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="toolbar" aria-label="Delivery"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-unnamed',
    summary: 'a radio group with no accessible name',
    facts: groupFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-description-dangling',
    summary: 'a described radio group whose relationship points to nothing',
    facts: groupFacts({description: 'Choose one delivery speed.'}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-describedby="missing"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-description-empty',
    summary:
      'a described radio group whose relationship resolves to empty text',
    facts: groupFacts({description: 'Choose one delivery speed.'}),
    html: `<p id="hint"></p><div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-describedby="hint"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-required-group-unexposed',
    summary: 'a required radio group with no required-state declaration',
    facts: groupFacts({required: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-required-group-overexposed',
    summary: 'an optional radio group falsely declared required',
    facts: groupFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-required="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-invalid-group-unexposed',
    summary: 'a radio group in error with no invalid-state exposure',
    facts: groupFacts({invalid: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-invalid-group-overexposed',
    summary: 'a valid radio group falsely exposed as invalid',
    facts: groupFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-invalid="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-disabled-unexposed',
    summary: 'an unavailable radio group exposed as available',
    facts: groupFacts({disabled: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-disabled-overexposed',
    summary: 'an available radio group falsely exposed as unavailable',
    facts: groupFacts({disabled: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery" aria-disabled="true"><div role="radio" aria-checked="true">Standard</div><div role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-option-role',
    summary: 'a direct radio option exposed as a checkbox',
    facts: optionFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="checkbox" aria-checked="false">Standard</div>`,
  },
  {
    id: 'violating-option-unnamed',
    summary: 'a radio option with no accessible name',
    facts: optionFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false"></div>`,
  },
  {
    id: 'violating-option-name-mismatch',
    summary: 'a radio option whose accessible name replaces its visible label',
    facts: optionFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" aria-label="Express">Standard</div>`,
  },
  {
    id: 'violating-option-state-mismatch',
    summary: 'a selected radio option exposed as unchecked',
    facts: optionFacts({checked: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false">Standard</div>`,
  },
  {
    id: 'violating-option-disabled-unexposed',
    summary: 'an unavailable radio option exposed as available',
    facts: optionFacts({disabled: true, operable: false, tabReachable: false}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false">Standard</div>`,
  },
  {
    id: 'violating-option-disabled-overexposed',
    summary: 'an available radio option falsely exposed as unavailable',
    facts: optionFacts(),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" aria-disabled="true">Standard</div>`,
  },
  {
    id: 'violating-group-two-selected',
    summary: 'a radio group exposing two selected options',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true">Standard</div><div data-a11y-related="second" role="radio" aria-checked="true">Express</div></div>`,
  },
  {
    id: 'violating-group-wrong-selected',
    summary:
      'a radio group selecting a different option from the binding state',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="false">Standard</div><div data-a11y-related="second" role="radio" aria-checked="true">Express</div></div>`,
  },
  {
    id: 'violating-group-unexpected-selection',
    summary: 'a zero-selection radio group exposing one option selected',
    facts: groupFacts({
      selection: 'none',
      optionRelations: ['first', 'second'],
      selectedOption: null,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-group-wrong-entry',
    summary: 'a radio group whose sole tab stop is not its selected option',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      tabReachable: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="-1">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="0">Express</div></div><button type="button">After</button>`,
  },
  {
    id: 'violating-group-keyboard-trap',
    summary: 'a radio group that swallows the Tab key used to leave it',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      tabReachable: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0" onkeydown="if (event.key === 'Tab') event.preventDefault()">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div><button type="button">After</button>`,
  },
  {
    id: 'violating-space-inert',
    summary: 'a focused radio option that ignores Space',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      spaceSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div>`,
  },
  {
    id: 'violating-space-one-way',
    summary:
      'a native radio group that can select the alternate but cannot return',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      spaceSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><label><input data-a11y-related="first" type="radio" name="delivery" checked onkeydown="if (event.key === ' ') event.preventDefault()">Standard</label><label><input data-a11y-related="second" type="radio" name="delivery">Express</label></div>`,
  },
  {
    id: 'violating-arrow-inert',
    summary: 'a radio group whose selected option ignores the forward arrow',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      arrowSelection: true,
      movement: 'horizontal-ltr',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div>`,
  },
  {
    id: 'violating-arrow-one-way',
    summary: 'a radio group that moves forward but cannot move back',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      tabReachable: true,
      arrowSelection: true,
      movement: 'horizontal-ltr',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true" tabindex="0" onkeydown="if (event.key === 'ArrowRight') { this.setAttribute('aria-checked','false'); const next=this.nextElementSibling; next.setAttribute('aria-checked','true'); next.focus(); }">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div>`,
  },
  {
    id: 'violating-space-from-none-inert',
    summary: 'an unselected radio group whose first option ignores Space',
    facts: groupFacts({
      selection: 'none',
      optionRelations: ['first', 'second'],
      selectedOption: null,
      operable: true,
      tabReachable: true,
      spaceSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="false" tabindex="0">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div>`,
  },
  {
    id: 'violating-arrow-from-none-inert',
    summary:
      'an unselected radio group whose first option ignores the forward arrow',
    facts: groupFacts({
      selection: 'none',
      optionRelations: ['first', 'second'],
      selectedOption: null,
      operable: true,
      tabReachable: true,
      arrowSelection: true,
      movement: 'horizontal-ltr',
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="false" tabindex="0">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" tabindex="-1">Express</div></div>`,
  },
  {
    id: 'violating-pointer-down-selection',
    summary: 'a radio option that selects on pointer down before release',
    facts: optionFacts({
      operable: true,
      tabReachable: true,
      pointerCancellation: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" tabindex="0" onpointerdown="this.setAttribute('aria-checked','true')">Standard</div>`,
  },
  {
    id: 'violating-pointer-inert',
    summary: 'a radio group whose alternative ignores pointer activation',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      pointerSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false">Express</div></div>`,
  },
  {
    id: 'violating-pointer-one-way',
    summary:
      'a radio group whose pointer can select an alternative but not return',
    facts: groupFacts({
      selection: 'one',
      optionRelations: ['first', 'second'],
      selectedOption: 'first',
      operable: true,
      pointerSelection: true,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radiogroup" aria-label="Delivery"><div data-a11y-related="first" role="radio" aria-checked="true">Standard</div><div data-a11y-related="second" role="radio" aria-checked="false" onclick="this.setAttribute('aria-checked','true'); this.previousElementSibling.setAttribute('aria-checked','false')">Express</div></div>`,
  },
  {
    id: 'violating-option-disabled-operable',
    summary: 'an unavailable radio option that still changes when clicked',
    facts: optionFacts({disabled: true, operable: false, tabReachable: true}),
    html: `<div ${SUBJECT_ATTRIBUTE} role="radio" aria-checked="false" aria-disabled="true" tabindex="0" onclick="this.setAttribute('aria-checked','true')">Standard</div>`,
  },
];

export const CONFORMING_RADIO_GROUP_FIXTURES: readonly string[] =
  RADIO_GROUP_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export function radioGroupFixture(id: string): RadioGroupFixture {
  const found = RADIO_GROUP_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown radio-group fixture "${id}"`);
  }
  return found;
}

export const RADIO_GROUP_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'radio-group.group.role-exposed': ['violating-group-role'],
  'radio-group.group.name-exposed': ['violating-group-unnamed'],
  'radio-group.description.resolvable': [
    'violating-group-description-dangling',
  ],
  'radio-group.description.exposed': ['violating-group-description-empty'],
  'radio-group.required.declared': ['violating-required-group-unexposed'],
  'radio-group.required.not-declared': ['violating-required-group-overexposed'],
  'radio-group.invalid.exposed': ['violating-invalid-group-unexposed'],
  'radio-group.invalid.not-exposed': ['violating-invalid-group-overexposed'],
  'radio-group.group.availability-exposed': [
    'violating-group-disabled-unexposed',
    'violating-group-disabled-overexposed',
  ],
  'radio-group.option.role-exposed': ['violating-option-role'],
  'radio-group.option.name-exposed': ['violating-option-unnamed'],
  'radio-group.name.matches-visible-label': ['violating-option-name-mismatch'],
  'radio-group.option.state-exposed': ['violating-option-state-mismatch'],
  'radio-group.option.availability-exposed': [
    'violating-option-disabled-unexposed',
    'violating-option-disabled-overexposed',
  ],
  'radio-group.selection.exposed': [
    'violating-group-two-selected',
    'violating-group-wrong-selected',
    'violating-group-unexpected-selection',
  ],
  'radio-group.focus.entry-and-exit': [
    'violating-group-wrong-entry',
    'violating-group-keyboard-trap',
  ],
  'radio-group.selection.space-round-trip': [
    'violating-space-inert',
    'violating-space-one-way',
  ],
  'radio-group.selection.arrow-round-trip': [
    'violating-arrow-inert',
    'violating-arrow-one-way',
  ],
  'radio-group.selection.space-from-none': ['violating-space-from-none-inert'],
  'radio-group.selection.arrow-from-none': ['violating-arrow-from-none-inert'],
  'radio-group.option.survives-aborted-press': [
    'violating-pointer-down-selection',
  ],
  'radio-group.selection.pointer-round-trip': [
    'violating-pointer-inert',
    'violating-pointer-one-way',
  ],
  'radio-group.option.inoperable': ['violating-option-disabled-operable'],
};

const MUTATION_FAILURES: Readonly<Record<string, string>> = {
  'radio-group.group.role-exposed:violating-group-role':
    'this binding adopts the radiogroup role for its group, but the browser reports "toolbar"',
  'radio-group.group.name-exposed:violating-group-unnamed':
    'the browser computes no accessible name for this single-choice group',
  'radio-group.description.resolvable:violating-group-description-dangling':
    'aria-describedby points at "missing", which resolves to nothing',
  'radio-group.description.exposed:violating-group-description-empty':
    'the binding expects the description "Choose one delivery speed.", but the browser computes no accessible description',
  'radio-group.required.declared:violating-required-group-unexposed':
    'this group is required, but it does not declare aria-required="true"',
  'radio-group.required.not-declared:violating-required-group-overexposed':
    'this group is not required, but it declares aria-required="true"',
  'radio-group.invalid.exposed:violating-invalid-group-unexposed':
    'this group is in error, but the browser does not report it as invalid',
  'radio-group.invalid.not-exposed:violating-invalid-group-overexposed':
    'this group is valid, but the browser reports it as invalid',
  'radio-group.group.availability-exposed:violating-group-disabled-unexposed':
    'the binding declares this radio group unavailable, but the browser reports it available',
  'radio-group.group.availability-exposed:violating-group-disabled-overexposed':
    'the binding declares this radio group available, but the browser reports it unavailable',
  'radio-group.option.role-exposed:violating-option-role':
    'this binding adopts the radio role for its option, but the browser reports "checkbox"',
  'radio-group.option.name-exposed:violating-option-unnamed':
    'the browser computes no accessible name for this radio option',
  'radio-group.name.matches-visible-label:violating-option-name-mismatch':
    'the visible label reads "Standard" but the browser computes the accessible name as "Express"',
  'radio-group.option.state-exposed:violating-option-state-mismatch':
    'this state declares the radio option selected, but the browser reports it unselected',
  'radio-group.option.availability-exposed:violating-option-disabled-unexposed':
    'the binding declares this radio option unavailable, but the browser reports it available',
  'radio-group.option.availability-exposed:violating-option-disabled-overexposed':
    'the binding declares this radio option available, but the browser reports it unavailable',
  'radio-group.selection.exposed:violating-group-two-selected':
    'this state declares exactly one selected option, but the browser exposes 2 selected options',
  'radio-group.selection.exposed:violating-group-wrong-selected':
    'this state declares "first" selected, but the browser exposes "second" selected',
  'radio-group.selection.exposed:violating-group-unexpected-selection':
    'this state declares no selected option, but the browser exposes "first" selected',
  'radio-group.focus.entry-and-exit:violating-group-wrong-entry':
    'Tab entered the radio group at "second" instead of its selected option "first"',
  'radio-group.focus.entry-and-exit:violating-group-keyboard-trap':
    'Tab did not leave the radio group, so a keyboard user is trapped inside it',
  'radio-group.selection.space-round-trip:violating-space-inert':
    'pressing Space on "second" left it unselected, so the keyboard cannot choose that option',
  'radio-group.selection.space-round-trip:violating-space-one-way':
    'pressing Space selected "second", but pressing Space on "first" did not restore the original selection',
  'radio-group.selection.arrow-round-trip:violating-arrow-inert':
    'pressing ArrowRight from "first" did not move focus and selection to "second"',
  'radio-group.selection.arrow-round-trip:violating-arrow-one-way':
    'pressing ArrowRight moved to "second", but pressing ArrowLeft did not restore "first"',
  'radio-group.selection.space-from-none:violating-space-from-none-inert':
    'pressing Space on the first option of an unselected group left it unselected',
  'radio-group.selection.arrow-from-none:violating-arrow-from-none-inert':
    'pressing ArrowRight from the first option of an unselected group did not move focus and selection to "second"',
  'radio-group.option.survives-aborted-press:violating-pointer-down-selection':
    'pressing the radio option and releasing away from it still selected it, so the choice cannot be taken back before release',
  'radio-group.selection.pointer-round-trip:violating-pointer-inert':
    'clicking "second" left it unselected, so a pointer cannot choose that option',
  'radio-group.selection.pointer-round-trip:violating-pointer-one-way':
    'clicking "second" selected it, but clicking "first" did not restore the original selection',
  'radio-group.option.inoperable:violating-option-disabled-operable':
    'the user is not meant to change this radio option, but clicking it selected it',
};

export function expectedRadioGroupMutationFailure(
  expectation: string,
  target: string,
): string {
  const detail = MUTATION_FAILURES[`${expectation}:${target}`];
  if (detail == null) {
    throw new Error(
      `no expected radio-group failure detail for ${expectation} against ${target}`,
    );
  }
  return detail;
}
