// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One checked-in Storybook fixture for every Layout regions landmark state. */

import type {Meta, StoryObj} from '@storybook/react';
import {LAYOUT_LANDMARK_A11Y_RENDERS} from '../../../packages/core/src/Layout/__tests__/Layout.a11y.renders';
import {LAYOUT_LANDMARK_A11Y_STATES} from '../../../packages/core/src/Layout/__tests__/Layout.a11y.states';

function storyFor(
  id: (typeof LAYOUT_LANDMARK_A11Y_STATES)[number]['id'],
): StoryObj {
  const state = LAYOUT_LANDMARK_A11Y_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no Layout regions binding state "${id}"`);
  }
  return {
    name: `${state.region} — ${state.id}`,
    render: () => LAYOUT_LANDMARK_A11Y_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Landmark pattern',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};

export default meta;

export const HeaderBanner = storyFor('header-banner');
export const ContentMain = storyFor('content-main');
export const FooterContentinfo = storyFor('footer-contentinfo');
export const StartEndNavigationRtl = storyFor('start-end-navigation-rtl');
export const NestedPanelRegion = storyFor('nested-panel-region');
