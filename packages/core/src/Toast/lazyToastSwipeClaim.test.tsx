// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazyToastSwipeClaim.test.tsx
 * @input Uses vitest, @testing-library/react, ToastViewport + useToast under a
 *   coarse pointer
 * @output Tests that a touch that starts before the swipe's claim loads stays
 *   the page's, and that the next touch is the swipe's once it loads
 * @position Its own file: Vitest loads each file's modules anew, so the
 *   claim's module is not loaded yet when the first toast shows
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import type {ToastOptions} from './types';

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  vi.mocked(document.hasFocus).mockRestore?.();
  __resetLiveRegionsForTest();
});

// jsdom implements neither the Popover API nor pointer capture.
beforeAll(() => {
  if (typeof HTMLElement.prototype.showPopover === 'undefined') {
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  }
  if (typeof HTMLElement.prototype.setPointerCapture === 'undefined') {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

/** A phone's coarse pointer, under which the gesture host listens for fingers. */
function onTouchScreen(): () => void {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return () => {
    window.matchMedia = original;
  };
}

function ShowToastButton({options}: {options: ToastOptions}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      Trigger
    </button>
  );
}

describe('the swipe claim of the first toast', () => {
  it('leaves a touch that starts before the claim loads to the page, then claims the next', async () => {
    const restorePointer = onTouchScreen();
    onTestFinished(restorePointer);
    const onHide = vi.fn();
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd">
        <ShowToastButton
          options={{body: 'Swipe toast', isAutoHide: false, onHide}}
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const card = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });
    const touchEvent = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      identifier: number,
      clientY: number,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const touch = {identifier, clientX: 10, clientY, target: card};
      Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [touch],
      });
      Object.defineProperty(event, 'changedTouches', {value: [touch]});
      card.dispatchEvent(event);
      return event;
    };

    // The toast shows, and a finger lands before the claim's code arrives.
    act(() => {
      touchEvent('touchstart', 37, 100);
    });
    let move: Event;
    act(() => {
      move = touchEvent('touchmove', 37, 101);
    });
    expect(move!.defaultPrevented).toBe(false);
    act(() => {
      touchEvent('touchmove', 37, 160);
    });
    expect(card.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    act(() => {
      touchEvent('touchend', 37, 160);
    });
    expect(onHide).not.toHaveBeenCalled();

    // Once the claim loads, the next touch toward the edge is the swipe's.
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    act(() => {
      touchEvent('touchstart', 38, 100);
    });
    act(() => {
      move = touchEvent('touchmove', 38, 101);
    });
    expect(move!.defaultPrevented).toBe(true);
    act(() => {
      touchEvent('touchmove', 38, 160);
      touchEvent('touchend', 38, 160);
    });
    expect(onHide).toHaveBeenCalledWith('manual');
  });
});
