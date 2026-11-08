// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import type {SearchableItem} from './types';
import {Typeahead, type TypeaheadProps} from './Typeahead';

describe('Typeahead props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<TypeaheadProps<SearchableItem>>();
  });
});

describeFieldInputParts('Typeahead', {
  renderMember: props => (
    <Typeahead
      label="Fruit"
      searchSource={{search: () => [], bootstrap: () => []}}
      value={null}
      onChange={() => {}}
      {...props}
    />
  ),
  getControl: () => screen.getByRole('combobox'),
  inGroup: true,
});
