// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.openHighlight.test.tsx
 * @input Uses Selector, MultiSelector, Testing Library
 * @output Tests which option a closed Selector or MultiSelector highlights
 *   when it opens: the selected option, else the first (ArrowUp: last)
 *   enabled option, never a disabled one (component:Selector FR8)
 * @position Colocated behavior test for Selector and MultiSelector opening
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {Selector} from './Selector';
import {MultiSelector} from '../MultiSelector';

const OPTIONS = [
  {value: 'Archived', disabled: true},
  'Easy',
  'Hard',
  'Expert',
  {value: 'Retired', disabled: true},
];

const h = {hidden: true} as const;

function activeOptionText(control: HTMLElement): string | null {
  const id = control.getAttribute('aria-activedescendant');
  if (id == null) {
    return null;
  }
  return document.getElementById(id)?.textContent ?? null;
}

function openWith(control: HTMLElement, key: string) {
  control.focus();
  fireEvent.keyDown(control, {key});
}

describe('Selector: the option a closed list highlights when it opens', () => {
  function renderSelector(value: string, onChange = vi.fn()) {
    render(
      <Selector
        label="Level"
        options={OPTIONS}
        value={value}
        onChange={onChange}
      />,
    );
    return screen.getByRole('combobox');
  }

  it('ArrowDown opens on the selected option', () => {
    const trigger = renderSelector('Hard');
    openWith(trigger, 'ArrowDown');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('ArrowUp opens on the selected option', () => {
    const trigger = renderSelector('Hard');
    openWith(trigger, 'ArrowUp');
    expect(activeOptionText(trigger)).toBe('Hard');
  });

  it('ArrowDown then Enter keeps the selected value', () => {
    const onChange = vi.fn();
    const trigger = renderSelector('Hard', onChange);
    openWith(trigger, 'ArrowDown');
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalledWith('Easy');
  });

  it('with nothing selected, ArrowDown opens on the first enabled option, past a disabled first one', () => {
    const trigger = renderSelector('');
    openWith(trigger, 'ArrowDown');
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('with nothing selected, ArrowUp opens on the last enabled option, past a disabled last one', () => {
    const trigger = renderSelector('');
    openWith(trigger, 'ArrowUp');
    expect(activeOptionText(trigger)).toBe('Expert');
  });

  it('with nothing selected, Enter opens on the first enabled option', () => {
    const trigger = renderSelector('');
    openWith(trigger, 'Enter');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(activeOptionText(trigger)).toBe('Easy');
  });

  it('a selected option that is disabled is not highlighted', () => {
    const trigger = renderSelector('Archived');
    openWith(trigger, 'ArrowUp');
    expect(activeOptionText(trigger)).toBe('Expert');
  });

  it('highlights nothing when no option is enabled', () => {
    render(
      <Selector
        label="Level"
        options={[
          {value: 'Archived', disabled: true},
          {value: 'Retired', disabled: true},
        ]}
        value=""
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox');
    openWith(trigger, 'ArrowDown');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getAllByRole('option', h)).toHaveLength(2);
  });
});

describe('MultiSelector: the option a closed list highlights when it opens', () => {
  function renderMulti() {
    render(
      <MultiSelector
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    return screen.getByRole('combobox');
  }

  it('ArrowDown opens on the first enabled option, past a disabled first one', () => {
    const trigger = renderMulti();
    openWith(trigger, 'ArrowDown');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(activeOptionText(trigger)).toContain('Easy');
  });

  it('ArrowUp opens on the last enabled option, past a disabled last one', () => {
    const trigger = renderMulti();
    openWith(trigger, 'ArrowUp');
    expect(activeOptionText(trigger)).toContain('Expert');
  });

  it('Enter opens on the first enabled option', () => {
    const trigger = renderMulti();
    openWith(trigger, 'Enter');
    expect(activeOptionText(trigger)).toContain('Easy');
  });
});
