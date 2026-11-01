// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuA11y.stories.tsx
 * @input The DropdownMenu menu-surface binding states
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for the DropdownMenu menu surface (MENU_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderMenuState} from '../../../packages/core/src/DropdownMenu/__tests__/Menu.a11y.renders';
import {MENU_BINDING_STATES} from '../../../packages/core/src/DropdownMenu/__tests__/Menu.a11y.states';

const meta = {
  title: 'A11y/Menu',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof MENU_BINDING_STATES)[number]['id']): Story {
  const state = MENU_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Menu binding state "${id}"`);
  }
  return {render: () => renderMenuState(state)};
}

export const DropdownActions = storyFor('dropdown-actions');
export const DropdownSelectable = storyFor('dropdown-selectable');
export const DropdownSelectableCheckboxRow = storyFor(
  'dropdown-selectable-checkbox-row',
);
