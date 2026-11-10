// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipA11y.stories.tsx
 * @input The Tooltip binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for the Tooltip binding (TOOLTIP_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderTooltipState} from '../../../packages/core/src/Tooltip/__tests__/Tooltip.a11y.renders';
import {TOOLTIP_BINDING_STATES} from '../../../packages/core/src/Tooltip/__tests__/Tooltip.a11y.states';

const meta = {
  title: 'A11y/Tooltip',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof TOOLTIP_BINDING_STATES)[number]['id']): Story {
  const state = TOOLTIP_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Tooltip binding state "${id}"`);
  }
  return {render: () => renderTooltipState(state)};
}

export const WrappedButton = storyFor('wrapped-button');
export const TextTrigger = storyFor('text-trigger');
export const AnchorRefWithHint = storyFor('anchor-ref-with-hint');
export const UseTooltipHook = storyFor('use-tooltip-hook');
