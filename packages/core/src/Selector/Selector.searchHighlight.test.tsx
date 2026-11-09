// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.searchHighlight.test.tsx
 * @input Uses Selector, MultiSelector, Testing Library
 * @output Tests which option a searchable Selector or MultiSelector highlights
 *   as the query changes: the first enabled match of the new list, so
 *   `aria-activedescendant` always names a rendered option and Enter picks
 *   the option the user sees highlighted; a
 *   MultiSelector clears it
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

describe('Selector: the highlight follows the query', () => {
  it('moves the highlight to the first match when typing after arrowing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={onChange}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.type(search, 'b');
    const active = activeOption(search);
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain('Banana');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Banana');
  });

  it('does not keep an index past the new list (ArrowDown to Cherry, then ap)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={onChange}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.keyboard(
      '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}',
    );
    expect(activeOption(search)?.textContent).toContain('Cherry');
    await user.type(search, 'ap');
    expect(activeOption(search)?.textContent).toContain('Apple');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Apple');
  });

  it('highlights nothing when the list reopens after a search (FR8)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Cherry"
        onChange={onChange}
        hasSearch
      />,
    );
    const trigger = screen.getByRole('button', {name: /Fruit/});
    await user.click(trigger);
    await user.type(screen.getByRole('combobox', h), 'b');
    await user.keyboard('{Escape}');
    await user.click(trigger);
    // Closing reset the query; that reset is not a new list to highlight.
    expect(activeOption(screen.getByRole('combobox', h))).toBeNull();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('highlights the first match when typing with nothing highlighted', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={onChange}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'ch');
    expect(activeOption(search)?.textContent).toContain('Cherry');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Cherry');
  });

  it('skips a disabled first match', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'avo');
    // Avocado is the only match and it is disabled: nothing is highlighted,
    // and no stale id is left behind.
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('never names an option that is not rendered when the list shrinks', async () => {
    const user = userEvent.setup();
    render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.keyboard('{ArrowUp}');
    await user.type(search, 'ap');
    expect(activeOption(search)).not.toBeNull();
    expect(activeOption(search)?.textContent).toContain('Apple');
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
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.type(search, 'b');
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    // ArrowDown then starts at the first match.
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)?.textContent).toContain('Banana');
  });
});
