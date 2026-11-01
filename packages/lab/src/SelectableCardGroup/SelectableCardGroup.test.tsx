// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardGroup.test.tsx
 * @input Uses SelectableCardGroup, SelectableCardGroupItem, Testing Library
 * @output Tests the group's semantics and selection
 * @position A single choice is a radio group of native radios sharing a name;
 * several choices are a named group of checkboxes.
 */

import {useState} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {
  SelectableCardGroup,
  SelectableCardGroupItem,
} from './SelectableCardGroup';

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
        <SelectableCardGroupItem key={plan} value={plan} label={plan}>
          {plan}
        </SelectableCardGroupItem>
      ))}
    </SelectableCardGroup>
  );
}

function Multiple({onChange}: {onChange?: (value: string[]) => void}) {
  const [value, setValue] = useState<string[]>(['Basic']);
  return (
    <SelectableCardGroup
      label="Add-ons"
      selectionMode="multiple"
      value={value}
      onChange={v => {
        setValue(v);
        onChange?.(v);
      }}>
      {PLANS.map(plan => (
        <SelectableCardGroupItem key={plan} value={plan} label={plan}>
          {plan}
        </SelectableCardGroupItem>
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

  it('an item outside a group throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<SelectableCardGroupItem value="x" label="X" />),
    ).toThrow(/inside a SelectableCardGroup/);
    spy.mockRestore();
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

  it('an enabled group submits its choice under htmlName', () => {
    const {container} = render(
      <form>
        <SelectableCardGroup
          label="Plan"
          htmlName="plan"
          value="Pro"
          onChange={() => {}}>
          {PLANS.map(plan => (
            <SelectableCardGroupItem key={plan} value={plan} label={plan}>
              {plan}
            </SelectableCardGroupItem>
          ))}
        </SelectableCardGroup>
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).entries()]).toEqual([['plan', 'on']]);
  });

  it('styles the Field box through container props, not the group', () => {
    render(
      <SelectableCardGroup
        label="Plan"
        value={null}
        onChange={() => {}}
        containerClassName="field-box"
        containerStyle={{marginTop: 7}}>
        <SelectableCardGroupItem value="Basic" label="Basic">
          Basic
        </SelectableCardGroupItem>
      </SelectableCardGroup>,
    );
    const group = screen.getByRole('radiogroup', {name: 'Plan'});
    expect(group).not.toHaveClass('field-box');
    const box = group.closest('.field-box');
    expect(box).not.toBeNull();
    expect((box as HTMLElement).style.marginTop).toBe('7px');
  });
});
