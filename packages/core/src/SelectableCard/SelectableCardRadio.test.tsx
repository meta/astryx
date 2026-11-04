// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardRadio.test.tsx
 * @input Uses SelectableCard, its internal input context, and Testing Library
 * @output Tests for SelectableCard's radio input
 * @position A card a group renders as a radio (through the internal
 *   SelectableCardInputContext) is one choice of a set: a native radio in the
 *   set's named group that selects and never deselects itself.
 */

import {useMemo, useState} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {SelectableCard, type SelectableCardProps} from './SelectableCard';
import {SelectableCardInputContext} from './selectableCardInput';

/** A card the way a single-choice group renders it. */
function RadioCard({value, ...props}: SelectableCardProps & {value: string}) {
  const input = useMemo(
    () => ({
      type: 'radio' as const,
      name: 'plan',
      value,
    }),
    [value],
  );
  return (
    <SelectableCardInputContext value={input}>
      <SelectableCard {...props} />
    </SelectableCardInputContext>
  );
}

function Plans({onChange}: {onChange?: (value: string) => void}) {
  const [value, setValue] = useState('basic');
  return (
    <div role="radiogroup" aria-label="Plan">
      {['basic', 'pro', 'team'].map(plan => (
        <RadioCard
          key={plan}
          value={plan}
          label={plan}
          isSelected={value === plan}
          onChange={() => {
            setValue(plan);
            onChange?.(plan);
          }}>
          {plan}
        </RadioCard>
      ))}
    </div>
  );
}

describe('SelectableCard as a group radio', () => {
  it('renders a native radio in the named group', () => {
    render(<Plans />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio).toHaveAttribute('name', 'plan');
    }
    // A form submits the chosen card's value, not "on".
    expect(screen.getByRole('radio', {name: 'pro'})).toHaveAttribute(
      'value',
      'pro',
    );
    expect(screen.getByRole('radio', {name: 'basic'})).toBeChecked();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('selects the clicked card and unchecks the others', () => {
    const onChange = vi.fn();
    render(<Plans onChange={onChange} />);
    fireEvent.click(screen.getByText('pro'));
    expect(onChange).toHaveBeenCalledWith('pro');
    expect(screen.getByRole('radio', {name: 'pro'})).toBeChecked();
    expect(screen.getByRole('radio', {name: 'basic'})).not.toBeChecked();
  });

  it('never deselects itself: a click or Enter on the selected card does nothing', () => {
    const onChange = vi.fn();
    render(
      <RadioCard value="basic" label="Basic" isSelected onChange={onChange}>
        Basic
      </RadioCard>,
    );
    fireEvent.click(screen.getByText('Basic'));
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on Enter when unselected', () => {
    const onChange = vi.fn();
    render(
      <RadioCard value="pro" label="Pro" isSelected={false} onChange={onChange}>
        Pro
      </RadioCard>,
    );
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a disabled radio card stays focusable and does not select', () => {
    const onChange = vi.fn();
    render(
      <RadioCard
        value="team"
        label="Team"
        isSelected={false}
        isDisabled
        onChange={onChange}>
        Team
      </RadioCard>,
    );
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('aria-disabled', 'true');
    expect(radio).not.toBeDisabled();
    // Every radio card leaves the form, so the group stays one tab stop.
    expect(radio).toHaveAttribute('form', '');
    fireEvent.click(screen.getByText('Team'));
    fireEvent.keyDown(radio, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the checkbox without a group', () => {
    render(
      <SelectableCard label="A" isSelected={false} onChange={() => {}}>
        A
      </SelectableCard>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('type', 'checkbox');
  });
});
