// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectorEmptyStateA11y.stories.tsx
 * @input Uses Selector with caller-supplied ReactNode empty-state content
 * @output Browser fixtures for the empty-state live-region announcement
 * @position Stable fixtures for EmptyStateAnnouncement.a11y.chromium.spec.ts
 *
 * The panel's empty message is `role="presentation"` — `role="listbox"`
 * permits only `option` and `group` children — so it reaches assistive
 * technology only through the shared polite live region. This story covers
 * what a DOM emulator cannot settle: whether the region actually carries the
 * rendered words in a shipping engine, and whether the message element has
 * stayed out of the listbox's own accessibility tree.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Selector} from '../../../packages/core/src/Selector/Selector';

const OPTIONS = [
  {value: 'apple', label: 'Apple'},
  {value: 'banana', label: 'Banana'},
];

const meta: Meta = {
  title: 'a11y/Selector empty state',
  tags: ['no-visual'],
};
export default meta;

/** An element in the dead end: the region must speak its text, not a default. */
export const ElementEmptySearchText: StoryObj = {
  name: 'element emptySearchText',
  render: () => (
    <div data-empty-scenario="element">
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="apple"
        onChange={() => {}}
        hasSearch
        emptySearchText={
          <span>
            Nothing like that here. <a href="#new">Add a fruit</a>
            <span aria-hidden="true"> →</span>
          </span>
        }
      />
    </div>
  ),
};
