// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertA11y.stories.tsx
 * @input Uses the Banner alert-state binding inventory and render map
 * @output One checked-in reproduction story for every Banner alert contract state
 * @position Stable browser fixtures required by AST-009 FR30 and AST-021
 */

import type {Meta, StoryObj} from '@storybook/react';
import {BANNER_ALERT_STATE_RENDERS} from '../../../packages/core/src/Banner/__tests__/Alert.a11y.renders';
import {BANNER_ALERT_BINDING_STATES} from '../../../packages/core/src/Banner/__tests__/Alert.a11y.states';

function alertStory(id: keyof typeof BANNER_ALERT_STATE_RENDERS): StoryObj {
  const state = BANNER_ALERT_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no Banner alert binding state "${id}"`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => BANNER_ALERT_STATE_RENDERS[id](),
  };
}

const meta: Meta = {
  title: 'a11y/Alert pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Actual Banner states that explicitly request urgent alert semantics. Browser evidence covers role, assertive channel, exposed text, atomicity, and focus preservation; speech and timing remain AST-009 evidence.',
      },
    },
  },
};

export default meta;

export const BannerErrorAlertMounted = alertStory('banner-error-alert-mounted');
export const BannerWarningAlertDismissible = alertStory(
  'banner-warning-alert-dismissible',
);
export const BannerWarningAlertCollapsible = alertStory(
  'banner-warning-alert-collapsible',
);
export const BannerErrorAlertEndContent = alertStory(
  'banner-error-alert-end-content',
);
export const BannerErrorAlertDescription = alertStory(
  'banner-error-alert-description',
);
