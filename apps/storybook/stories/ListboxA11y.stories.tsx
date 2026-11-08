// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListboxA11y.stories.tsx
 * @input Uses Selector, MultiSelector, and the bounded Listbox state inventory
 * @output Stable browser reproductions of existing listbox/group/option states
 * @position Accessibility contract fixtures; no visual baseline or product change.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Selector} from '@astryxdesign/core/Selector';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {LISTBOX_SCENARIOS} from '../../../packages/core/src/Selector/__tests__/Listbox.a11y.states';

function storyFor(id: string): StoryObj {
  const scenario = LISTBOX_SCENARIOS.find(candidate => candidate.id === id);
  if (scenario == null) {
    throw new Error(`Missing Listbox scenario: ${id}`);
  }
  return {
    render: () => (
      <div
        dir={scenario.direction ?? 'ltr'}
        data-listbox-scenario={scenario.id}>
        {scenario.component === 'Selector' ? (
          <Selector
            label="Fruit"
            options={scenario.options}
            value={scenario.values[0]}
            onChange={() => {}}
            hasSearch={scenario.hasSearch}
            presentation={scenario.presentation}
            isLoading={scenario.isLoading}
            isLabelHidden={scenario.hiddenLabel}
            renderOption={
              scenario.customContent
                ? option => <span>{option.label} details</span>
                : undefined
            }
            isDefaultOpen
          />
        ) : (
          <MultiSelector
            label="Fruit"
            options={scenario.options}
            value={scenario.values}
            onChange={() => {}}
            hasSearch={scenario.hasSearch}
            hasSelectAll={scenario.hasSelectAll}
            presentation={scenario.presentation}
            isLoading={scenario.isLoading}
            isLabelHidden={scenario.hiddenLabel}
            renderOption={
              scenario.customContent
                ? option => <span>{option.label} details</span>
                : undefined
            }
            isDefaultOpen
          />
        )}
      </div>
    ),
  };
}

const meta: Meta = {
  title: 'a11y/Listbox pattern',
  tags: ['no-visual'],
};
export default meta;

export const SingleUnset = storyFor('single-unset');
export const SingleSelected = storyFor('single-selected');
export const SingleDisabledSelected = storyFor('single-disabled-selected');
export const SingleGrouped = storyFor('single-grouped');
export const SingleFiltered = storyFor('single-filtered');
export const SingleCustomRtl = storyFor('single-custom-rtl');
export const SingleSheet = storyFor('single-sheet');
export const SingleSheetSearch = storyFor('single-sheet-search');
export const SingleLoading = storyFor('single-loading');
export const MultipleUnset = storyFor('multiple-unset');
export const MultipleSelected = storyFor('multiple-selected');
export const MultipleDisabledSelected = storyFor('multiple-disabled-selected');
export const MultipleGrouped = storyFor('multiple-grouped');
export const MultipleFiltered = storyFor('multiple-filtered');
export const MultipleCustomRtl = storyFor('multiple-custom-rtl');
export const MultipleSheet = storyFor('multiple-sheet');
export const MultipleSheetSearch = storyFor('multiple-sheet-search');
export const MultipleLoading = storyFor('multiple-loading');
export const MultipleSelectAllNone = storyFor('multiple-select-all-none');
export const MultipleSelectAllPartial = storyFor('multiple-select-all-partial');
export const MultipleSelectAllAll = storyFor('multiple-select-all-all');
