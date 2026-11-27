// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardGroup.test.tsx
 * @input Uses SelectableCardGroup, core SelectableCard, Testing Library
 * @output Tests the group's semantics and selection
 * @position A single choice is a radio group of native radios sharing a name;
 * several choices are a named group of checkboxes.
 */

import {useState} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {SelectableCardGroup} from './SelectableCardGroup';

const PLANS = ['Basic', 'Pro', 'Team'];

function Single({
  initial = null,
  onChange,
  isDisabled,
}: {
  initial?: string | null;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SelectableCardGroup
      label="Plan"
      description="Billed monthly"
      value={value}
      isDisabled={isDisabled}
      onChange={v => {
        setValue(v);
        onChange?.(v);
      }}>
      {PLANS.map(plan => (
        <SelectableCard key={plan} value={plan} label={plan}>
          {plan}
        </SelectableCard>
      ))}
    </SelectableCardGroup>
  );
}

function Multiple({onChange}: {onChange?: (value: string[]) => void}) {
  const [value, setValue] = useState<string[]>(['Basic']);
  return (
    <SelectableCardGroup
      label="Add-ons"
      type="multiple"
      value={value}
      onChange={v => {
        setValue(v);
        onChange?.(v);
      }}>
      {PLANS.map(plan => (
        <SelectableCard key={plan} value={plan} label={plan}>
          {plan}
        </SelectableCard>
      ))}
    </SelectableCardGroup>
  );
}

describe('SelectableCardGroup', () => {
  it('a single choice is a named radiogroup of radios sharing one name', () => {
    render(<Single initial="Pro" />);
    const group = screen.getByRole('radiogroup', {name: 'Plan'});
    expect(group).toHaveAccessibleDescription('Billed monthly');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    const names = new Set(radios.map(r => r.getAttribute('name')));
    expect(names.size).toBe(1);
    expect([...names][0]).toBeTruthy();
    expect(screen.getByRole('radio', {name: 'Pro'})).toBeChecked();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reflects its type to themes as data-type', () => {
    const {unmount} = render(<Single />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'data-type',
      'single',
    );
    unmount();
    render(<Multiple />);
    expect(screen.getByRole('group', {name: 'Add-ons'})).toHaveAttribute(
      'data-type',
      'multiple',
    );
  });

  it('choosing a card moves the selection and reports its value', () => {
    const onChange = vi.fn();
    render(<Single initial="Basic" onChange={onChange} />);
    fireEvent.click(screen.getByText('Team'));
    expect(onChange).toHaveBeenCalledWith('Team');
    expect(screen.getByRole('radio', {name: 'Team'})).toBeChecked();
    expect(screen.getByRole('radio', {name: 'Basic'})).not.toBeChecked();
  });

  it('choosing the chosen card again changes nothing', () => {
    const onChange = vi.fn();
    render(<Single initial="Basic" onChange={onChange} />);
    fireEvent.click(screen.getByText('Basic'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', {name: 'Basic'})).toBeChecked();
  });

  it('a disabled group selects nothing and keeps its cards focusable', () => {
    const onChange = vi.fn();
    render(<Single isDisabled onChange={onChange} />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByText('Pro'));
    expect(onChange).not.toHaveBeenCalled();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-disabled', 'true');
      expect(radio).not.toBeDisabled();
    }
  });

  it('several choices are a named group of checkboxes that toggle', () => {
    const onChange = vi.fn();
    render(<Multiple onChange={onChange} />);
    expect(screen.getByRole('group', {name: 'Add-ons'})).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByText('Team'));
    expect(onChange).toHaveBeenLastCalledWith(['Basic', 'Team']);
    fireEvent.click(screen.getByText('Basic'));
    expect(onChange).toHaveBeenLastCalledWith(['Team']);
    expect(screen.getByRole('checkbox', {name: 'Team'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: 'Basic'})).not.toBeChecked();
  });

  it("a card's own isDisabled holds in an enabled group", () => {
    const onChange = vi.fn();
    render(
      <SelectableCardGroup label="Plan" value="Basic" onChange={onChange}>
        {PLANS.map(plan => (
          <SelectableCard
            key={plan}
            value={plan}
            label={plan}
            isDisabled={plan === 'Team'}>
            {plan}
          </SelectableCard>
        ))}
      </SelectableCardGroup>,
    );
    expect(screen.getByRole('radio', {name: 'Team'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('radio', {name: 'Pro'})).not.toHaveAttribute(
      'aria-disabled',
    );
    fireEvent.click(screen.getByText('Team'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a disabled group submits nothing with its form, and keeps its grouping', () => {
    const {container} = render(
      <form>
        <Single initial="Pro" isDisabled />
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).keys()]).toEqual([]);
    const names = new Set(
      screen.getAllByRole('radio').map(r => r.getAttribute('name')),
    );
    expect(names.size).toBe(1);
  });

  it("an enabled group submits the chosen card's value under htmlName", () => {
    const {container} = render(
      <form>
        <SelectableCardGroup
          label="Plan"
          htmlName="plan"
          value="Pro"
          onChange={() => {}}>
          {PLANS.map(plan => (
            <SelectableCard key={plan} value={plan} label={plan}>
              {plan}
            </SelectableCard>
          ))}
        </SelectableCardGroup>
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).entries()]).toEqual([['plan', 'Pro']]);
  });

  it('a chosen card disabled on its own submits nothing, and the group keeps one form owner', () => {
    const {container} = render(
      <form>
        <SelectableCardGroup
          label="Plan"
          htmlName="plan"
          value="Team"
          onChange={() => {}}>
          {PLANS.map(plan => (
            <SelectableCard
              key={plan}
              value={plan}
              label={plan}
              isDisabled={plan === 'Team'}>
              {plan}
            </SelectableCard>
          ))}
        </SelectableCardGroup>
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).entries()]).toEqual([]);
    const owners = new Set(
      screen.getAllByRole('radio').map(r => r.getAttribute('form')),
    );
    expect([...owners]).toEqual(['']);
  });

  it("keeps the caller's aria-labelledby and aria-describedby beside its own", () => {
    render(
      <>
        <span id="extra-label">Billing</span>
        <span id="extra-help">Change any time</span>
        <SelectableCardGroup
          label="Plan"
          description="Billed monthly"
          aria-labelledby="extra-label"
          aria-describedby="extra-help"
          value={null}
          onChange={() => {}}>
          <SelectableCard value="Basic" label="Basic">
            Basic
          </SelectableCard>
        </SelectableCardGroup>
      </>,
    );
    const group = screen.getByRole('radiogroup', {name: 'Plan Billing'});
    expect(group).toHaveAccessibleDescription('Billed monthly Change any time');
  });

  it('ignores untyped root styling and warns in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const untyped = {className: 'root-class'} as Record<string, unknown>;
    render(
      <SelectableCardGroup
        label="Plan"
        value={null}
        onChange={() => {}}
        {...untyped}>
        <SelectableCard value="Basic" label="Basic">
          Basic
        </SelectableCard>
      </SelectableCardGroup>,
    );
    expect(document.querySelector('.root-class')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('styles the Field box through container props, not the group', () => {
    render(
      <SelectableCardGroup
        label="Plan"
        value={null}
        onChange={() => {}}
        containerClassName="field-box"
        containerStyle={{marginTop: 7}}>
        <SelectableCard value="Basic" label="Basic">
          Basic
        </SelectableCard>
      </SelectableCardGroup>,
    );
    const group = screen.getByRole('radiogroup', {name: 'Plan'});
    expect(group).not.toHaveClass('field-box');
    const box = group.closest('.field-box');
    expect(box).not.toBeNull();
    expect((box as HTMLElement).style.marginTop).toBe('7px');
  });
});
