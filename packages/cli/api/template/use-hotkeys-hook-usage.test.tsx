// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useHotkeys example registers "/" and "?" on the window: "/" focuses
 * the search field and "?" opens the help dialog, typing either one in the
 * field does not trigger them, and the switch turns both off.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseHotkeysHookUsage from '../../assets/templates/blocks/components/Hooks/useHotkeysHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseHotkeysHookUsage />);
  });
}

function searchInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="text"]');
  if (input == null) {
    throw new Error('no search field rendered');
  }
  return input;
}

function press(
  key: string,
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function isHelpOpen(): boolean {
  return document.querySelector('dialog[open]') != null;
}

beforeEach(() => {
  // This jsdom has no CSS.escape, which Dialog uses to find its title.
  vi.stubGlobal('CSS', {
    escape: (value: string) =>
      value.replace(/[^\w-]/gu, character => `\\${character}`),
  });
  // jsdom does not implement the modal dialog methods.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useHotkeys example', () => {
  it('focuses search on "/" and opens the help on "?"', () => {
    renderExample();
    press('/');
    expect(document.activeElement).toBe(searchInput());
    act(() => searchInput().blur());
    press('?');
    expect(isHelpOpen()).toBe(true);
  });

  it('ignores both keys while typing in the search field', () => {
    renderExample();
    act(() => searchInput().focus());
    expect(press('/', searchInput()).defaultPrevented).toBe(false);
    press('?', searchInput());
    expect(isHelpOpen()).toBe(false);
  });

  it('turns both shortcuts off with the switch', () => {
    renderExample();
    const toggle = container.querySelector<HTMLInputElement>(
      'input[role="switch"], input[type="checkbox"]',
    );
    expect(toggle).not.toBeNull();
    act(() => toggle?.click());
    press('/');
    expect(document.activeElement).not.toBe(searchInput());
    press('?');
    expect(isHelpOpen()).toBe(false);
  });
});
