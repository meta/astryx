// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabsA11y.stories.tsx
 * @input Uses the shared Tabs binding inventory and render map
 * @output One checked-in reproduction story for every explicit Tabs contract state
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {TABS_STATE_RENDERS} from '../../../packages/core/src/TabList/__tests__/Tabs.a11y.renders';
import {TABS_BINDING_STATES} from '../../../packages/core/src/TabList/__tests__/Tabs.a11y.states';

function storyFor(id: string): StoryObj {
  const state = TABS_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no binding state "${id}" — see Tabs.a11y.states.ts`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => TABS_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Tabs pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the explicit horizontal Tabs accessibility contract.',
      },
    },
  },
};

export default meta;

export const TabListSelectedLtr = storyFor('tab-list-selected-ltr');
export const TabListSelectedRtl = storyFor('tab-list-selected-rtl');
export const TabListDisabledSkip = storyFor('tab-list-disabled-skip');
export const TabSelectedVisibleLabel = storyFor('tab-selected-visible-label');
export const TabUnselectedVisibleLabel = storyFor(
  'tab-unselected-visible-label',
);
export const TabDisabledUnselected = storyFor('tab-disabled-unselected');
export const TabSelectedHiddenLabel = storyFor('tab-selected-hidden-label');
export const TabpanelActive = storyFor('tabpanel-active');
export const TabpanelInactive = storyFor('tabpanel-inactive');
