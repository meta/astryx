// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardRadio.test.tsx
 * @input Uses SelectableCard and Testing Library
 * @output Tests for SelectableCard's radio input
 * @position A card with inputType="radio" is one choice of a set: a native
 * radio in the set's named group that selects and never deselects itself.
 */

import {useState} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {SelectableCard} from './SelectableCard';

function Plans({onChange}: {onChange?: (value: string) => void}) {
  const [value, setValue] = useState('basic');
  return (
    <div role="radiogroup" aria-label="Plan">
      {['basic', 'pro', 'team'].map(plan => (
        <SelectableCard
          key={plan}
          label={plan}
          inputType="radio"
          htmlName="plan"
          isSelected={value === plan}
          onChange={() => {
            setValue(plan);
            onChange?.(plan);
          }}>
          {plan}
        </SelectableCard>
      ))}
    </div>
  );
}

describe('SelectableCard inputType="radio"', () => {
  it('renders a native radio in the named group', () => {
    render(<Plans />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio).toHaveAttribute('name', 'plan');
    }
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
      <SelectableCard
        label="Basic"
        inputType="radio"
        htmlName="plan"
        isSelected
        onChange={onChange}>
        Basic
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Basic'));
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on Enter when unselected', () => {
    const onChange = vi.fn();
    render(
      <SelectableCard
        label="Pro"
        inputType="radio"
        htmlName="plan"
        isSelected={false}
        onChange={onChange}>
        Pro
      </SelectableCard>,
    );
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a disabled radio card stays focusable and does not select', () => {
    const onChange = vi.fn();
    render(
      <SelectableCard
        label="Team"
        inputType="radio"
        htmlName="plan"
        isSelected={false}
        isDisabled
        onChange={onChange}>
        Team
      </SelectableCard>,
    );
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('aria-disabled', 'true');
    expect(radio).not.toBeDisabled();
    fireEvent.click(screen.getByText('Team'));
    fireEvent.keyDown(radio, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the checkbox by default', () => {
    render(
      <SelectableCard label="A" isSelected={false} onChange={() => {}}>
        A
      </SelectableCard>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('type', 'checkbox');
  });
});
