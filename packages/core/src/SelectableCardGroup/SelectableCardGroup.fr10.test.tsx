// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardGroup.fr10.test.tsx
 * @input Uses SelectableCardGroup, SelectableCard and the shared FR10 helpers
 * @output Tests that base props, container* and control* reach their parts
 * @position The group composes Field, so the input-fields family's styling
 *   and prop-routing rules hold for it as for RadioList and CheckboxList.
 */

import {describe, it} from 'vitest';
import {screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {SelectableCard} from '../SelectableCard/SelectableCard';
import {
  SelectableCardGroup,
  type SelectableCardGroupProps,
} from './SelectableCardGroup';

describe('SelectableCardGroup props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<SelectableCardGroupProps>();
  });
});

describeFieldInputParts('SelectableCardGroup', {
  renderMember: props => (
    <SelectableCardGroup
      label="Plan"
      value="basic"
      onChange={() => {}}
      {...props}>
      <SelectableCard value="basic" label="Basic">
        Basic
      </SelectableCard>
    </SelectableCardGroup>
  ),
  getControl: () => screen.getByRole('radiogroup'),
  inGroup: false,
});
