// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInputA11y.stories.tsx
 * @input ListInput with reordering, where the owner keeps the first record in
 *   its place
 * @output A fixture for the Chromium check that a record that stays put keeps
 *   its Remove in the column of every other record's Remove. It is excluded
 *   from the visual matrix
 * @position Browser fixture for ListInput's record columns
 */

import {useMemo, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {createReorderable} from '@astryxdesign/core';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';

const meta: Meta = {
  title: 'A11y/ListInput',
  tags: ['no-visual'],
};

export default meta;

interface Guest {
  id: string;
  name: string;
}

const COLUMNS: ListInputColumn<Guest>[] = [
  {
    key: 'name',
    header: 'Name',
    renderInput: ({item, label, isLabelHidden, isDisabled, updateItem}) => (
      <TextInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.name}
        onChange={name => updateItem({...item, name}, 'name')}
        isDisabled={isDisabled}
      />
    ),
  },
];

export const FixedRecord: StoryObj = {
  render: function FixedRecordStory() {
    const [guests, setGuests] = useState<Guest[]>([
      {id: 'host', name: 'Host'},
      {id: 'ada', name: 'Ada'},
      {id: 'grace', name: 'Grace'},
    ]);
    const reorderable = useMemo(
      () =>
        createReorderable({
          // The host stays first.
          isReorderable: (key: string | number) => key !== 'host',
          onReorder: ({key, to}: {key: string | number; to: number}) =>
            setGuests(current => {
              const moved = current.find(guest => guest.id === key);
              if (moved == null) {
                return current;
              }
              const rest = current.filter(guest => guest !== moved);
              return [...rest.slice(0, to), moved, ...rest.slice(to)];
            }),
        }),
      [],
    );
    return (
      <ListInput<Guest>
        label="Guests"
        value={guests}
        onChange={setGuests}
        getItemKey={guest => guest.id}
        createItem={() => ({id: crypto.randomUUID(), name: ''})}
        columns={COLUMNS}
        itemName="guest"
        reorderable={reorderable}
      />
    );
  },
};
