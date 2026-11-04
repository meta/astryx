// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {TextArea, type TextAreaProps} from './TextArea';

describe('TextArea props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<TextAreaProps>();
  });
});

describeFieldInputParts('TextArea', {
  renderMember: props => (
    <TextArea label="Notes" value="" onChange={() => {}} {...props} />
  ),
  getControl: () => screen.getByRole('textbox'),
  inGroup: false,
});
