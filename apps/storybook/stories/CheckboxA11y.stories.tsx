// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxA11y.stories.tsx
 * @input Uses the shared Checkbox binding inventory and render map
 * @output One checked-in reproduction story for every Checkbox contract state
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {CHECKBOX_STATE_RENDERS} from '../../../packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.renders';
import {CHECKBOX_BINDING_STATES} from '../../../packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.states';

function storyFor(id: string): StoryObj {
  const state = CHECKBOX_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no binding state "${id}" — see Checkbox.a11y.states.ts`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => CHECKBOX_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Checkbox pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the shared checkbox-pattern accessibility contract.',
      },
    },
  },
};

export default meta;

export const InputUnchecked = storyFor('input-unchecked');
export const InputChecked = storyFor('input-checked');
export const InputMixed = storyFor('input-mixed');
export const InputDescribed = storyFor('input-described');
export const InputHiddenLabel = storyFor('input-hidden-label');
export const InputDisabled = storyFor('input-disabled');
export const InputDisabledWithMessage = storyFor('input-disabled-with-message');
export const InputLoading = storyFor('input-loading');
export const InputReadOnly = storyFor('input-read-only');
export const InputHandlerlessReadOnly = storyFor('input-handlerless-read-only');
export const InputRequired = storyFor('input-required');
export const InputUnderRequiredDefault = storyFor(
  'input-under-required-default',
);
export const InputInvalid = storyFor('input-invalid');
export const InputWarning = storyFor('input-warning');
export const InputSuccess = storyFor('input-success');

export const ListItemUnchecked = storyFor('list-item-unchecked');
export const ListItemChecked = storyFor('list-item-checked');
export const ListItemMixed = storyFor('list-item-mixed');
export const ListItemDescribed = storyFor('list-item-described');
export const ListItemRichLabelVisibleName = storyFor(
  'list-item-rich-label-visible-name',
);
export const ListItemDisabled = storyFor('list-item-disabled');
export const ListItemLoading = storyFor('list-item-loading');
export const ListItemReadOnly = storyFor('list-item-read-only');
export const ListItemHandlerlessReadOnly = storyFor(
  'list-item-handlerless-read-only',
);
export const ListItemGroupDisabledWithMessage = storyFor(
  'list-item-group-disabled-with-message',
);

export const MenuItemUnchecked = storyFor('menu-item-unchecked');
export const MenuItemChecked = storyFor('menu-item-checked');
export const MenuItemDescribed = storyFor('menu-item-described');
export const MenuItemHandlerlessInert = storyFor('menu-item-handlerless-inert');
export const MenuItemDisabled = storyFor('menu-item-disabled');

export const CardUnchecked = storyFor('card-unchecked');
export const CardChecked = storyFor('card-checked');
export const CardDisabled = storyFor('card-disabled');
