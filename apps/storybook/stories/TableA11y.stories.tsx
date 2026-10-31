// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One checked-in Storybook fixture for every Table binding state. */

import type {Meta, StoryObj} from '@storybook/react';
import {TABLE_A11Y_RENDERS} from '../../../packages/core/src/Table/__tests__/Table.a11y.renders';
import {TABLE_A11Y_STATES} from '../../../packages/core/src/Table/__tests__/Table.a11y.states';

function storyFor(id: (typeof TABLE_A11Y_STATES)[number]['id']): StoryObj {
  const state = TABLE_A11Y_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Table binding state "${id}"`);
  }
  return {
    name: `Table — ${state.id}`,
    render: () => TABLE_A11Y_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Table pattern',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};

export default meta;

export const DataColumns = storyFor('data-columns');
export const SortedDescending = storyFor('sorted-descending');
export const ChildrenRowHeadersRtl = storyFor('children-row-headers-rtl');
export const EmptyData = storyFor('empty-data');
