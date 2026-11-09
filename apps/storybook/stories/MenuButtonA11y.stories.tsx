// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuButtonA11y.stories.tsx
 * @input The DropdownMenu and MoreMenu menu-button binding states
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:DropdownMenu AR4 and component:MoreMenu AR1 (MENU_BUTTON_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderMenuButtonState} from '../../../packages/core/src/DropdownMenu/__tests__/MenuButton.a11y.renders';
import {MENU_BUTTON_BINDING_STATES} from '../../../packages/core/src/DropdownMenu/__tests__/MenuButton.a11y.states';

const meta = {
  title: 'A11y/MenuButton',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(
  id: (typeof MENU_BUTTON_BINDING_STATES)[number]['id'],
): Story {
  const state = MENU_BUTTON_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no Menu Button binding state "${id}"`);
  }
  return {render: () => renderMenuButtonState(state)};
}

export const DropdownButtonClosed = storyFor('dropdown-button-closed');
export const DropdownButtonOpen = storyFor('dropdown-button-open');
export const DropdownRenderTriggerClosed = storyFor(
  'dropdown-render-trigger-closed',
);
export const DropdownButtonDisabled = storyFor('dropdown-button-disabled');
export const MoreMenuClosed = storyFor('more-menu-closed');
export const MoreMenuDisabled = storyFor('more-menu-disabled');
