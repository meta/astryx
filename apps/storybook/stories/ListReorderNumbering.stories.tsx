// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderNumbering.stories.tsx
 * @input List with `reorderable` and `listStyle`, Button
 * @output A reorderable List whose numbering a button turns on and off
 * @position Storybook demonstration that a List keeps reordering when its
 *   numbering changes
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {createReorderable} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';

const meta: Meta = {title: 'Core/List Reorder', tags: ['autodocs']};
export default meta;

type Story = StoryObj;

function NumberingToggleDemo() {
  const [rows, setRows] = useState<ReadonlyArray<string>>([
    'Inbox',
    'Sent',
    'Drafts',
    'Archive',
    'Spam',
    'Trash',
  ]);
  const [isNumbered, setIsNumbered] = useState(false);
  return (
    <VStack gap={2}>
      <Button
        label={isNumbered ? 'Remove the numbers' : 'Number the rows'}
        variant="secondary"
        onClick={() => setIsNumbered(on => !on)}
      />
      <List
        hasDividers
        listStyle={isNumbered ? 'decimal' : 'none'}
        reorderable={createReorderable({
          onReorder: ({key, to}) =>
            setRows(current => {
              const next = current.filter(row => row !== key);
              next.splice(to, 0, String(key));
              return next;
            }),
        })}>
        {rows.map(label => (
          <ListItem key={label} itemKey={label} label={label} />
        ))}
      </List>
    </VStack>
  );
}

export const NumberingToggle: Story = {
  render: () => <NumberingToggleDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'The button turns numbering on and off, so the List renders a ' +
          'numbered or a plain list. Either way, a handle drags its row ' +
          'with a mouse at once, and with a finger after a hold.',
      },
    },
  },
};
