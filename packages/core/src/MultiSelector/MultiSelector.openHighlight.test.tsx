// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.openHighlight.test.tsx
 * @input Uses MultiSelector, Testing Library
 * @output Tests which option a closed MultiSelector highlights when it opens:
 *   the first enabled option (ArrowUp: the last), never a disabled one, and
 *   nothing when no option is enabled
 * @position Colocated behavior test for MultiSelector opening
 */

import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {MultiSelector} from './MultiSelector';

const OPTIONS = [
  {value: 'Archived', disabled: true},
  'Easy',
  'Hard',
  {value: 'Retired', disabled: true},
];

function activeOptionText(control: HTMLElement): string | null {
  const id = control.getAttribute('aria-activedescendant');
  if (id == null || id === '') {
    return null;
  }
  return document.getElementById(id)?.textContent ?? null;
}

function renderMultiSelector(
  options: ReadonlyArray<string | {value: string; disabled?: boolean}>,
  value: string[] = [],
) {
  render(
    <MultiSelector
      label="Levels"
      options={[...options]}
      value={value}
      onChange={() => {}}
    />,
  );
  return screen.getByRole('combobox');
}

describe('MultiSelector: the option a closed list highlights when it opens', () => {
  it('ArrowDown opens on the first enabled option, past a disabled first option', () => {
    const trigger = renderMultiSelector(OPTIONS);
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('ArrowUp opens on the last enabled option, past a disabled last option', () => {
    const trigger = renderMultiSelector(OPTIONS);
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowUp'});
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('Enter opens on the first enabled option', () => {
    const trigger = renderMultiSelector(OPTIONS);
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('a press opens on the first enabled option', () => {
    const trigger = renderMultiSelector(OPTIONS);
    fireEvent.click(trigger);
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('highlights nothing when no option is enabled', () => {
    const trigger = renderMultiSelector([
      {value: 'Archived', disabled: true},
      {value: 'Retired', disabled: true},
    ]);
    trigger.focus();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    expect(activeOptionText(trigger)).toBeNull();
  });

  describe('with a value selected, in the order the list opens in', () => {
    // The open list puts the selected options first.
    const LIST = [{value: 'Archived', disabled: true}, 'Easy', 'Hard'];

    it('ArrowDown opens on the selected option at the top', () => {
      const trigger = renderMultiSelector(LIST, ['Hard']);
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'ArrowDown'});
      expect(activeOptionText(trigger)).toBe('Hard');
    });

    it('Enter opens on the selected option at the top', () => {
      const trigger = renderMultiSelector(LIST, ['Hard']);
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'Enter'});
      expect(activeOptionText(trigger)).toBe('Hard');
    });

    it('a press opens on the selected option at the top', () => {
      const trigger = renderMultiSelector(LIST, ['Hard']);
      fireEvent.click(trigger);
      expect(activeOptionText(trigger)).toBe('Hard');
    });

    it('ArrowUp opens on the last enabled option when a disabled option is selected', () => {
      const trigger = renderMultiSelector(
        ['Easy', 'Hard', {value: 'Retired', disabled: true}],
        ['Retired'],
      );
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'ArrowUp'});
      expect(activeOptionText(trigger)).toBe('Hard');
    });

    it('typing opens on the typed match, never on a disabled option', () => {
      const trigger = renderMultiSelector(LIST, ['Hard']);
      trigger.focus();
      fireEvent.keyDown(trigger, {key: 'e'});
      expect(activeOptionText(trigger)).toBe('Easy');
    });
  });
});
