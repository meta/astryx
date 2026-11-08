// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {TextInput, type TextInputProps} from './TextInput';

describe('TextInput props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<TextInputProps>();
  });
});

describeFieldInputParts('TextInput', {
  renderMember: props => (
    <TextInput label="Name" value="" onChange={() => {}} {...props} />
  ),
  getControl: () => screen.getByRole('textbox'),
  inGroup: true,
});
