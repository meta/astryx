// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Listbox.a11y.states.ts
 * @input Uses public Selector option types and the shared Listbox facts
 * @output A bounded, explicit inventory of existing listbox/group/option states
 * @position Test-only migration ledger shared by component tests and browser stories.
 */

import type {ListboxStateFacts} from '@astryxdesign/a11y-spec';
import type {SelectorOptionType} from '../types';

export interface ListboxScenario {
  readonly id: string;
  readonly component: 'Selector' | 'MultiSelector';
  readonly options: SelectorOptionType[];
  readonly values: string[];
  readonly expectedOptions: ReadonlyArray<{
    value: string;
    name: string;
    disabled: boolean;
    selected?: boolean;
    group?: string;
  }>;
  readonly groups: ReadonlyArray<string>;
  readonly hasSearch?: boolean;
  readonly query?: string;
  readonly presentation?: 'popover' | 'bottom-sheet';
  readonly customContent?: boolean;
  readonly hiddenLabel?: boolean;
  readonly direction?: 'ltr' | 'rtl';
  readonly isLoading?: boolean;
  readonly hasSelectAll?: boolean;
}

const flatOptions: SelectorOptionType[] = [
  {value: 'apple', label: 'Apple'},
  {value: 'banana', label: 'Banana'},
  {value: 'cherry', label: 'Cherry', disabled: true},
];
const flatExpected = [
  {value: 'apple', name: 'Apple', disabled: false},
  {value: 'banana', name: 'Banana', disabled: false},
  {value: 'cherry', name: 'Cherry', disabled: true},
];
const groupedOptions: SelectorOptionType[] = [
  {
    type: 'section',
    title: 'Citrus',
    options: [
      {value: 'orange', label: 'Orange'},
      {value: 'lemon', label: 'Lemon'},
    ],
  },
  {type: 'divider'},
  {
    type: 'section',
    title: 'Berries',
    options: [{value: 'blueberry', label: 'Blueberry', disabled: true}],
  },
];
const groupedExpected = [
  {value: 'orange', name: 'Orange', disabled: false, group: 'Citrus'},
  {value: 'lemon', name: 'Lemon', disabled: false, group: 'Citrus'},
  {value: 'blueberry', name: 'Blueberry', disabled: true, group: 'Berries'},
];

function scenarios(component: ListboxScenario['component']): ListboxScenario[] {
  const prefix = component === 'Selector' ? 'single' : 'multiple';
  const base = {
    component,
    options: flatOptions,
    expectedOptions: flatExpected,
    groups: [],
  };
  return [
    {...base, id: `${prefix}-unset`, values: []},
    {
      ...base,
      id: `${prefix}-selected`,
      values: component === 'Selector' ? ['apple'] : ['apple', 'banana'],
    },
    {...base, id: `${prefix}-disabled-selected`, values: ['cherry']},
    {
      ...base,
      id: `${prefix}-grouped`,
      options: groupedOptions,
      values: ['orange'],
      expectedOptions: groupedExpected,
      groups: ['Citrus', 'Berries'],
    },
    {
      ...base,
      id: `${prefix}-filtered`,
      options: groupedOptions,
      values: ['orange'],
      expectedOptions: [
        {value: 'lemon', name: 'Lemon', disabled: false, group: 'Citrus'},
      ],
      groups: ['Citrus'],
      hasSearch: true,
      query: 'lem',
    },
    {
      ...base,
      id: `${prefix}-custom-rtl`,
      values: ['banana'],
      customContent: true,
      hiddenLabel: true,
      direction: 'rtl',
      expectedOptions: [
        {value: 'apple', name: 'Apple details', disabled: false},
        {value: 'banana', name: 'Banana details', disabled: false},
        {value: 'cherry', name: 'Cherry details', disabled: true},
      ],
    },
    {
      ...base,
      id: `${prefix}-sheet`,
      values: ['apple'],
      presentation: 'bottom-sheet',
    },
    {
      ...base,
      id: `${prefix}-sheet-search`,
      values: ['banana'],
      presentation: 'bottom-sheet',
      hasSearch: true,
    },
    {...base, id: `${prefix}-loading`, values: ['apple'], isLoading: true},
  ];
}

export const LISTBOX_SCENARIOS: ReadonlyArray<ListboxScenario> = [
  ...scenarios('Selector'),
  ...scenarios('MultiSelector'),
  ...(['none', 'partial', 'all'] as const).map(state => ({
    id: `multiple-select-all-${state}`,
    component: 'MultiSelector' as const,
    options: flatOptions,
    values:
      state === 'none'
        ? []
        : state === 'partial'
          ? ['apple']
          : ['apple', 'banana'],
    groups: [],
    hasSelectAll: true,
    expectedOptions: [
      {
        value: 'select-all',
        name:
          state === 'partial' ? 'Select all, partially selected' : 'Select all',
        disabled: false,
        selected: state === 'all',
      },
      ...flatExpected,
    ],
  })),
];

export interface ListboxBindingPart {
  readonly role: 'listbox' | 'group' | 'option';
  readonly name?: string;
  readonly state: string;
  readonly facts: ListboxStateFacts;
}

export function listboxParts(
  scenario: ListboxScenario,
): ReadonlyArray<ListboxBindingPart> {
  const multiple = scenario.component === 'MultiSelector';
  return [
    {
      role: 'listbox',
      state: `${scenario.id}:listbox`,
      facts: {
        part: 'listbox',
        multiple,
        optionRelations: scenario.expectedOptions.map(
          option => `option:${option.value}`,
        ),
      },
    },
    ...scenario.groups.map(name => ({
      role: 'group' as const,
      name,
      state: `${scenario.id}:group:${name}`,
      facts: {part: 'group' as const, multiple},
    })),
    ...scenario.expectedOptions.map(option => ({
      role: 'option' as const,
      name: option.name,
      state: `${scenario.id}:option:${option.value}`,
      facts: {
        part: 'option' as const,
        multiple,
        selected: option.selected ?? scenario.values.includes(option.value),
        disabled: option.disabled,
        ownerGroup: option.group == null ? undefined : `group:${option.group}`,
      },
    })),
  ];
}

export const LISTBOX_EXCLUSIONS = [
  {
    owner: 'Selector/MultiSelector trigger and search input',
    reason:
      'Combobox, field validation, required/read-only/disabled trigger state, and opening/closing are separate contracts. This slice observes active popup parts.',
  },
  {
    owner: 'Selector/MultiSelector existing interaction suites',
    reason:
      'Keyboard selection, selection-follows-focus, disabled-option discovery, Home/End, typeahead, and callback policy are not newly adopted here.',
  },
  {
    owner: 'Selector/MultiSelector empty-state and live-region owners',
    reason:
      'Zero-result representation and announcement timing require their own authority/evidence. No required option is invented for an empty listbox.',
  },
  {
    owner: 'Typeahead, Tokenizer, PowerSearch, ComplexSelector, CommandPalette',
    reason:
      'Later bounded adopters; this first migration is limited to Selector and MultiSelector.',
  },
  {
    owner: 'Component-specific suites',
    reason:
      'Public ID forwarding, callback payloads, forms, value formatting, sorting, required/error status, and styling stay local. Selector has no independent uncontrolled selected-value owner; an omitted value is the unset state.',
  },
] as const;
