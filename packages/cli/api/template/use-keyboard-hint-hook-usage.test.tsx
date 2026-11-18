// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useKeyboardHint example is a star rating that calls the hook itself:
 * keyboard focus entering the stars shows the arrow-key hint once, the first
 * arrow press dismisses it, and coming back does not show it again.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseKeyboardHintHookUsage from '../../assets/templates/blocks/components/Hooks/useKeyboardHintHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;
let outside: HTMLButtonElement;
const showPopover = vi.fn();
const hidePopover = vi.fn();
const {showPopover: originalShow, hidePopover: originalHide} =
  HTMLElement.prototype;

function renderExample(): void {
  outside = document.createElement('button');
  document.body.appendChild(outside);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseKeyboardHintHookUsage />);
  });
}

function stars(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

function pressKey(key: string, init: KeyboardEventInit = {}): boolean {
  let isPrevented = false;
  act(() => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.activeElement?.dispatchEvent(event);
    isPrevented = event.defaultPrevented;
  });
  return isPrevented;
}

function checkedStar(): number {
  return stars().findIndex(
    star => star.getAttribute('aria-checked') === 'true',
  );
}

beforeEach(() => {
  // jsdom has no Popover API; treat every focus as keyboard focus and record
  // the hint's show and hide.
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ':focus-visible' ? true : matches.call(this, selector);
  });
  HTMLElement.prototype.showPopover = showPopover;
  HTMLElement.prototype.hidePopover = hidePopover;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  outside.remove();
  vi.restoreAllMocks();
  HTMLElement.prototype.showPopover = originalShow;
  HTMLElement.prototype.hidePopover = originalHide;
  showPopover.mockReset();
  hidePopover.mockReset();
});

describe('useKeyboardHint example', () => {
  it('shows the arrow-key hint when keyboard focus enters the stars', () => {
    renderExample();
    const hint = container.querySelector('[popover="manual"]');
    expect(hint?.textContent).toContain('to navigate');

    focus(stars()[0]);
    expect(showPopover).toHaveBeenCalledTimes(1);
  });

  it('dismisses the hint on the first arrow press and does not show it again', () => {
    renderExample();
    focus(stars()[0]);
    pressKey('ArrowRight');
    expect(hidePopover).toHaveBeenCalledTimes(1);
    expect(stars()[1]).toBe(document.activeElement);
    expect(stars()[1].getAttribute('aria-checked')).toBe('true');

    focus(outside);
    focus(stars()[1]);
    expect(showPopover).toHaveBeenCalledTimes(1);
  });

  it('stops at both ends instead of wrapping, and the rating follows focus', () => {
    renderExample();
    focus(stars()[0]);
    for (let i = 0; i < 6; i++) {
      pressKey('ArrowRight');
    }
    expect(stars()[4]).toBe(document.activeElement);
    expect(checkedStar()).toBe(4);

    for (let i = 0; i < 6; i++) {
      pressKey('ArrowLeft');
    }
    expect(stars()[0]).toBe(document.activeElement);
    expect(checkedStar()).toBe(0);
  });

  it('keeps one Tab stop on the checked star', () => {
    renderExample();
    focus(stars()[0]);
    pressKey('ArrowRight');
    pressKey('ArrowRight');
    expect(stars().map(star => star.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  it('follows the arrows visually in right-to-left', () => {
    renderExample();
    container.querySelector<HTMLElement>(
      '[role="radiogroup"]',
    )!.style.direction = 'rtl';
    focus(stars()[0]);
    pressKey('ArrowLeft');
    expect(stars()[1]).toBe(document.activeElement);
    expect(checkedStar()).toBe(1);
  });

  it('leaves an arrow pressed with a modifier to the browser', () => {
    renderExample();
    focus(stars()[0]);
    expect(pressKey('ArrowRight', {altKey: true})).toBe(false);
    expect(stars()[0]).toBe(document.activeElement);
    expect(checkedStar()).toBe(-1);
  });
});
