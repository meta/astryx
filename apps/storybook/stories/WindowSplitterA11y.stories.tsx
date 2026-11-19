// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file WindowSplitterA11y.stories.tsx
 * @input The ResizeHandle binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:Resizable AR1 (WINDOW_SPLITTER_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderResizeHandleState} from '../../../packages/core/src/Resizable/__tests__/ResizeHandle.a11y.renders';
import {RESIZE_HANDLE_BINDING_STATES} from '../../../packages/core/src/Resizable/__tests__/ResizeHandle.a11y.states';

const meta = {
  title: 'A11y/WindowSplitter',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(
  id: (typeof RESIZE_HANDLE_BINDING_STATES)[number]['id'],
): Story {
  const state = RESIZE_HANDLE_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no ResizeHandle binding state "${id}"`);
  }
  return {render: () => renderResizeHandleState(state)};
}

export const BareHorizontal = storyFor('bare-horizontal');
export const BareVertical = storyFor('bare-vertical');
export const BareReversed = storyFor('bare-reversed');
export const BareRtl = storyFor('bare-rtl');
export const BareCollapsible = storyFor('bare-collapsible');
export const BareSmallMin = storyFor('bare-small-min');
export const BareStartCollapsed = storyFor('bare-start-collapsed');
export const BareUnbounded = storyFor('bare-unbounded');
export const BareUnboundedInContainer = storyFor('bare-unbounded-in-container');
export const BareSnapped = storyFor('bare-snapped');
export const BareDocumentedUsage = storyFor('bare-documented-usage');
export const BareDisabled = storyFor('bare-disabled');
