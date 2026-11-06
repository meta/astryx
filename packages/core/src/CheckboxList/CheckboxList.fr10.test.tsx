// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {CheckboxList, type CheckboxListProps} from './CheckboxList';
import {CheckboxListItem} from './CheckboxListItem';

describe('CheckboxList props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<CheckboxListProps>();
  });
});

describeFieldInputParts('CheckboxList', {
  renderMember: props => (
    <CheckboxList label="Preferences" value={[]} onChange={() => {}} {...props}>
      <CheckboxListItem label="A" value="a" />
    </CheckboxList>
  ),
  getControl: () => screen.getByRole('group'),
  inGroup: false,
});

describe('CheckboxList FR10 details', () => {
  it("names the group by its label and then a caller's aria-labelledby", () => {
    render(
      <>
        <span id="caller-name">Billing</span>
        <CheckboxList
          label="Preferences"
          value={[]}
          onChange={() => {}}
          aria-labelledby="caller-name">
          <CheckboxListItem label="A" value="a" />
        </CheckboxList>
      </>,
    );
    const group = screen.getByRole('group');
    const ids = group.getAttribute('aria-labelledby')?.split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids?.[0] ?? '')?.textContent).toContain(
      'Preferences',
    );
    expect(ids?.[1]).toBe('caller-name');
    expect(screen.getByRole('group', {name: 'Preferences Billing'})).toBe(
      group,
    );
  });
});
