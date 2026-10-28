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
import {dataAttr, stableClassName} from '../naming';
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
  // The factory renders its menu in a root of its own as it attaches.
  let controller: ContextMenuController | undefined;
  act(() => {
    controller = createContextMenu(element, options);
  });
  if (controller == null) {
    throw new Error('createContextMenu returned nothing');
  }
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
/** Whether the menu inside `root` is showing (the popover mocks above). */
const isOpenIn = (root: ParentNode) =>
  root
    .querySelector('[role="menu"]')
    ?.closest('[popover]')
    ?.hasAttribute('popover-open') === true;
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

  it('Home and End jump to the first and last rows (spec:AST-107 FR8)', async () => {
    attach({items: [{label: 'Archive'}, {label: 'Move'}, {label: 'Delete'}]});
    element.focus();
    press(element, 'F10', {shiftKey: true});
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
    press(rows()[0], 'End');
    expect(document.activeElement).toBe(rows()[2]);
    press(rows()[2], 'Home');
    expect(document.activeElement).toBe(rows()[0]);
  });

  it('focus starts on the first enabled row (spec:AST-107 FR8)', async () => {
    attach({items: [{label: 'Archive', isDisabled: true}, {label: 'Delete'}]});
    element.focus();
    press(element, 'F10', {shiftKey: true});
    expect(isOpen()).toBe(true);
    await waitFor(() =>
      expect(document.activeElement?.textContent).toContain('Delete'),
    );
  });

  it("lives inside the element's dialog, where a modal dialog leaves it usable", () => {
    attach({items: [{label: 'Archive'}]});
    // The element moves into a dialog after the menu is attached.
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.append(element);
    rightClick(element);
    expect(isOpen()).toBe(true);
    const host = document.querySelector(`[${dataAttr('context-menu-host')}]`);
    expect(host?.parentElement).toBe(dialog);
    expect(element.contains(host)).toBe(false);
    dialog.remove();
  });

  it("lives inside the element's popover, so opening it leaves that popover open", () => {
    attach({items: [{label: 'Archive'}]});
    const popover = document.createElement('div');
    popover.setAttribute('popover', 'auto');
    document.body.append(popover);
    popover.append(element);
    rightClick(element);
    const host = document.querySelector(`[${dataAttr('context-menu-host')}]`);
    expect(host?.parentElement).toBe(popover);
    popover.remove();
  });

  it("lives inside the element's shadow root, so the menu stays in the element's tree", () => {
    attach({items: [{label: 'Archive'}]});
    const shadowHost = document.createElement('div');
    document.body.append(shadowHost);
    const shadow = shadowHost.attachShadow({mode: 'open'});
    shadow.append(element);
    rightClick(element);
    expect(isOpenIn(shadow)).toBe(true);
    const host = shadow.querySelector(`[${dataAttr('context-menu-host')}]`);
    expect(host?.parentNode).toBe(shadow);
    shadowHost.remove();
  });

  it('a mouse press outside the menu closes it (spec:AST-107 FR8)', () => {
    attach({items: [{label: 'Archive'}]});
    rightClick(element);
    expect(isOpen()).toBe(true);
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', {bubbles: true, cancelable: true}),
      );
    });
    expect(isOpen()).toBe(false);
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

describe('createContextMenu: a finger\u2019s press outside (spec:AST-107 FR8)', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    // The gesture host remembers the latest event time across cases.
    vi.advanceTimersByTime(100_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A finger's press as a browser reports it: pointer, then touch. */
  function fingerDown(target: Element, id: number) {
    const pointer = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 20,
      clientY: 20,
      buttons: 1,
    });
    Object.defineProperty(pointer, 'timeStamp', {value: performance.now()});
    target.dispatchEvent(pointer);
    const touch = {identifier: id, target, clientX: 20, clientY: 20};
    const start = new Event('touchstart', {bubbles: true, cancelable: true});
    Object.defineProperties(start, {
      touches: {value: [touch]},
      targetTouches: {value: [touch]},
      changedTouches: {value: [touch]},
      timeStamp: {value: performance.now()},
    });
    target.dispatchEvent(start);
  }

  it("leaves the menu open through the opening press's own compatibility mousedown, and closes on a later press outside", () => {
    attach({items: [{label: 'Archive'}]});
    act(() => {
      fingerDown(element, 1);
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(isOpen()).toBe(true);
    // The compatibility mousedown the browser sends for the same press.
    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousedown', {bubbles: true, cancelable: true}),
      );
    });
    expect(isOpen()).toBe(true);
    // A new press outside is a new gesture.
    act(() => {
      fingerDown(document.body, 2);
      document.body.dispatchEvent(
        new MouseEvent('mousedown', {bubbles: true, cancelable: true}),
      );
    });
    expect(isOpen()).toBe(false);
  });
});
