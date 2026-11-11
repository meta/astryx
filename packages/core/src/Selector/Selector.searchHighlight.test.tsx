// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.searchHighlight.test.tsx
 * @input Uses Selector, MultiSelector, Testing Library
 * @output Tests that a searchable Selector or MultiSelector clears its
 *   highlight as the query changes, so `aria-activedescendant` never names an
 *   option of the previous list and Enter never picks one the user did not
 *   highlight
 * @position Colocated behavior test for search in Selector and MultiSelector
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Selector} from './Selector';
import {MultiSelector} from '../MultiSelector';

const OPTIONS = [
  'Apple',
  'Apricot',
  {value: 'Avocado', disabled: true},
  'Banana',
  'Blueberry',
  'Cherry',
];

const h = {hidden: true} as const;

/** The rendered option `aria-activedescendant` names, or null. */
function activeOption(search: HTMLElement): HTMLElement | null {
  const id = search.getAttribute('aria-activedescendant');
  return id == null ? null : document.getElementById(id);
}

describe('Selector: a query change clears the highlight', () => {
  function renderSearch(props: {value?: string} = {}) {
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value={props.value}
        onChange={onChange}
        hasSearch
      />,
    );
    return onChange;
  }

  it('clears a highlight left from before the query, so Enter picks nothing unseen', async () => {
    const user = userEvent.setup();
    const onChange = renderSearch();
    await user.click(screen.getByRole('button', {name: /^Fruit\b/}));
    const search = screen.getByRole('combobox', h);
    // Apricot is index 1, inside the two-row list `b` leaves (Banana,
    // Blueberry), so a kept index would name Blueberry.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.type(search, 'b');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)?.textContent).toContain('Banana');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Banana');
  });

  it('does not keep an index past the new list (ArrowDown to Cherry, then ap)', async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole('button', {name: /^Fruit\b/}));
    const search = screen.getByRole('combobox', h);
    await user.keyboard(
      '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}',
    );
    expect(activeOption(search)?.textContent).toContain('Cherry');
    await user.type(search, 'ap');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)?.textContent).toContain('Apple');
  });

  it('highlights nothing when the list reopens after a search', async () => {
    const user = userEvent.setup();
    const onChange = renderSearch({value: 'Cherry'});
    const trigger = screen.getByRole('button', {name: /Fruit/});
    await user.click(trigger);
    await user.type(screen.getByRole('combobox', h), 'b');
    await user.keyboard('{Escape}');
    await user.click(trigger);
    expect(activeOption(screen.getByRole('combobox', h))).toBeNull();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('highlights nothing on ArrowDown when no match is enabled', async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole('button', {name: /^Fruit\b/}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'a');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    await user.type(search, 'vo');
    // Avocado is the only match and it is disabled: nothing is highlighted,
    // and no stale id is left behind.
    await user.keyboard('{ArrowDown}');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('MultiSelector: a query change clears the highlight', () => {
  it('clears a highlight left from before the query, so Enter picks nothing unseen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: /^Fruit\b/}));
    const search = screen.getByRole('combobox', h);
    // Apricot is index 1, inside the two-row list `b` leaves (Banana,
    // Blueberry), so a kept index would name Blueberry.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.type(search, 'b');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    // ArrowDown then starts at the first match.
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)?.textContent).toContain('Banana');
  });
});
