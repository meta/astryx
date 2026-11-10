// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.highlightFollowsValue.test.tsx
 * @input Uses Selector, Testing Library
 * @output Tests that an open Selector's highlight follows its option by value
 *   when the options move or reload: it stays on its option, moves to the
 *   next remaining enabled option after it (the previous one when it was
 *   last) when its option leaves, and clears when none remains
 * @position Colocated behavior test for Selector's highlight
 */

import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {Selector} from './Selector';
import type {SelectorOptionType} from './types';

function activeOptionText(control: HTMLElement): string | null {
  const id = control.getAttribute('aria-activedescendant');
  if (id == null || id === '') {
    return null;
  }
  return document.getElementById(id)?.textContent ?? null;
}

function SelectorWith({options}: {options: SelectorOptionType[]}) {
  return (
    <Selector label="Level" options={options} value="" onChange={() => {}} />
  );
}

/** Opens the list and moves the highlight down `steps` times. */
function openAndHighlight(steps: number): HTMLElement {
  const trigger = screen.getByRole('combobox');
  trigger.focus();
  fireEvent.keyDown(trigger, {key: 'ArrowDown'});
  for (let step = 0; step < steps; step++) {
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
  }
  return trigger;
}

describe('Selector: the highlight follows its option by value', () => {
  it('stays on its option when the options move', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert']} />,
    );
    const trigger = openAndHighlight(1);
    expect(activeOptionText(trigger)).toBe('Hard');

    rerender(<SelectorWith options={['Expert', 'Easy', 'Hard']} />);
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('stays on its option when the options reload as new objects', () => {
    const {rerender} = render(
      <SelectorWith
        options={[{value: 'Easy'}, {value: 'Hard'}, {value: 'Expert'}]}
      />,
    );
    const trigger = openAndHighlight(1);
    rerender(
      <SelectorWith
        options={[{value: 'Novice'}, {value: 'Hard'}, {value: 'Expert'}]}
      />,
    );
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('moves to the next remaining option after its option when that option leaves', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert', 'Master']} />,
    );
    const trigger = openAndHighlight(1);
    expect(activeOptionText(trigger)).toBe('Hard');

    rerender(<SelectorWith options={['Master', 'Easy', 'Expert']} />);
    expect(activeOptionText(trigger)).toBe('Expert');
  });

  it('moves to the previous remaining option when the option that left was last', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert']} />,
    );
    const trigger = openAndHighlight(2);
    expect(activeOptionText(trigger)).toBe('Expert');

    rerender(<SelectorWith options={['Easy', 'Hard']} />);
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('skips a disabled option when it moves the highlight', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert', 'Master']} />,
    );
    const trigger = openAndHighlight(1);

    rerender(
      <SelectorWith
        options={['Easy', {value: 'Expert', disabled: true}, 'Master']}
      />,
    );
    expect(activeOptionText(trigger)).toBe('Master');
  });

  it('highlights nothing when none of its options remains', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert']} />,
    );
    const trigger = openAndHighlight(1);

    rerender(<SelectorWith options={['Novice', 'Master']} />);
    expect(activeOptionText(trigger)).toBeNull();
  });

  it('moves to the previous remaining option when every option after it left', () => {
    const {rerender} = render(
      <SelectorWith options={['Easy', 'Hard', 'Expert']} />,
    );
    const trigger = openAndHighlight(1);
    expect(activeOptionText(trigger)).toBe('Hard');

    rerender(<SelectorWith options={['Easy']} />);
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('does not throw when the highlight already sits past the end of the list', () => {
    const FIVE = ['Apple', 'Banana', 'Cherry', 'Date', 'Elder'];
    const {rerender} = render(<SelectorWith options={FIVE} />);
    const trigger = openAndHighlight(1);
    expect(activeOptionText(trigger)).toBe('Banana');
    // A row under a still pointer is reported as entered while the keyboard
    // move holds the highlight; the hover applies on the next pointer move.
    const elder = screen
      .getAllByRole('option', {hidden: true})
      .find(row => row.textContent === 'Elder');
    expect(elder).toBeDefined();
    fireEvent.mouseEnter(elder as HTMLElement);

    rerender(<SelectorWith options={FIVE.slice(0, 3)} />);
    fireEvent.pointerMove(document);
    expect(() =>
      rerender(<SelectorWith options={FIVE.slice(0, 2)} />),
    ).not.toThrow();
  });
});
