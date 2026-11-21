// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuLoadScenario.tsx
 * @input Uses Testing Library and TableCellContextMenu's loader
 * @output Exports expectContentSurvivesMenuLoad, a test scenario for a cell
 *   whose context menu loads after its content
 * @position Test-only helper shared by the body-cell and header-cell suites,
 *   which each run it in their own module registry so the menu starts cold
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useEffect, useState, type ReactNode} from 'react';
import {expect, vi} from 'vitest';
import {loadTableContextMenu} from '../TableCellContextMenu';
import type {TableContextAction} from '../types';

export const scenarioActions: TableContextAction[] = [
  {id: 'copy', label: 'Copy', onSelect: () => {}},
  {id: 'paste', label: 'Paste', onSelect: () => {}},
];

const mounts = {count: 0};

/** Cell content with its own state, a mount effect and two focusable parts. */
export function StatefulContent(): ReactNode {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');
  useEffect(() => {
    mounts.count += 1;
  }, []);
  return (
    <>
      <button type="button" onClick={() => setCount(c => c + 1)}>
        Count {count}
      </button>
      <input
        aria-label="Edit"
        value={text}
        onChange={event => setText(event.target.value)}
      />
    </>
  );
}

/** jsdom has no Popover API; mirror the ContextMenu tests' mock. */
export function mockPopover(): void {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
}

/**
 * Renders `cell` while the menu module is still loading. `cell` is a table
 * with one cell that has `scenarioActions` around `<StatefulContent />`. The
 * scenario edits and focuses the content, then lets the menu load. It checks
 * that the content kept its nodes, state and single mount. It then checks
 * that the menu opens from the keyboard (Shift+F10), navigates, and returns
 * focus on Escape.
 *
 * With `invoke: 'before-load'`, the Shift+F10 arrives before the menu loads.
 * The cell holds it, so the browser's menu does not open. The cell's menu
 * opens after the load.
 */
export async function expectContentSurvivesMenuLoad(
  cell: ReactNode,
  focus: 'button' | 'input',
  invoke: 'before-load' | 'after-load',
): Promise<void> {
  mounts.count = 0;
  render(cell);
  const button = screen.getByRole('button', {name: 'Count 0'});
  const input = screen.getByRole('textbox', {name: 'Edit'});
  fireEvent.click(button);
  fireEvent.change(input, {target: {value: 'draft'}});
  const focused = focus === 'button' ? button : input;
  focused.focus();
  // Shift+F10 / the Menu key: a contextmenu at (0, 0) with no click count.
  const openFromKeyboard = () =>
    fireEvent.contextMenu(focused, {clientX: 0, clientY: 0, detail: 0});

  if (invoke === 'before-load') {
    expect(openFromKeyboard()).toBe(false);
    expect(screen.queryByRole('menu', {hidden: true})).toBeNull();
  }

  await act(async () => {
    await loadTableContextMenu();
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(screen.getByRole('button', {name: 'Count 1'})).toBe(button);
  expect(screen.getByRole('textbox', {name: 'Edit'})).toBe(input);
  expect(input).toHaveValue('draft');
  expect(mounts.count).toBe(1);

  if (invoke === 'after-load') {
    expect(focused).toHaveFocus();
    expect(openFromKeyboard()).toBe(false);
  }
  await waitFor(() => {
    expect(
      screen.getByRole('menuitem', {name: 'Copy', hidden: true}),
    ).toHaveFocus();
  });
  fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
    key: 'ArrowDown',
  });
  expect(
    screen.getByRole('menuitem', {name: 'Paste', hidden: true}),
  ).toHaveFocus();
  fireEvent.keyDown(document, {key: 'Escape'});
  expect(focused).toHaveFocus();
}
