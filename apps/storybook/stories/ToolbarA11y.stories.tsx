// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToolbarA11y.stories.tsx
 * @input The Toolbar binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for the Toolbar binding (TOOLBAR_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderToolbarState} from '../../../packages/core/src/Toolbar/__tests__/Toolbar.a11y.renders';
import {TOOLBAR_BINDING_STATES} from '../../../packages/core/src/Toolbar/__tests__/Toolbar.a11y.states';

const meta = {
  title: 'A11y/Toolbar',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof TOOLBAR_BINDING_STATES)[number]['id']): Story {
  const state = TOOLBAR_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Toolbar binding state "${id}"`);
  }
  return {render: () => renderToolbarState(state)};
}

export const Horizontal = storyFor('horizontal');
export const HorizontalRtl = storyFor('horizontal-rtl');
export const Vertical = storyFor('vertical');
export const FirstControlDisabled = storyFor('first-control-disabled');
