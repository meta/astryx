// Copyright (c) Meta Platforms, Inc. and affiliates.

/** AST-021 state inventory for the NumberInput spinbutton binding. */

import type {SpinbuttonStateFacts} from '@astryxdesign/a11y-spec';

export interface NumberInputA11yState {
  readonly id: string;
  readonly summary: string;
  readonly facts: SpinbuttonStateFacts;
  readonly storyId: string;
}

export type NumberInputA11yRow = (typeof NUMBER_INPUT_A11Y_STATES)[number];

const facts = (
  overrides: Partial<SpinbuttonStateFacts> = {},
): SpinbuttonStateFacts => ({
  value: 5,
  min: null,
  max: null,
  valueText: null,
  disabled: false,
  readOnly: false,
  focusable: true,
  stepUpValue: null,
  stepDownValue: null,
  ...overrides,
});

const story = (id: string) => `a11y-spinbutton-pattern--${id}`;

export const NUMBER_INPUT_A11Y_STATES = [
  {
    id: 'default-value',
    summary: 'a labelled editable value',
    facts: facts(),
    storyId: story('default-value'),
  },
  {
    id: 'bounded-value',
    summary: 'a value with minimum and maximum bounds',
    facts: facts({min: 1, max: 9}),
    storyId: story('bounded-value'),
  },
  {
    id: 'formatted-value',
    summary: 'a committed value with formatted value text',
    facts: facts({valueText: '5 GB'}),
    storyId: story('formatted-value'),
  },
  {
    id: 'empty-value',
    summary: 'an empty spinbutton with no committed numeric value',
    facts: facts({value: null}),
    storyId: story('empty-value'),
  },
  {
    id: 'invalid',
    summary: 'an invalid spinbutton that preserves its shared semantics',
    facts: facts(),
    storyId: story('invalid'),
  },
  {
    id: 'disabled',
    summary: 'a natively disabled spinbutton outside the tab sequence',
    facts: facts({disabled: true, focusable: false}),
    storyId: story('disabled'),
  },
  {
    id: 'disabled-with-message',
    summary: 'an unavailable spinbutton kept focusable for its reason',
    facts: facts({disabled: true}),
    storyId: story('disabled-with-message'),
  },
  {
    id: 'read-only',
    summary: 'a read-only spinbutton that stays focusable',
    facts: facts({readOnly: true}),
    storyId: story('read-only'),
  },
  {
    id: 'arrow-stepping',
    summary: 'an editable spinbutton with one-step arrow movement',
    facts: facts({stepUpValue: 6, stepDownValue: 4}),
    storyId: story('arrow-stepping'),
  },
] as const satisfies ReadonlyArray<NumberInputA11yState>;

export const NUMBER_INPUT_A11Y_EXCLUSIONS = [
  {
    owner: 'NumberInput commit policy',
    reason:
      'Typed draft parsing, formatting, blur/Enter commit, clamping, callbacks, wheel input, and form submission remain component-specific.',
  },
  {
    owner: 'Button pattern',
    reason:
      'Optional increment, decrement, clear, and status controls are separate role-bearing button parts.',
  },
  {
    owner: 'Date and time inputs',
    reason:
      'Segmented date/time fields are not included until a part is shown to expose the same spinbutton semantics.',
  },
  {
    owner: 'APG optional keys',
    reason:
      'PageUp, PageDown, Home, and End are not adopted by current Astryx authority and are not inferred from the APG example.',
  },
  {
    owner: 'AST-009',
    reason:
      'This binding claims computed browser exposure and keyboard behavior, not speech, braille, announcement timing, or virtual-cursor behavior.',
  },
] as const;
