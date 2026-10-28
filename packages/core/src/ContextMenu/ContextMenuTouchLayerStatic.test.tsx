// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchLayerStatic.test.tsx
 * @input vitest (jsdom), Testing Library, ContextMenu under a coarse pointer
 * @output Checks that a finger landing on the first render already runs the
 *   touch model: the touch layer is part of ContextMenu, not a load away
 * @position Testing for ContextMenu.tsx and ContextMenuTouchLayer.tsx
 */

import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import {LONG_PRESS_DURATION_MS} from '../motion/uikit/longPress';
import type {ContextMenu as ContextMenuComponent} from './ContextMenu';

let ContextMenu: typeof ContextMenuComponent;

// A cold import transforms ContextMenu's whole module graph; allow for it.
beforeAll(async () => {
  ({ContextMenu} = await import('./ContextMenu'));
}, 120000);

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn();
  HTMLElement.prototype.hidePopover = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('a finger that lands on the first render runs the touch model: the press recognizer is on the trigger, and the menu opens at the long press', () => {
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
  render(
    <ContextMenu items={[{label: 'Item 1'}]} data-testid="touch">
      <div>Hold me</div>
    </ContextMenu>,
  );
  const trigger = screen.getByTestId('touch');
  // The press recognizer is on the trigger from the first commit.
  expect(trigger).toHaveAttribute('data-astryx-pressable');
  act(() => {
    const pointer = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 20,
      clientY: 20,
      buttons: 1,
    });
    Object.defineProperty(pointer, 'timeStamp', {value: performance.now()});
    trigger.dispatchEvent(pointer);
    const touch = {identifier: 1, target: trigger, clientX: 20, clientY: 20};
    const start = new Event('touchstart', {bubbles: true, cancelable: true});
    Object.defineProperties(start, {
      touches: {value: [touch]},
      targetTouches: {value: [touch]},
      changedTouches: {value: [touch]},
      timeStamp: {value: performance.now()},
    });
    trigger.dispatchEvent(start);
  });
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_DURATION_MS - 1);
  });
  expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
});
