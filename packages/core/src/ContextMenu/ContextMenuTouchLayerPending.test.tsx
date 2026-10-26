// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchLayerPending.test.tsx
 * @input vitest (jsdom), Testing Library, ContextMenu, a module mock whose
 *   touch layer never finishes loading
 * @output Checks that a finger held before the touch layer attaches still
 *   opens the menu, through today's 500 ms long press
 * @position Testing for ContextMenu.tsx and lazyContextMenuTouchLayer.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import type {ContextMenu as ContextMenuComponent} from './ContextMenu';

// The layer's module never arrives: the page a slow network gives a finger.
vi.mock('./ContextMenuTouchLayer', async () => new Promise(() => {}));

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

it('a finger held before the touch layer attaches still opens the menu at 500 ms', () => {
  vi.useFakeTimers();
  render(
    <ContextMenu items={[{label: 'Item 1'}]} data-testid="touch">
      <div>Hold me</div>
    </ContextMenu>,
  );
  const trigger = screen.getByTestId('touch');
  fireEvent.touchStart(trigger, {
    touches: [{identifier: 1, clientX: 20, clientY: 20}],
  });
  act(() => {
    vi.advanceTimersByTime(499);
  });
  expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
  fireEvent.touchEnd(trigger, {touches: []});
});
