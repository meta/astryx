// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useLongPress example pairs touch press-and-hold with a pointer
 * contextmenu handler and an explicit Actions button: holding a finger past
 * 500ms opens the action menu at the touch point, lifting early or moving away
 * cancels it, right-click opens it at the pointer coordinates, and the fallback
 * button keeps every action reachable with a standard click.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseLongPressHookUsage from '../../assets/templates/blocks/components/Hooks/useLongPressHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseLongPressHookUsage />);
  });
}

function getSurface(): HTMLElement {
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="long-press-surface"]',
  );
  if (!surface) {
    throw new Error('Expected long-press surface element');
  }
  return surface;
}

function dispatchTouch(
  target: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Array<{clientX: number; clientY: number}> = [],
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'touches', {value: touches});
  act(() => {
    target.dispatchEvent(event);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.useRealTimers();
});

describe('useLongPressHookUsage example', () => {
  it('opens the action menu at the touch point after a 500ms hold', () => {
    renderExample();
    const surface = getSurface();

    expect(container.querySelector('[role="menu"]')).toBeNull();

    dispatchTouch(surface, 'touchstart', [{clientX: 120, clientY: 64}]);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain('Opened by long press at (120, 64)');
    expect(menu?.style.left).toBe('120px');
    expect(menu?.style.top).toBe('64px');
  });

  it('cancels the pending long press on early lift or movement beyond 10px', () => {
    renderExample();
    const surface = getSurface();

    // Lifting before the 500ms threshold cancels the press.
    dispatchTouch(surface, 'touchstart', [{clientX: 40, clientY: 50}]);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    dispatchTouch(surface, 'touchend');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();

    // Moving further than 10px treats the gesture as a scroll/drag and cancels.
    dispatchTouch(surface, 'touchstart', [{clientX: 40, clientY: 50}]);
    dispatchTouch(surface, 'touchmove', [{clientX: 60, clientY: 50}]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens at pointer coordinates on contextmenu and triggers actions via menu buttons', () => {
    renderExample();
    const surface = getSurface();

    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 88,
      clientY: 36,
    });
    act(() => {
      surface.dispatchEvent(contextEvent);
    });

    expect(contextEvent.defaultPrevented).toBe(true);
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.textContent).toContain('Opened by right-click at (88, 36)');

    const pinButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Pin draft');
    expect(pinButton).toBeDefined();
    act(() => {
      pinButton?.click();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.textContent).toContain('Pinned');
    expect(container.textContent).toContain('Pinned via right-click (88, 36).');
  });

  it('provides an explicit Actions button fallback for click and keyboard users', () => {
    renderExample();

    const actionsButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Actions');
    expect(actionsButton).toBeDefined();
    expect(actionsButton?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      actionsButton?.click();
    });

    expect(actionsButton?.getAttribute('aria-expanded')).toBe('true');
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain('Opened by button');

    const copyButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Copy link');
    act(() => {
      copyButton?.click();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.textContent).toContain('Copied link via button');
  });
});
