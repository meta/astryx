// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInput.fr10.test.tsx
 * @input Uses ListInput and the shared FR10 helpers
 * @output Tests that base props, container* and control* reach their parts
 * @position ListInput composes Field, so the input-fields family's styling
 *   and prop-routing rules hold for it as for RadioList and CheckboxList.
 */

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {ListInput, type ListInputProps} from './ListInput';

type Guest = {id: string; name: string};

const guests: Guest[] = [{id: 'ada', name: 'Ada'}];

describe('ListInput props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<ListInputProps<Guest>>();
  });
});

describeFieldInputParts('ListInput', {
  renderMember: props => (
    <ListInput<Guest>
      label="Guests"
      itemName="guest"
      value={guests}
      onChange={() => {}}
      getItemKey={guest => guest.id}
      createItem={() => ({id: 'new', name: ''})}
      columns={[
        {
          key: 'name',
          header: 'Name',
          renderInput: ({item, label}) => (
            <input aria-label={label} value={item.name} readOnly />
          ),
        },
      ]}
      {...props}
    />
  ),
  getControl: () => screen.getByRole('group', {name: 'Guests'}),
  inGroup: false,
});
