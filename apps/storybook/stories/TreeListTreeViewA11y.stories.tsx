// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListTreeViewA11y.stories.tsx
 * @input The TreeList tree-view binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:TreeList AR1 (TREE_VIEW_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderTreeListState} from '../../../packages/core/src/TreeList/__tests__/TreeList.a11y.renders';
import {TREE_LIST_BINDING_STATES} from '../../../packages/core/src/TreeList/__tests__/TreeList.a11y.states';

const meta = {
  title: 'A11y/TreeList Tree View',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof TREE_LIST_BINDING_STATES)[number]['id']): Story {
  const state = TREE_LIST_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no TreeList tree-view state "${id}"`);
  }
  return {render: () => renderTreeListState(state)};
}

export const ClosedParentTabStop = storyFor('closed-parent-tab-stop');
export const OpenParentTabStop = storyFor('open-parent-tab-stop');
export const EndNode = storyFor('end-node');
export const ClosedParentRtl = storyFor('closed-parent-rtl');
export const DisabledEndNode = storyFor('disabled-end-node');
