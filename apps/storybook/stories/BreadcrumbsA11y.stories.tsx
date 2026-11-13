// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One checked-in Storybook fixture for every Breadcrumbs semantic state. */

import type {Meta, StoryObj} from '@storybook/react';
import {BREADCRUMB_A11Y_RENDERS} from '../../../packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.renders';
import {BREADCRUMB_A11Y_STATES} from '../../../packages/core/src/Breadcrumbs/__tests__/Breadcrumbs.a11y.states';

function storyFor(id: (typeof BREADCRUMB_A11Y_STATES)[number]['id']): StoryObj {
  const state = BREADCRUMB_A11Y_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Breadcrumbs binding state "${id}"`);
  }
  return {
    name: `Breadcrumbs — ${state.id}`,
    render: () => BREADCRUMB_A11Y_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Breadcrumb pattern',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};

export default meta;

export const ExplicitCurrentDefault = storyFor('explicit-current-default');
export const AutoCurrentCustomLabelRtl = storyFor(
  'auto-current-custom-label-rtl',
);
export const NoCurrentOptOut = storyFor('no-current-opt-out');
