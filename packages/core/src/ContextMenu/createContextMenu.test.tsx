// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createContextMenu.test.tsx
 * @input vitest (jsdom), createContextMenu on a plain element with no React
 *   around it
 * @output Checks the headless context menu's contract (spec:AST-107 FR8): it
 *   opens ContextMenu's own menu on the element's context request (a right
 *   click, Shift+F10) or open(at), focuses its first row as ContextMenu does,
 *   closes on Escape, a choice or close(), returns focus, renders a plain-JS
 *   `render` callback's content, registers nothing while disabled, and
 *   destroy removes it all
 * @position Testing for createContextMenu.tsx
 */

import {act, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {stableClassName} from '../naming';
import {
  createContextMenu,
  type ContextMenuController,
} from './createContextMenu';

let element: HTMLElement;
let controllers: ContextMenuController[] = [];

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
  element = document.createElement('div');
  element.tabIndex = 0;
  element.textContent = 'Inbox';
  document.body.append(element);
});

afterEach(() => {
  act(() => {
    for (const controller of controllers) {
      controller.destroy();
    }
  });
  controllers = [];
  element.remove();
  vi.restoreAllMocks();
});

function attach(
  options: Parameters<typeof createContextMenu>[1],
): ContextMenuController {
  const controller = createContextMenu(element, options);
  controllers.push(controller);
  return controller;
}

function rightClick(target: Element, x = 40, y = 50): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 2,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
/** Whether the menu's popover is showing (the popover mocks above). */
const isOpen = () =>
  menu()?.closest('[popover]')?.hasAttribute('popover-open') === true;
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

describe('createContextMenu', () => {
  it('opens on a right click, keeps the browser menu off, and reports the open', () => {
    const onOpenChange = vi.fn();
    attach({
      label: 'Inbox actions',
      onOpenChange,
      items: [{label: 'Archive'}, {label: 'Delete'}],
    });
    const event = rightClick(element);
    expect(event.defaultPrevented).toBe(true);
    expect(menu()?.getAttribute('aria-label')).toBe('Inbox actions');
    expect(rows().map(row => row.textContent)).toEqual(['Archive', 'Delete']);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("is ContextMenu's own menu, with ContextMenu's theme class", () => {
    attach({items: [{label: 'Archive'}]});
    rightClick(element);
    expect(menu()?.classList.contains(stableClassName('context-menu'))).toBe(
      true,
    );
  });

  it('a right click focuses the first row, as ContextMenu does', async () => {
    attach({items: [{label: 'Archive'}, {label: 'Delete'}]});
    rightClick(element);
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
  });

  it('Shift+F10 opens it with the first row focused', async () => {
    attach({items: [{label: 'Archive'}, {label: 'Delete'}]});
    element.focus();
    press(element, 'F10', {shiftKey: true});
    expect(isOpen()).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
  });

  it('the arrow keys move between rows, and Escape closes it and returns focus', async () => {
    const onOpenChange = vi.fn();
    attach({onOpenChange, items: [{label: 'Archive'}, {label: 'Delete'}]});
    element.focus();
    press(element, 'ContextMenu');
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
    press(rows()[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    press(rows()[1], 'Escape');
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(element);
  });

  it('choosing a row runs it and closes the menu', async () => {
    const onArchive = vi.fn();
    attach({items: [{label: 'Archive', onClick: onArchive}]});
    rightClick(element);
    await userEvent.setup().click(rows()[0]);
    expect(onArchive).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('a click inside the menu never reaches the element it is attached to', () => {
    const onElementClick = vi.fn();
    element.addEventListener('click', onElementClick);
    attach({items: [{label: 'Archive'}]});
    rightClick(element);
    act(() => {
      rows()[0].click();
    });
    expect(onElementClick).not.toHaveBeenCalled();
  });

  it('open(at) and close() drive it without a request', () => {
    const onOpenChange = vi.fn();
    const controller = attach({onOpenChange, items: [{label: 'Archive'}]});
    act(() => {
      controller.open({x: 10, y: 20});
    });
    expect(isOpen()).toBe(true);
    act(() => {
      controller.close();
    });
    expect(isOpen()).toBe(false);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('fills the menu through `render` in plain DOM, and runs its cleanup on close', () => {
    const cleanup = vi.fn();
    const controller = attach({
      render: container => {
        const button = document.createElement('button');
        button.setAttribute('role', 'menuitem');
        button.textContent = 'Custom';
        container.append(button);
        return cleanup;
      },
    });
    rightClick(element);
    expect(rows().map(row => row.textContent)).toEqual(['Custom']);
    act(() => {
      controller.close();
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('registers nothing while disabled: the browser keeps its own menu', () => {
    attach({isDisabled: true, items: [{label: 'Archive'}]});
    const event = rightClick(element);
    expect(event.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('destroy closes it and removes everything it added', () => {
    const before = document.body.childElementCount;
    const controller = attach({items: [{label: 'Archive'}]});
    rightClick(element);
    act(() => {
      controller.destroy();
    });
    expect(isOpen()).toBe(false);
    expect(document.body.childElementCount).toBe(before);
    const event = rightClick(element);
    expect(event.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);
  });
});
