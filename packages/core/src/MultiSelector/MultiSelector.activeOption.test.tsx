// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MultiSelector} from './MultiSelector';
import {contrastRatio} from '../theme/contrast';
import {resolveThemeToken} from '../theme/tokens';

const OPTIONS = [
  {value: 'Apple', label: 'Apple'},
  {value: 'Banana', label: 'Banana'},
  {value: 'Cherry', label: 'Cherry'},
];

function renderField() {
  render(
    <MultiSelector
      label="Fruit"
      options={OPTIONS}
      value={[]}
      onChange={() => {}}
    />,
  );
  return screen.getByRole('combobox', {name: 'Fruit'});
}

function activeOption(field: HTMLElement): HTMLElement {
  const id = field.getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  const row = document.getElementById(id ?? '');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function option(name: string): HTMLElement {
  const row = screen
    .getAllByRole('option', {hidden: true})
    .find(candidate => candidate.textContent?.includes(name));
  expect(row).toBeDefined();
  return row as HTMLElement;
}

function hasRing(row: HTMLElement): boolean {
  return getComputedStyle(row)
    .getPropertyValue('outline-color')
    .includes('--focus-outline-color');
}

/** The token a `var(--name)` value reads, or null for any other value. */
function tokenOf(value: string): string | null {
  return /var\((--[\w-]+)\)/.exec(value)?.[1] ?? null;
}

describe('MultiSelector active option indicator', () => {
  it('draws the focus ring inside the active option after keyboard input', async () => {
    const user = userEvent.setup();
    const field = renderField();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');

    const row = activeOption(field);
    expect(row).toHaveTextContent('Banana');
    expect(hasRing(row)).toBe(true);
    expect(getComputedStyle(row).getPropertyValue('outline-offset')).toContain(
      '--focus-outline-width',
    );
  });

  it('keeps the fill alone after pointer input, and draws the ring again on the next key', async () => {
    const user = userEvent.setup();
    const field = renderField();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(hasRing(activeOption(field))).toBe(true);

    await user.hover(option('Cherry'));
    const hovered = activeOption(field);
    expect(hovered).toHaveTextContent('Cherry');
    expect(hasRing(hovered)).toBe(false);
    expect(hasRing(option('Banana'))).toBe(false);

    await user.keyboard('{ArrowUp}');
    const back = activeOption(field);
    expect(back).toHaveTextContent('Banana');
    expect(hasRing(back)).toBe(true);
  });

  it('keeps the ring when a key brings the active option under a still mouse', async () => {
    const user = userEvent.setup();
    const field = renderField();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    const row = activeOption(field);
    // The browser reports the row under a still pointer as entered when a
    // key scrolls the list. No pointer move happens.
    fireEvent.mouseEnter(row);
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(true);
  });

  it('draws no ring on the opening highlight when a pointer press opens the list after keyboard input', async () => {
    const user = userEvent.setup();
    const field = renderField();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    await user.click(field);
    const row = activeOption(field);
    expect(hasRing(row)).toBe(false);
  });

  it('rings the action cell, not its row, when a key makes a grid row’s action cell active', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {
            value: 'bug',
            label: 'Bug',
            action: <button type="button">Edit Bug</button>,
          },
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Labels'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    const row = screen.getByRole('row', {name: 'Bug', hidden: true});
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(true);

    await user.keyboard('{ArrowRight}');
    expect(activeOption(field)).toBe(row.children[1]);
    expect(hasRing(row)).toBe(false);

    await user.keyboard('{ArrowLeft}');
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(true);
  });

  it('keeps the ring when a key scrolls the active grid row’s action cell under a still pointer', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {
            value: 'bug',
            label: 'Bug',
            action: <button type="button">Edit Bug</button>,
          },
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Labels'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    const row = screen.getByRole('row', {name: 'Bug', hidden: true});
    expect(activeOption(field)).toBe(row);
    // The browser reports an entry when the scroll moves the cell under the
    // pointer; no pointer moved.
    fireEvent.mouseEnter(row.children[1]);
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(true);
  });

  it('keeps the action cell’s ring when a hover that waited through ArrowRight lands on the next pointer move', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {
            value: 'bug',
            label: 'Bug',
            action: <button type="button">Edit Bug</button>,
          },
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Labels'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    const row = screen.getByRole('row', {name: 'Bug', hidden: true});
    // The key scrolled the row's option cell under a still pointer.
    fireEvent.mouseEnter(row.children[0]);
    await user.keyboard('{ArrowRight}');
    expect(activeOption(field)).toBe(row.children[1]);
    // The pointer moves: the hover that waited through the key is dropped.
    fireEvent.pointerMove(document, {screenX: 10, screenY: 10});
    fireEvent.pointerMove(document, {screenX: 20, screenY: 20});
    expect(activeOption(field)).toBe(row.children[1]);
    expect(hasRing(row)).toBe(false);
  });

  it('keeps the fill alone when the mouse moves from a grid row’s action cell back onto its option cell', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {
            value: 'bug',
            label: 'Bug',
            action: <button type="button">Edit Bug</button>,
          },
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Labels'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowRight}');
    const row = screen.getByRole('row', {name: 'Bug', hidden: true});
    expect(activeOption(field)).toBe(row.children[1]);
    // A hover without a press: the shared modality still reads keyboard.
    await user.hover(row.children[0]);
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(false);
  });

  it.each(['light', 'dark'] as const)(
    'marks the keyboard-active option at 3:1 or more against the listbox in %s mode',
    async mode => {
      const user = userEvent.setup();
      const field = renderField();
      field.focus();
      await user.keyboard('{ArrowDown}');
      const ring = tokenOf(
        getComputedStyle(activeOption(field)).getPropertyValue('outline-color'),
      );
      expect(ring).not.toBeNull();
      const listbox = resolveThemeToken(null, '--color-background-popover', {
        mode,
      });
      expect(
        contrastRatio(resolveThemeToken(null, ring ?? '', {mode}), listbox),
      ).toBeGreaterThanOrEqual(3);
    },
  );
});
