// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One checked-in Storybook fixture for every NumberInput Spinbutton state. */

import type {Meta, StoryObj} from '@storybook/react';
import {NUMBER_INPUT_A11Y_RENDERS} from '../../../packages/core/src/NumberInput/__tests__/NumberInput.a11y.renders';
import {NUMBER_INPUT_A11Y_STATES} from '../../../packages/core/src/NumberInput/__tests__/NumberInput.a11y.states';

function storyFor(id: string): StoryObj {
  const state = NUMBER_INPUT_A11Y_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no binding state "${id}"`);
  }
  return {
    name: `NumberInput — ${state.id}`,
    render: () => NUMBER_INPUT_A11Y_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Spinbutton pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the NumberInput Spinbutton accessibility contract.',
      },
    },
  },
};

export default meta;
export const DefaultValue = storyFor('default-value');
export const BoundedValue = storyFor('bounded-value');
export const FormattedValue = storyFor('formatted-value');
export const EmptyValue = storyFor('empty-value');
export const Invalid = storyFor('invalid');
export const Disabled = storyFor('disabled');
export const DisabledWithMessage = storyFor('disabled-with-message');
export const ReadOnly = storyFor('read-only');
export const ArrowStepping = storyFor('arrow-stepping');
