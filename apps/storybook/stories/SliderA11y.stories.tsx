// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderA11y.stories.tsx
 * @input The Slider binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:Slider AR1 (SLIDER_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderSliderState} from '../../../packages/core/src/Slider/__tests__/Slider.a11y.renders';
import {SLIDER_BINDING_STATES} from '../../../packages/core/src/Slider/__tests__/Slider.a11y.states';

const meta = {
  title: 'A11y/Slider',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof SLIDER_BINDING_STATES)[number]['id']): Story {
  const state = SLIDER_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Slider binding state "${id}"`);
  }
  return {render: () => renderSliderState(state)};
}

export const Horizontal = storyFor('horizontal');
export const Vertical = storyFor('vertical');
export const HorizontalRtl = storyFor('horizontal-rtl');
export const Formatted = storyFor('formatted');
export const DisabledWithMessage = storyFor('disabled-with-message');
export const StepThree = storyFor('step-three');
