// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListA11y.stories.tsx
 * @input TransferList with reordering, and a switch that disables the list
 * @output A fixture for the Chromium check that a disabled list keeps each
 *   reorder handle focusable and disabled, with the focus where it was. It is
 *   excluded from the visual matrix
 * @position Browser fixture for TransferList's disabled state
 */

import {useMemo, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {TransferList} from '@astryxdesign/lab';
import type {TransferListOption} from '@astryxdesign/lab';
import {createReorderable} from '@astryxdesign/core';
import {Switch} from '@astryxdesign/core/Switch';

const meta: Meta = {
  title: 'A11y/TransferList',
  tags: ['no-visual'],
};

export default meta;

const OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {value: 'name', label: 'Name'},
  {value: 'owner', label: 'Owner'},
  {value: 'status', label: 'Status'},
  {value: 'priority', label: 'Priority'},
];

export const Disabled: StoryObj = {
  render: function DisabledStory() {
    const [value, setValue] = useState<readonly string[]>([
      'name',
      'owner',
      'status',
    ]);
    const [isDisabled, setIsDisabled] = useState(false);
    const reorderable = useMemo(
      () =>
        createReorderable<string>({
          onReorder: ({key, to}) =>
            setValue(current => {
              const next = current.filter(item => item !== key);
              next.splice(to, 0, key);
              return next;
            }),
        }),
      [],
    );
    return (
      <>
        <Switch
          label="Disable the list"
          value={isDisabled}
          onChange={checked => setIsDisabled(checked)}
        />
        <TransferList
          label="Visible fields"
          options={OPTIONS}
          value={value}
          onChange={setValue}
          reorderable={reorderable}
          isDisabled={isDisabled}
        />
      </>
    );
  },
};
