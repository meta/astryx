// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioGroupA11y.stories.tsx
 * @input Uses the shared radio-group binding inventory and render map
 * @output One checked-in reproduction story for every radio-group contract state
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {RADIO_GROUP_STATE_RENDERS} from '../../../packages/core/src/RadioList/__tests__/RadioGroup.a11y.renders';
import {RADIO_GROUP_BINDING_STATES} from '../../../packages/core/src/RadioList/__tests__/RadioGroup.a11y.states';

function storyFor(id: string): StoryObj {
  const state = RADIO_GROUP_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no binding state "${id}" — see RadioGroup.a11y.states.ts`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => RADIO_GROUP_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Radio group pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the shared radio-group accessibility contract.',
      },
    },
  },
};

export default meta;

export const RadioListGroupSelectedLtr = storyFor(
  'radio-list-group-selected-ltr',
);
export const RadioListGroupSelectedRtl = storyFor(
  'radio-list-group-selected-rtl',
);
export const RadioListGroupSelectedVertical = storyFor(
  'radio-list-group-selected-vertical',
);
export const RadioListGroupNoneSelected = storyFor(
  'radio-list-group-none-selected',
);
export const RadioListGroupRequiredInvalidDescribed = storyFor(
  'radio-list-group-required-invalid-described',
);
export const RadioListGroupDisabledWithMessage = storyFor(
  'radio-list-group-disabled-with-message',
);
export const RadioListOptionUnselectedDescribed = storyFor(
  'radio-list-option-unselected-described',
);
export const RadioListOptionSelected = storyFor('radio-list-option-selected');
export const RadioListOptionDisabled = storyFor('radio-list-option-disabled');
export const RadioListOptionGroupDisabled = storyFor(
  'radio-list-option-group-disabled',
);
export const RadioListOptionDisabledWithMessage = storyFor(
  'radio-list-option-disabled-with-message',
);

export const SegmentedGroupSelectedLtr = storyFor(
  'segmented-group-selected-ltr',
);
export const SegmentedGroupSelectedRtl = storyFor(
  'segmented-group-selected-rtl',
);
export const SegmentedGroupNoneSelected = storyFor(
  'segmented-group-none-selected',
);
export const SegmentedGroupDisabled = storyFor('segmented-group-disabled');
export const SegmentedGroupDisabledWithMessage = storyFor(
  'segmented-group-disabled-with-message',
);
export const SegmentedOptionUnselected = storyFor(
  'segmented-option-unselected',
);
export const SegmentedOptionSelectedHiddenLabel = storyFor(
  'segmented-option-selected-hidden-label',
);
export const SegmentedOptionDisabled = storyFor('segmented-option-disabled');
export const SegmentedOptionGroupDisabled = storyFor(
  'segmented-option-group-disabled',
);
export const SegmentedOptionGroupDisabledWithMessage = storyFor(
  'segmented-option-group-disabled-with-message',
);

export const MenuGroupSelected = storyFor('menu-group-selected');
export const MenuGroupNoneSelected = storyFor('menu-group-none-selected');
export const MenuOptionUnselectedDescribed = storyFor(
  'menu-option-unselected-described',
);
export const MenuOptionSelected = storyFor('menu-option-selected');
export const MenuOptionDisabled = storyFor('menu-option-disabled');
