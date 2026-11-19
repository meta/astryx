// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleGroupA11y.stories.tsx
 * @input The CollapsibleGroup accordion binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:CollapsibleGroup AR4 (ACCORDION_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderAccordionState} from '../../../packages/core/src/Collapsible/__tests__/CollapsibleGroup.a11y.renders';
import {COLLAPSIBLE_GROUP_ACCORDION_STATES} from '../../../packages/core/src/Collapsible/__tests__/CollapsibleGroup.a11y.states';

const meta = {
  title: 'A11y/CollapsibleGroup Accordion',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(
  id: (typeof COLLAPSIBLE_GROUP_ACCORDION_STATES)[number]['id'],
): Story {
  const state = COLLAPSIBLE_GROUP_ACCORDION_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no CollapsibleGroup accordion state "${id}"`);
  }
  return {render: () => renderAccordionState(state)};
}

export const SingleCollapsedMiddle = storyFor('single-collapsed-middle');
export const SingleExpandedFirst = storyFor('single-expanded-first');
export const MultipleCollapsedLast = storyFor('multiple-collapsed-last');
export const SingleDisabledCollapsed = storyFor('single-disabled-collapsed');
export const SingleDisabledExpanded = storyFor('single-disabled-expanded');
