// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextInputA11y.stories.tsx
 * @input Uses the shared text-input binding inventory and render map
 * @output One checked-in reproduction story for every TextInput/TextArea state
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {TEXT_INPUT_STATE_RENDERS} from '../../../packages/core/src/TextInput/__tests__/TextInput.a11y.renders';
import {TEXT_INPUT_BINDING_STATES} from '../../../packages/core/src/TextInput/__tests__/TextInput.a11y.states';

function storyFor(id: string): StoryObj {
  const state = TEXT_INPUT_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no binding state "${id}" — see TextInput.a11y.states.ts`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => TEXT_INPUT_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Text input pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the shared native text-input accessibility contract.',
      },
    },
  },
};

export default meta;

export const InputEmptyPlaceholder = storyFor('input-empty-placeholder');
export const InputValued = storyFor('input-valued');
export const InputHiddenLabel = storyFor('input-hidden-label');
export const InputDescribed = storyFor('input-described');
export const InputOptional = storyFor('input-optional');
export const InputRequired = storyFor('input-required');
export const InputError = storyFor('input-error');
export const InputErrorWithoutMessage = storyFor('input-error-without-message');
export const InputWarningDetached = storyFor('input-warning-detached');
export const InputSuccessTooltip = storyFor('input-success-tooltip');
export const InputDisabled = storyFor('input-disabled');
export const InputDisabledWithMessage = storyFor('input-disabled-with-message');
export const InputReadOnly = storyFor('input-read-only');
export const InputPassword = storyFor('input-password');
export const InputGroupDescribed = storyFor('input-group-described');

export const TextareaEmptyPlaceholder = storyFor('textarea-empty-placeholder');
export const TextareaValued = storyFor('textarea-valued');
export const TextareaHiddenLabel = storyFor('textarea-hidden-label');
export const TextareaDescribed = storyFor('textarea-described');
export const TextareaOptional = storyFor('textarea-optional');
export const TextareaRequired = storyFor('textarea-required');
export const TextareaError = storyFor('textarea-error');
export const TextareaErrorWithoutMessage = storyFor(
  'textarea-error-without-message',
);
export const TextareaWarningDetached = storyFor('textarea-warning-detached');
export const TextareaSuccessTooltip = storyFor('textarea-success-tooltip');
export const TextareaDisabled = storyFor('textarea-disabled');
export const TextareaDisabledWithMessage = storyFor(
  'textarea-disabled-with-message',
);
export const TextareaReadOnly = storyFor('textarea-read-only');
export const TextareaOverLimit = storyFor('textarea-over-limit');
