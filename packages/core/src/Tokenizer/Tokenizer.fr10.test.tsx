// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import type {SearchableItem} from '../Typeahead/types';
import {Tokenizer, type TokenizerProps} from './Tokenizer';

describe('Tokenizer props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<TokenizerProps<SearchableItem>>();
  });
});

describeFieldInputParts('Tokenizer', {
  renderMember: props => (
    <Tokenizer
      label="Members"
      searchSource={{search: () => [], bootstrap: () => []}}
      value={[]}
      onChange={() => {}}
      {...props}
    />
  ),
  getControl: () => screen.getByRole('combobox'),
  inGroup: false,
});
