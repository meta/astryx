// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {RadioList, type RadioListProps} from './RadioList';
import {RadioListItem} from './RadioListItem';

describe('RadioList props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<RadioListProps>();
  });
});

describeFieldInputParts('RadioList', {
  renderMember: props => (
    <RadioList label="Plan" value="a" onChange={() => {}} {...props}>
      <RadioListItem label="A" value="a" />
    </RadioList>
  ),
  getControl: () => screen.getByRole('radiogroup'),
  inGroup: false,
});

describe('RadioList FR10 details', () => {
  it("names the radiogroup by its label and then a caller's aria-labelledby", () => {
    render(
      <>
        <span id="caller-name">Billing</span>
        <RadioList
          label="Plan"
          value="a"
          onChange={() => {}}
          aria-labelledby="caller-name">
          <RadioListItem label="A" value="a" />
        </RadioList>
      </>,
    );
    const group = screen.getByRole('radiogroup');
    const ids = group.getAttribute('aria-labelledby')?.split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids?.[0] ?? '')?.textContent).toContain(
      'Plan',
    );
    expect(ids?.[1]).toBe('caller-name');
    expect(screen.getByRole('radiogroup', {name: 'Plan Billing'})).toBe(group);
  });

  it('puts hidden, inert, and dir on the radiogroup', () => {
    render(
      <RadioList
        label="Plan"
        value="a"
        onChange={() => {}}
        hidden
        inert
        dir="rtl">
        <RadioListItem label="A" value="a" />
      </RadioList>,
    );
    const group = document.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(group).toHaveAttribute('hidden');
    expect(group).toHaveAttribute('inert');
    expect(group).toHaveAttribute('dir', 'rtl');
  });
});
