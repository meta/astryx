// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One checked-in Storybook fixture for every Link binding state. */

import type {Meta, StoryObj} from '@storybook/react';
import {LINK_A11Y_RENDERS} from '../../../packages/core/src/Link/__tests__/Link.a11y.renders';
import {LINK_A11Y_STATES} from '../../../packages/core/src/Link/__tests__/Link.a11y.states';

function storyFor(id: (typeof LINK_A11Y_STATES)[number]['id']): StoryObj {
  const state = LINK_A11Y_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Link binding state "${id}"`);
  }
  return {
    name: `Link — ${state.id}`,
    render: () => LINK_A11Y_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Link pattern',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};

export default meta;

export const TextNative = storyFor('text-native');
export const IconLabelled = storyFor('icon-labelled');
export const CurrentPage = storyFor('current-page');
export const ExternalNewTab = storyFor('external-new-tab');
export const ProviderRouter = storyFor('provider-router');
export const AsRouter = storyFor('as-router');
