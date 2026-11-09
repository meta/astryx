// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToggleButtonPatternA11y.stories.tsx
 * @input Uses the shared ToggleButton accessibility state inventory and render map
 * @output One checked-in browser fixture per representative state
 * @position Stable reproduction path for the Chromium contract binding.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {TOGGLE_BUTTON_STATE_RENDERS} from '../../../packages/core/src/ToggleButton/__tests__/ToggleButton.a11y.renders';
import {TOGGLE_BUTTON_BINDING_STATES} from '../../../packages/core/src/ToggleButton/__tests__/ToggleButton.a11y.states';

function storyFor(
  id: (typeof TOGGLE_BUTTON_BINDING_STATES)[number]['id'],
): StoryObj {
  const state = TOGGLE_BUTTON_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no ToggleButton binding state "${id}"`);
  }
  return {name: state.summary, render: TOGGLE_BUTTON_STATE_RENDERS[id]};
}

const meta: Meta = {
  title: 'a11y/Toggle Button pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Representative ToggleButton states for the reusable toggle-button accessibility contract.',
      },
    },
  },
};

export default meta;
export const StandaloneUnpressed = storyFor('standalone-unpressed');
export const StandalonePressed = storyFor('standalone-pressed');
export const IconOnlyUnpressed = storyFor('icon-only-unpressed');
export const ComposedLabelPressed = storyFor('composed-label-pressed');
export const DisabledUnpressed = storyFor('disabled-unpressed');
export const DisabledWithTooltipPressed = storyFor(
  'disabled-with-tooltip-pressed',
);
export const SingleGroupUnpressed = storyFor('single-group-unpressed');
export const SingleGroupPressed = storyFor('single-group-pressed');
export const SingleGroupMemberDisabled = storyFor(
  'single-group-member-disabled',
);
export const SingleGroupDisabledMemberSilent = storyFor(
  'single-group-disabled-member-silent',
);
export const MultipleGroupUnpressed = storyFor('multiple-group-unpressed');
export const MultipleGroupPressed = storyFor('multiple-group-pressed');
