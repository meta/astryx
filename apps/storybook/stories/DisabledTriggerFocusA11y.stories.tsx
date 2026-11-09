// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DisabledTriggerFocusA11y.stories.tsx
 * @input Uses Selector and ComplexSelector with an `isDisabled` story arg
 * @output Browser fixtures for a trigger that becomes disabled while focused
 * @position Stable fixtures for DisabledTriggerFocus.a11y.chromium.spec.ts
 *
 * A test drives `isDisabled` through the story args while the trigger holds
 * focus, so the trigger is disabled in place rather than by a press elsewhere
 * that would move focus first.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ComplexSelector} from '../../../packages/core/src/ComplexSelector/ComplexSelector';
import {Selector} from '../../../packages/core/src/Selector/Selector';

type Args = {isDisabled: boolean};

const meta: Meta<Args> = {
  title: 'a11y/Disabled trigger focus',
  tags: ['no-visual'],
  args: {isDisabled: false},
};
export default meta;

export const SelectorTrigger: StoryObj<Args> = {
  name: 'Selector trigger',
  render: ({isDisabled}) => {
    const [value, setValue] = useState('Apple');
    return (
      <Selector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={value}
        onChange={setValue}
        isDisabled={isDisabled}
      />
    );
  },
};

export const ComplexSelectorTrigger: StoryObj<Args> = {
  name: 'ComplexSelector trigger',
  render: ({isDisabled}) => (
    <ComplexSelector<string>
      label="View options"
      value="Comfortable"
      onChange={() => {}}
      isDisabled={isDisabled}>
      {() => <button type="button">Apply</button>}
    </ComplexSelector>
  ),
};
