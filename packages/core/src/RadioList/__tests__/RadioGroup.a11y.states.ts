// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioGroup.a11y.states.ts
 * @input Uses RadioGroupStateFacts from @astryxdesign/a11y-spec
 * @output The AST-021 binding inventory for every current radio-group part, representative states, and explicit exclusions
 * @position Data-only inventory shared by jsdom, Storybook, and Chromium bindings.
 */

import type {RadioGroupStateFacts} from '@astryxdesign/a11y-spec';

export type RadioGroupBinding =
  | 'RadioList'
  | 'RadioListItem'
  | 'SegmentedControl'
  | 'SegmentedControlItem'
  | 'DropdownMenuRadioGroup'
  | 'DropdownMenuRadioItem';

export interface RadioGroupRelation {
  readonly role: 'radio' | 'menuitemradio';
  readonly name: string;
}

export interface RadioGroupBindingState {
  readonly id: string;
  readonly binding: RadioGroupBinding;
  readonly summary: string;
  readonly facts: RadioGroupStateFacts;
  readonly subjectName: string | RegExp;
  readonly relations?: Readonly<Record<string, RadioGroupRelation>>;
  readonly storyId: string;
  readonly opensMenu?: boolean;
}

export type RadioGroupBindingRow = (typeof RADIO_GROUP_BINDING_STATES)[number];
export type RadioGroupStateId =
  (typeof RADIO_GROUP_BINDING_STATES)[number]['id'];

const DIRECT_RELATIONS = {
  first: {role: 'radio', name: 'Standard'},
  second: {role: 'radio', name: 'Express'},
  third: {role: 'radio', name: 'Overnight'},
} as const;

const MENU_RELATIONS = {
  first: {role: 'menuitemradio', name: 'Newest'},
  second: {role: 'menuitemradio', name: 'Oldest'},
  third: {role: 'menuitemradio', name: 'Most viewed'},
} as const;

function groupFacts(
  overrides: Partial<RadioGroupStateFacts> = {},
): RadioGroupStateFacts {
  return {
    part: 'group',
    role: 'radiogroup',
    checked: null,
    selection: 'one',
    optionRelations: ['first', 'second', 'third'],
    selectedOption: 'first',
    disabled: false,
    description: null,
    required: false,
    invalid: false,
    operable: true,
    tabReachable: true,
    spaceSelection: true,
    pointerSelection: true,
    arrowSelection: true,
    pointerCancellation: false,
    visibleLabel: true,
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
    operable: true,
    tabReachable: false,
    spaceSelection: false,
    pointerSelection: false,
    arrowSelection: false,
    pointerCancellation: true,
    visibleLabel: true,
    movement: 'none',
    ...overrides,
  };
}

const story = (id: string) => `a11y-radio-group-pattern--${id}`;

export const RADIO_GROUP_BINDING_STATES = [
  {
    id: 'radio-list-group-selected-ltr',
    binding: 'RadioList',
    summary: 'a horizontal LTR group with one selected option',
    facts: groupFacts(),
    subjectName: 'Delivery speed',
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-selected-ltr'),
  },
  {
    id: 'radio-list-group-selected-rtl',
    binding: 'RadioList',
    summary: 'a horizontal RTL group with logical arrow movement',
    facts: groupFacts({movement: 'horizontal-rtl'}),
    subjectName: 'Delivery speed',
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-selected-rtl'),
  },
  {
    id: 'radio-list-group-selected-vertical',
    binding: 'RadioList',
    summary: 'a vertical group with down/up arrow movement',
    facts: groupFacts({movement: 'vertical'}),
    subjectName: 'Delivery speed',
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-selected-vertical'),
  },
  {
    id: 'radio-list-group-none-selected',
    binding: 'RadioList',
    summary: 'a group that starts with no selected option',
    facts: groupFacts({
      selection: 'none',
      selectedOption: null,
      movement: 'vertical',
    }),
    subjectName: 'Delivery speed',
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-none-selected'),
  },
  {
    id: 'radio-list-group-required-invalid-described',
    binding: 'RadioList',
    summary: 'a required invalid group with helper and error text',
    facts: groupFacts({
      selection: 'none',
      selectedOption: null,
      description: 'Choose a delivery speed. Please select an option.',
      required: true,
      invalid: true,
      movement: 'vertical',
    }),
    subjectName: /Delivery speed/,
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-required-invalid-described'),
  },
  {
    id: 'radio-list-group-disabled-with-message',
    binding: 'RadioList',
    summary: 'a disabled group whose reason is attached to the group',
    facts: groupFacts({
      disabled: null,
      description: 'Managed by your administrator',
      operable: false,
      spaceSelection: false,
      pointerSelection: false,
      arrowSelection: false,
      movement: 'vertical',
    }),
    subjectName: 'Delivery speed',
    relations: DIRECT_RELATIONS,
    storyId: story('radio-list-group-disabled-with-message'),
  },
  {
    id: 'radio-list-option-unselected-described',
    binding: 'RadioListItem',
    summary: 'an available unselected option with supporting text',
    facts: optionFacts({description: 'Arrives in three to five days'}),
    subjectName: 'Standard',
    storyId: story('radio-list-option-unselected-described'),
  },
  {
    id: 'radio-list-option-selected',
    binding: 'RadioListItem',
    summary: 'the selected option in a direct group',
    facts: optionFacts({checked: true, tabReachable: true}),
    subjectName: 'Standard',
    storyId: story('radio-list-option-selected'),
  },
  {
    id: 'radio-list-option-disabled',
    binding: 'RadioListItem',
    summary: 'an individually disabled option outside the tab sequence',
    facts: optionFacts({
      disabled: true,
      operable: false,
      tabReachable: false,
      pointerCancellation: false,
    }),
    subjectName: 'Express',
    storyId: story('radio-list-option-disabled'),
  },
  {
    id: 'radio-list-option-group-disabled',
    binding: 'RadioListItem',
    summary: 'an option disabled by its group without a tabReachable reason',
    facts: optionFacts({
      checked: true,
      disabled: true,
      operable: false,
      tabReachable: false,
      pointerCancellation: false,
    }),
    subjectName: 'Standard',
    storyId: story('radio-list-option-group-disabled'),
  },
  {
    id: 'radio-list-option-disabled-with-message',
    binding: 'RadioListItem',
    summary:
      'an unavailable option kept tabReachable and described by its group-level reason',
    facts: optionFacts({
      checked: true,
      disabled: true,
      description: 'Managed by your administrator',
      operable: false,
      tabReachable: true,
      pointerCancellation: false,
    }),
    subjectName: 'Standard',
    storyId: story('radio-list-option-disabled-with-message'),
  },

  {
    id: 'segmented-group-selected-ltr',
    binding: 'SegmentedControl',
    summary: 'a horizontal LTR segmented choice with one selected option',
    facts: groupFacts({visibleLabel: false}),
    subjectName: 'View mode',
    relations: {
      first: {role: 'radio', name: 'List'},
      second: {role: 'radio', name: 'Grid'},
      third: {role: 'radio', name: 'Table'},
    },
    storyId: story('segmented-group-selected-ltr'),
  },
  {
    id: 'segmented-group-selected-rtl',
    binding: 'SegmentedControl',
    summary: 'a horizontal RTL segmented choice with logical arrow movement',
    facts: groupFacts({visibleLabel: false, movement: 'horizontal-rtl'}),
    subjectName: 'View mode',
    relations: {
      first: {role: 'radio', name: 'List'},
      second: {role: 'radio', name: 'Grid'},
      third: {role: 'radio', name: 'Table'},
    },
    storyId: story('segmented-group-selected-rtl'),
  },
  {
    id: 'segmented-group-none-selected',
    binding: 'SegmentedControl',
    summary: 'a segmented choice whose controlled value matches no option',
    facts: groupFacts({
      selection: 'none',
      selectedOption: null,
      visibleLabel: false,
    }),
    subjectName: 'View mode',
    relations: {
      first: {role: 'radio', name: 'List'},
      second: {role: 'radio', name: 'Grid'},
      third: {role: 'radio', name: 'Table'},
    },
    storyId: story('segmented-group-none-selected'),
  },
  {
    id: 'segmented-group-disabled',
    binding: 'SegmentedControl',
    summary: 'a disabled segmented group with one tab stop',
    facts: groupFacts({
      disabled: true,
      operable: false,
      spaceSelection: false,
      pointerSelection: false,
      arrowSelection: false,
      visibleLabel: false,
    }),
    subjectName: 'View mode',
    relations: {
      first: {role: 'radio', name: 'List'},
      second: {role: 'radio', name: 'Grid'},
      third: {role: 'radio', name: 'Table'},
    },
    storyId: story('segmented-group-disabled'),
  },
  {
    id: 'segmented-group-disabled-with-message',
    binding: 'SegmentedControl',
    summary:
      'a disabled segmented group with an attached reason and one tab stop',
    facts: groupFacts({
      disabled: true,
      description: 'Choose a project to switch views',
      operable: false,
      spaceSelection: false,
      pointerSelection: false,
      arrowSelection: false,
      visibleLabel: false,
    }),
    subjectName: 'View mode',
    relations: {
      first: {role: 'radio', name: 'List'},
      second: {role: 'radio', name: 'Grid'},
      third: {role: 'radio', name: 'Table'},
    },
    storyId: story('segmented-group-disabled-with-message'),
  },
  {
    id: 'segmented-option-unselected',
    binding: 'SegmentedControlItem',
    summary: 'an available unselected segment with a visible label',
    facts: optionFacts(),
    subjectName: 'Grid',
    storyId: story('segmented-option-unselected'),
  },
  {
    id: 'segmented-option-selected-hidden-label',
    binding: 'SegmentedControlItem',
    summary: 'a selected icon-only segment named programmatically',
    facts: optionFacts({
      checked: true,
      tabReachable: true,
      visibleLabel: false,
    }),
    subjectName: 'List',
    storyId: story('segmented-option-selected-hidden-label'),
  },
  {
    id: 'segmented-option-disabled',
    binding: 'SegmentedControlItem',
    summary: 'an individually disabled segment',
    facts: optionFacts({
      disabled: true,
      operable: false,
      tabReachable: false,
      pointerCancellation: false,
    }),
    subjectName: 'Grid',
    storyId: story('segmented-option-disabled'),
  },
  {
    id: 'segmented-option-group-disabled',
    binding: 'SegmentedControlItem',
    summary: 'a selected segment disabled by its group that keeps the Tab stop',
    facts: optionFacts({
      checked: true,
      disabled: true,
      operable: false,
      tabReachable: true,
      pointerCancellation: false,
    }),
    subjectName: 'List',
    storyId: story('segmented-option-group-disabled'),
  },
  {
    id: 'segmented-option-group-disabled-with-message',
    binding: 'SegmentedControlItem',
    summary:
      'a selected unavailable segment kept tabReachable and described by the group reason',
    facts: optionFacts({
      checked: true,
      disabled: true,
      description: 'Choose a project to switch views',
      operable: false,
      tabReachable: true,
      pointerCancellation: false,
    }),
    subjectName: 'List',
    storyId: story('segmented-option-group-disabled-with-message'),
  },

  {
    id: 'menu-group-selected',
    binding: 'DropdownMenuRadioGroup',
    summary: 'a named menu-radio group with one selected option',
    facts: groupFacts({
      role: 'group',
      disabled: null,
      tabReachable: false,
      spaceSelection: false,
      arrowSelection: false,
      visibleLabel: false,
      movement: 'none',
    }),
    subjectName: 'Sort by',
    relations: MENU_RELATIONS,
    storyId: story('menu-group-selected'),
    opensMenu: true,
  },
  {
    id: 'menu-group-none-selected',
    binding: 'DropdownMenuRadioGroup',
    summary: 'a named menu-radio group with no selected option',
    facts: groupFacts({
      role: 'group',
      selection: 'none',
      selectedOption: null,
      disabled: null,
      tabReachable: false,
      spaceSelection: false,
      arrowSelection: false,
      visibleLabel: false,
      movement: 'none',
    }),
    subjectName: 'Sort by',
    relations: MENU_RELATIONS,
    storyId: story('menu-group-none-selected'),
    opensMenu: true,
  },
  {
    id: 'menu-option-unselected-described',
    binding: 'DropdownMenuRadioItem',
    summary:
      'an unselected menu radio whose secondary text participates in its name',
    facts: optionFacts({role: 'menuitemradio', tabReachable: false}),
    subjectName: /Oldest\s*Oldest items first/,
    storyId: story('menu-option-unselected-described'),
    opensMenu: true,
  },
  {
    id: 'menu-option-selected',
    binding: 'DropdownMenuRadioItem',
    summary: 'a selected radio item inside an opened menu',
    facts: optionFacts({
      role: 'menuitemradio',
      checked: true,
      tabReachable: false,
    }),
    subjectName: 'Newest',
    storyId: story('menu-option-selected'),
    opensMenu: true,
  },
  {
    id: 'menu-option-disabled',
    binding: 'DropdownMenuRadioItem',
    summary: 'an unavailable radio item inside an opened menu',
    facts: optionFacts({
      role: 'menuitemradio',
      disabled: true,
      operable: false,
      tabReachable: false,
      pointerCancellation: false,
    }),
    subjectName: 'Oldest',
    storyId: story('menu-option-disabled'),
    opensMenu: true,
  },
] as const satisfies ReadonlyArray<RadioGroupBindingState>;

export const RADIO_GROUP_EXCLUSIONS = [
  {
    owner: 'SelectableCard in independent or multi-select composition',
    classification: 'preserved',
    reason:
      'SelectableCard exposes a native checkbox and is already bound to the checkbox contract; visual card selection does not by itself make the control a radio.',
  },
  {
    owner: 'SelectableCard in caller-managed single-select composition',
    classification: 'needs-human',
    reason:
      'The public API has no role-aware single-select mode or group owner. Adopting radio semantics would require an API and ownership decision, so this migration does not reinterpret the existing checkbox.',
  },
  {
    owner: 'DropdownMenu and ContextMenu radio-item movement',
    classification: 'out-of-scope',
    reason:
      'Menu owns composite focus, arrows, typeahead, activation, and dismissal. ContextMenu re-exports the same DropdownMenu radio parts, so a duplicate binding would test one implementation twice.',
  },
  {
    owner: 'TabMenu overflow choices',
    classification: 'out-of-scope',
    reason:
      'TabMenu emits menuitemradio inside its menu-owned overflow navigation; it is not a standalone radio-group part.',
  },
  {
    owner: 'Pagination dots',
    classification: 'out-of-scope',
    reason:
      'Pagination dots are buttons in a named group with aria-current page semantics, not radio or radiogroup nodes.',
  },
  {
    owner: 'Home and End keyboard shortcuts',
    classification: 'out-of-scope',
    reason:
      'The APG radio-group pattern does not require Home or End, and no current Astryx record adopts those optional shortcuts as a shared radio-group contract.',
  },
] as const;
