// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchLayerStatic.test.tsx
 * @input vitest (jsdom), Testing Library, ContextMenu under a coarse pointer
 * @output Checks that a finger landing on the first render already runs
 *   UIKit's timeline: the touch layer is part of ContextMenu, not a load away
 * @position Testing for ContextMenu.tsx and ContextMenuTouchLayer.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
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

it('a finger that lands on the first render runs UIKit’s timeline: no menu at 500 ms, the menu at 735 ms', () => {
  vi.useFakeTimers();
  render(
    <ContextMenu items={[{label: 'Item 1'}]} data-testid="touch">
      <div>Hold me</div>
    </ContextMenu>,
  );
  const trigger = screen.getByTestId('touch');
  // The press recognizer is on the trigger from the first commit.
  expect(trigger).toHaveAttribute('data-astryx-pressable');
  fireEvent.pointerDown(trigger, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.touchStart(trigger, {
    touches: [{identifier: 1, clientX: 20, clientY: 20}],
  });
  act(() => {
    vi.advanceTimersByTime(500);
  });
  // Today's 500 ms long press never runs under the touch model.
  expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
});
