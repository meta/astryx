// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Selector} from './Selector';
import {compositeOver, contrastRatio} from '../theme/contrast';
import {resolveThemeToken} from '../theme/tokens';
import {parseColor} from '../utils/color';

const OPTIONS = [
  {value: 'Apple', label: 'Apple'},
  {value: 'Banana', label: 'Banana'},
  {value: 'Cherry', label: 'Cherry'},
];

function renderSelector() {
  render(
    <Selector
      label="Fruit"
      options={OPTIONS}
      value="Apple"
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

/**
 * Contrast of what marks the active option against the listbox it sits on:
 * the ring when the row draws one, else the row's fill over the listbox.
 */
function indicatorContrast(row: HTMLElement, mode: 'light' | 'dark'): number {
  const listbox = resolveThemeToken(null, '--color-background-popover', {
    mode,
  });
  const style = getComputedStyle(row);
  const ringToken = tokenOf(style.getPropertyValue('outline-color'));
  if (ringToken != null) {
    return contrastRatio(resolveThemeToken(null, ringToken, {mode}), listbox);
  }
  const fillToken = tokenOf(style.backgroundColor);
  expect(fillToken).not.toBeNull();
  const fill = parseColor(resolveThemeToken(null, fillToken ?? '', {mode}));
  const backdrop = parseColor(listbox);
  expect(fill).not.toBeNull();
  expect(backdrop).not.toBeNull();
  if (fill == null || backdrop == null) {
    return 0;
  }
  return contrastRatio(compositeOver(fill, backdrop), backdrop);
}

describe('Selector active option indicator', () => {
  it('draws the focus ring inside the active option after keyboard input', async () => {
    const user = userEvent.setup();
    const field = renderSelector();
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

  it('moves to the fill alone when the mouse takes the highlight after keyboard input', async () => {
    const user = userEvent.setup();
    const field = renderSelector();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(hasRing(activeOption(field))).toBe(true);

    // A hover without a press: the shared modality still reads keyboard.
    await user.hover(option('Cherry'));
    const row = activeOption(field);
    expect(row).toHaveTextContent('Cherry');
    expect(hasRing(row)).toBe(false);
    expect(hasRing(option('Banana'))).toBe(false);

    await user.keyboard('{ArrowUp}');
    const back = activeOption(field);
    expect(back).toHaveTextContent('Banana');
    expect(hasRing(back)).toBe(true);
  });

  it('keeps the ring when a key brings the active option under a still mouse', async () => {
    const user = userEvent.setup();
    const field = renderSelector();
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    const row = activeOption(field);
    expect(row).toHaveTextContent('Banana');

    // The browser reports the row under a still pointer as entered when a
    // key scrolls the list. No pointer move happens.
    fireEvent.mouseEnter(row);
    expect(activeOption(field)).toBe(row);
    expect(hasRing(row)).toBe(true);
  });

  it('keeps the fill alone when the options move after the mouse took the highlight', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Fruit'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.hover(option('Cherry'));
    expect(hasRing(activeOption(field))).toBe(false);

    rerender(
      <Selector
        label="Fruit"
        options={[OPTIONS[2], OPTIONS[0], OPTIONS[1]]}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const row = activeOption(field);
    expect(row).toHaveTextContent('Cherry');
    expect(hasRing(row)).toBe(false);
  });

  it('keeps the ring on a keyboard highlight that the options move onto a still mouse’s old row', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Fruit'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    // The browser reports the row under a still pointer as entered while the
    // keyboard move holds the highlight.
    fireEvent.mouseEnter(option('Cherry'));
    expect(activeOption(field)).toHaveTextContent('Banana');

    rerender(
      <Selector
        label="Fruit"
        options={[OPTIONS[0], OPTIONS[2], OPTIONS[1]]}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const row = activeOption(field);
    expect(row).toHaveTextContent('Banana');
    expect(hasRing(row)).toBe(true);
  });

  it('keeps the ring when the follow lands the keyboard highlight on a still mouse’s option', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole('combobox', {name: 'Fruit'});
    field.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    // The row under a still pointer is reported as entered while the keyboard
    // move holds the highlight.
    fireEvent.mouseEnter(option('Cherry'));
    expect(activeOption(field)).toHaveTextContent('Banana');

    // Banana leaves; the highlight follows to Cherry, the next option.
    rerender(
      <Selector
        label="Fruit"
        options={[OPTIONS[0], OPTIONS[2]]}
        value="Apple"
        onChange={() => {}}
      />,
    );
    const row = activeOption(field);
    expect(row).toHaveTextContent('Cherry');
    expect(hasRing(row)).toBe(true);
  });

  // WCAG 2.2 1.4.11: a state indicator needs 3:1 against the listbox it sits
  // on. The overlay fill alone measures about 1.09:1 (light) and 1.15:1
  // (dark).
  it.each(['light', 'dark'] as const)(
    'marks the keyboard-active option at 3:1 or more against the listbox in %s mode',
    async mode => {
      const user = userEvent.setup();
      const field = renderSelector();
      field.focus();
      await user.keyboard('{ArrowDown}');

      expect(
        indicatorContrast(activeOption(field), mode),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps the fill without a ring after pointer input', async () => {
    const user = userEvent.setup();
    const field = renderSelector();
    await user.click(field);
    await user.hover(option('Cherry'));

    const row = activeOption(field);
    expect(row).toHaveTextContent('Cherry');
    expect(hasRing(row)).toBe(false);
  });

  it('draws the ring again when keyboard input follows a pointer highlight', async () => {
    const user = userEvent.setup();
    const field = renderSelector();
    await user.click(field);
    await user.hover(option('Banana'));
    await user.keyboard('{ArrowDown}');

    const row = activeOption(field);
    expect(row).toHaveTextContent('Cherry');
    expect(hasRing(row)).toBe(true);
  });
});
