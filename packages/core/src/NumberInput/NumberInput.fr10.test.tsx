// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {NumberInput, type NumberInputProps} from './NumberInput';

describe('NumberInput props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<NumberInputProps>();
  });
});

describeFieldInputParts('NumberInput', {
  renderMember: props => (
    <NumberInput label="Quantity" value={1} onChange={() => {}} {...props} />
  ),
  getControl: () => screen.getByRole('spinbutton'),
  inGroup: true,
});
