// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCombobox.public.test.tsx
 * @input useCombobox and SelectorOptionData from the public Selector barrel
 * @output Compile-time compatibility coverage: a caller that names the result
 *   `ReturnType<typeof useCombobox>` over an option type of its own, and a
 *   key handler typed for an input, passed to getFieldProps and spread back
 *   onto it
 * @position Public API test guarding @astryxdesign/core/Selector; the core
 *   typecheck compiles it, so a type regression fails there
 */

import {render, screen} from '@testing-library/react';
import type {KeyboardEvent} from 'react';
import {describe, expect, it} from 'vitest';
import {useCombobox} from './index';
import type {SelectorOptionData} from './index';

/** An option type of the caller's own, richer than SelectorOptionData. */
type Person = {value: string; label: string; email: string};

const PEOPLE: Person[] = [
  {value: 'ada', label: 'Ada', email: 'ada@example.com'},
  {value: 'cy', label: 'Cy', email: 'cy@example.com'},
];

/**
 * The released shape: the result named after the hook, the only name a
 * caller has for it, over the caller's own option type.
 */
function useNamedResult(): ReturnType<typeof useCombobox> {
  return useCombobox({
    selectableItems: PEOPLE,
    isOpen: true,
    onOpen: () => {},
    onClose: () => {},
    listboxId: 'people',
  });
}

function NamedResult() {
  const combobox = useNamedResult();
  // The released handlers still take a Selector option, or the caller's own.
  const onSelect: (item: SelectorOptionData) => void = combobox.onItemSelect;
  const onHover: (item: SelectorOptionData, index: number) => void =
    combobox.onItemMouseEnter;
  return (
    <button
      type="button"
      onClick={() => {
        combobox.onItemSelect(PEOPLE[0]);
        combobox.onItemMouseEnter(PEOPLE[1], 1);
        onSelect({value: 'cy'});
        onHover({value: 'cy'}, 1);
      }}>
      Pick
    </button>
  );
}

function FieldTypedHandlers() {
  const closed = {
    selectableItems: PEOPLE,
    isOpen: false,
    onOpen: () => {},
    onClose: () => {},
  };
  const to = useCombobox({...closed, listboxId: 'to'});
  // The handler reads a member only its own element has.
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };
  return (
    <input aria-label="To" {...to.getFieldProps({onKeyDown: onInputKeyDown})} />
  );
}

describe('useCombobox public types', () => {
  it('keeps a result named ReturnType<typeof useCombobox> over a richer option type', () => {
    render(<NamedResult />);
    expect(screen.getByRole('button', {name: 'Pick'})).toBeTruthy();
  });

  it('takes a key handler typed for an input', () => {
    render(<FieldTypedHandlers />);
    expect(screen.getByRole('combobox', {name: 'To'})).toBeTruthy();
  });
});
