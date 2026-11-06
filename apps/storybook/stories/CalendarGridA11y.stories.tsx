// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarGridA11y.stories.tsx
 * @input The Calendar grid binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:Calendar AR1 (GRID_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderCalendarState} from '../../../packages/core/src/Calendar/__tests__/Calendar.a11y.renders';
import {CALENDAR_BINDING_STATES} from '../../../packages/core/src/Calendar/__tests__/Calendar.a11y.states';

const meta = {
  title: 'A11y/CalendarGrid',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(id: (typeof CALENDAR_BINDING_STATES)[number]['id']): Story {
  const state = CALENDAR_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Calendar binding state "${id}"`);
  }
  return {render: () => renderCalendarState(state)};
}

export const SingleSelected = storyFor('single-selected');
export const SingleRtl = storyFor('single-rtl');
export const SingleWeekNumbers = storyFor('single-week-numbers');
export const RangeTwoMonths = storyFor('range-two-months');
